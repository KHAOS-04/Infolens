import httpx
import pytest
from app import search as s


@pytest.fixture(autouse=True)
def tmpdb(tmp_path, monkeypatch):
    monkeypatch.setenv("INFOLENS_CACHE_DB", str(tmp_path / "c.db"))


def test_repeated_query_uses_one_api_call(monkeypatch):
    calls = []
    def fake(q, n):
        calls.append(q)
        return [{"title": "T", "url": "https://www.DOH.gov.ph/x", "snippet": "S"}]
    monkeypatch.setattr(s, "_call_provider", fake)
    a = s.search("Dengue Cases ")
    b = s.search("dengue cases")
    assert len(calls) == 1 and a == b
    assert a[0]["domain"] == "doh.gov.ph"


def test_warning_at_80(monkeypatch, capsys):
    monkeypatch.setattr(s, "_call_provider", lambda q, n: [])
    for i in range(80):
        s.search(f"q{i}")
    assert "WARNING" in capsys.readouterr().out


def test_missing_keys(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_CSE_ID", raising=False)
    with pytest.raises(s.MissingKeysError):
        s.search("anything")


@pytest.mark.parametrize("code", [429, 403])
def test_quota(monkeypatch, code):
    monkeypatch.setenv("GOOGLE_API_KEY", "k"); monkeypatch.setenv("GOOGLE_CSE_ID", "c")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(code))
    with pytest.raises(s.QuotaExceededError):
        s.search("x")


def test_network_error(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "k"); monkeypatch.setenv("GOOGLE_CSE_ID", "c")
    def boom(*a, **k): raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "get", boom)
    with pytest.raises(s.SearchNetworkError):
        s.search("x")


def test_parses_provider_json(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "k"); monkeypatch.setenv("GOOGLE_CSE_ID", "c")
    body = {"items": [{"title": "A", "link": "https://who.int/a", "snippet": "s"}]}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=body))
    r = s.search("covid")
    assert r == [{"title": "A", "url": "https://who.int/a", "domain": "who.int", "snippet": "s"}]
