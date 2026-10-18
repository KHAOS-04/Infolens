import pytest
from app import retrieval as r
from app.search import QuotaExceededError
from app.simple_tiers import get_tier


@pytest.mark.parametrize("domain,expected", [
    ("doh.gov.ph", (1, 1.0)), ("www.WHO.int", (1, 1.0)), ("lgu.gov.ph", (1, 1.0)),
    ("news.reuters.com", (2, 0.8)), ("ateneo.edu.ph", (2, 0.8)), ("mit.edu", (2, 0.8)),
    ("inquirer.net", (3, 0.7)), ("en.wikipedia.org", (4, 0.5)),
    ("myblog.com", (5, 0.3)), ("doh.gov.ph.evil.com", (5, 0.3)), ("", (5, 0.3)),
])
def test_get_tier(domain, expected):
    assert get_tier(domain) == expected


def test_falls_back_to_sample_when_search_fails(monkeypatch):
    def boom(q, n): raise QuotaExceededError("quota")
    monkeypatch.setattr(r, "search", boom)
    out = r.get_sources("dengue cases")
    assert out["source_mode"] == "sample" and out["result_count"] == 5


def test_fixed_similarity_when_model_missing(monkeypatch):
    monkeypatch.setattr(r, "search", lambda q, n: [{"title": "t", "url": "https://doh.gov.ph/x", "domain": "doh.gov.ph", "snippet": "s"}])
    def nomodel(*a, **k): raise ImportError("no model")
    monkeypatch.setattr(r, "score_sources", nomodel)
    out = r.get_sources("x")
    assert out["similarity_mode"] == "fixed" and out["sources"][0]["similarity"] == 0.5
    assert out["sources"][0]["authority_score"] == 1.0
