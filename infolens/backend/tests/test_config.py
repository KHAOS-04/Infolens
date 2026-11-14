"""Phase 0 checks: the key is optional, never leaks, and defaults are correct."""

from app import config


def test_missing_key_does_not_crash(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    s = config.load_settings()
    assert s.has_tavily_key is False


def test_placeholder_key_counts_as_missing(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "your-tavily-api-key-here")
    assert config.load_settings().has_tavily_key is False


def test_key_is_read_from_environment(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "FAKE-TEST-KEY-123")
    assert config.load_settings().has_tavily_key is True


def test_key_never_appears_in_repr_or_summary(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "FAKE-TEST-KEY-123")
    s = config.load_settings()
    assert "FAKE-TEST-KEY" not in repr(s)
    assert "FAKE-TEST-KEY" not in str(s)
    assert "FAKE-TEST-KEY" not in str(s.public_summary())


def test_defaults_match_the_thesis(monkeypatch):
    for name in ("INFOLENS_RELEVANCE_THRESHOLD", "INFOLENS_REFUTATION_MIN_SOURCES",
                 "INFOLENS_TAVILY_MAX_RESULTS"):
        monkeypatch.delenv(name, raising=False)
    s = config.load_settings()
    assert s.tavily_search_depth == "basic"
    assert s.tavily_max_results == 5
    assert s.relevance_threshold == 0.40
    assert s.refutation_min_sources == 2
    assert s.min_text_chars == 10 and s.max_text_chars == 5000
    assert s.max_image_bytes == 5 * 1024 * 1024


def test_bad_number_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("INFOLENS_RELEVANCE_THRESHOLD", "not-a-number")
    assert config.load_settings().relevance_threshold == 0.40
