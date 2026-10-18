import pytest

from app import pipeline
from app.schemas import AnalyzeRequest

FAKE_PROFILE = {
    "text": "DOH says dengue cases are rising in Manila.",
    "entities": [{"text": "DOH", "label": "ORG"}, {"text": "Manila", "label": "GPE"}],
    "keywords": ["dengue", "case", "rise"],
    "content_type": "Health Claim",
    "content_tone": "Neutral",
    "tone_score": 1.0,
}

# What Velado's get_sources returns (3 scored sources, in a mixed order).
FAKE_SOURCES = [
    {"title": "Blog", "url": "https://myblog.com/a", "domain": "myblog.com", "tier": 5, "authority_score": 0.3, "similarity": 0.1},
    {"title": "DOH", "url": "https://doh.gov.ph/a", "domain": "doh.gov.ph", "tier": 1, "authority_score": 1.0, "similarity": 0.9},
    {"title": "News", "url": "https://news.example.com/a", "domain": "news.example.com", "tier": 5, "authority_score": 0.3, "similarity": 0.9},
]

REQUEST = AnalyzeRequest(text=FAKE_PROFILE["text"])


# Build a get_sources-style result. Averages are 0.533 authority and 0.633 similarity.
def make_retrieved(**changes):
    result = {
        "sources": FAKE_SOURCES,
        "result_count": 3,
        "avg_authority": 1.6 / 3,
        "avg_similarity": 1.9 / 3,
        "contradiction": False,
        "source_mode": "live",
        "similarity_mode": "model",
        "notice": None,
    }
    result.update(changes)
    return result


# Replace spaCy/VADER and Velado's get_sources. Calls are recorded in the "calls" list.
@pytest.fixture
def wired(monkeypatch):
    calls = []
    monkeypatch.delenv("INFOLENS_USE_SAMPLE", raising=False)
    monkeypatch.setattr(pipeline, "analyze_input", lambda request: FAKE_PROFILE)

    def fake_get_sources(query, content_text="", **kwargs):
        calls.append((query, content_text))
        return make_retrieved()

    monkeypatch.setattr(pipeline, "get_sources", fake_get_sources)
    return calls


# Full flow. Composite 0.4*0.533 + 0.3*0.633 + 0.3*1.0 = 0.703 -> Supported.
def test_full_flow(wired):
    response = pipeline.run_pipeline(REQUEST)
    assert response.content_type == "Health Claim"
    assert response.content_tone == "Neutral"
    assert response.information_status == "Supported"
    assert response.notice is None
    assert len(response.sources) == 3


# get_sources receives the built query and the original text.
def test_get_sources_arguments(wired):
    pipeline.run_pipeline(REQUEST)
    query, content_text = wired[0]
    assert query == "DOH Manila dengue case rise"
    assert content_text == FAKE_PROFILE["text"]


# Sources come back best first (authority, then similarity) with the four public fields.
def test_sources_sorted_and_mapped(wired):
    response = pipeline.run_pipeline(REQUEST)
    assert [s.domain for s in response.sources] == ["doh.gov.ph", "news.example.com", "myblog.com"]
    assert response.sources[0].tier == 1
    assert response.sources[0].title == "DOH"
    assert response.sources[0].url == "https://doh.gov.ph/a"


# The paragraph is built from the status template and names the top source.
def test_paragraph_uses_top_source(wired):
    response = pipeline.run_pipeline(REQUEST)
    assert "doh.gov.ph" in response.analysis_paragraph
    assert "Health Claim" not in response.analysis_paragraph   # content type is shown separately
    assert "Neutral" not in response.analysis_paragraph


# Fewer than 3 results means "Recent or Not Yet Widely Confirmed".
def test_too_few_results(wired, monkeypatch):
    two = make_retrieved(sources=FAKE_SOURCES[:2], result_count=2)
    monkeypatch.setattr(pipeline, "get_sources", lambda query, content_text="", **k: two)
    response = pipeline.run_pipeline(REQUEST)
    assert response.information_status == "Recent or Not Yet Widely Confirmed"
    assert len(response.sources) == 2


# Velado's "saved sample results" notice is passed on to the response.
def test_sample_fallback_notice_is_passed_on(wired, monkeypatch):
    fallback = make_retrieved(source_mode="sample", notice="Using saved sample results: no keys")
    monkeypatch.setattr(pipeline, "get_sources", lambda query, content_text="", **k: fallback)
    response = pipeline.run_pipeline(REQUEST)
    assert "saved sample results" in response.notice


# When the similarity model is missing (fixed 0.5), the notice says so.
def test_fixed_similarity_notice(wired, monkeypatch):
    stub = make_retrieved(similarity_mode="fixed", avg_similarity=0.5)
    monkeypatch.setattr(pipeline, "get_sources", lambda query, content_text="", **k: stub)
    response = pipeline.run_pipeline(REQUEST)
    assert "fixed similarity" in response.notice


# An uploaded image is not analyzed yet, and the notice says so.
def test_image_is_reported_as_ignored(wired):
    request = AnalyzeRequest(text=FAKE_PROFILE["text"], image_base64="abc")
    response = pipeline.run_pipeline(request)
    assert "image" in response.notice.lower()


# Sample mode returns the fixed sample and never touches retrieval or models.
def test_sample_mode(monkeypatch):
    monkeypatch.setenv("INFOLENS_USE_SAMPLE", "1")
    def should_not_run(*args, **kwargs):
        raise AssertionError("pipeline ran in sample mode")
    monkeypatch.setattr(pipeline, "analyze_input", should_not_run)
    response = pipeline.run_pipeline(REQUEST)
    assert response.content_type == "news_article"