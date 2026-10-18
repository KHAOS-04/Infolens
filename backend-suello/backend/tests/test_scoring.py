import pytest
from app import scoring as sc


def fake_tier(d):
    if d.endswith(".gov.ph"): return (1, 1.0)
    return (5, 0.3)


@pytest.fixture
def fake_sim(monkeypatch):
    # No model download: similarity 0.9 if snippet mentions "dengue", else 0.1; one out-of-range value to test clamping.
    def fake(content, snippets):
        return [1.4 if s == "OVER" else (0.9 if "dengue" in s else 0.1) for s in snippets]
    monkeypatch.setattr(sc, "_cosine_scores", fake)


def test_domain_of():
    assert sc.domain_of("https://WWW.DOH.gov.ph/page") == "doh.gov.ph"
    assert sc.domain_of("not a url") == ""


def test_authority_gov_higher_than_blog():
    r = sc.authority_scores([{"url": "https://doh.gov.ph/a"}, {"url": "https://myblog.com/a"}], fake_tier)
    assert r[0]["authority_score"] > r[1]["authority_score"] and r[1]["tier"] == 5


def test_similarity_relevant_beats_unrelated(fake_sim):
    r = sc.similarity_scores("dengue cases", [{"snippet": "dengue update"}, {"snippet": "cake recipe"}])
    assert r[0]["similarity"] > r[1]["similarity"]


def test_similarity_clamped(fake_sim):
    assert sc.similarity_scores("x", [{"snippet": "OVER"}])[0]["similarity"] == 1.0


def test_score_sources(fake_sim):
    res = [{"title": "a", "url": "https://doh.gov.ph/a", "snippet": "dengue"},
           {"title": "b", "url": "https://blog.com/b", "snippet": "cake"}]
    out = sc.score_sources("dengue", res, fake_tier)
    assert out["result_count"] == 2
    assert out["avg_authority"] == pytest.approx(0.65)
    assert out["avg_similarity"] == pytest.approx(0.5)
    assert out["contradiction"] is False


def test_empty_results():
    assert sc.score_sources("x", [], fake_tier) == {"sources": [], "result_count": 0, "avg_authority": 0.0, "avg_similarity": 0.0, "contradiction": False}
