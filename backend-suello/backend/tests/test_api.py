from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# /health should answer with {"status": "ok"}.
def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# /analyze should return the fixed sample with all expected fields.
def test_analyze_returns_sample():
    payload = {"text": "Some claim to check", "image_base64": None, "language_hint": "en"}
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["content_type"] == "news_article"
    assert len(data["sources"]) == 2
    assert set(data["sources"][0]) == {"title", "url", "domain", "tier"}


# A request with the wrong data type should be rejected with 422.
def test_analyze_rejects_bad_input():
    response = client.post("/analyze", json={"text": 123, "language_hint": ["x"]})
    assert response.status_code == 422