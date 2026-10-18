"""Source authority and semantic similarity (Process 3.0, Table V and the similarity paragraph)."""
from urllib.parse import urlparse

from app.contradiction import has_contradiction_cue

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
_model = None


# Load the sentence-transformer once, on first use (tests monkeypatch this so nothing downloads).
def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


# Cosine similarity of the content against each snippet, via sentence_transformers.util.cos_sim.
def _cosine_scores(content_text: str, snippets: list[str]) -> list[float]:
    from sentence_transformers import util
    model = _get_model()
    content_vec = model.encode(content_text, convert_to_tensor=True)
    snippet_vecs = model.encode(snippets, convert_to_tensor=True)
    return [float(s) for s in util.cos_sim(content_vec, snippet_vecs)[0]]


# Clamp a number to 0.0 to 1.0.
def _clamp(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


# Lowercase host with a leading "www." removed.
def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


# Add "tier" and "authority_score" to each result using get_tier(domain) -> (tier, score).
def authority_scores(results: list[dict], get_tier) -> list[dict]:
    out = []
    for r in results:
        domain = r.get("domain") or domain_of(r.get("url", ""))
        tier, score = get_tier(domain) if domain else (5, 0.3)
        out.append({**r, "domain": domain, "tier": tier, "authority_score": score})
    return out


# Add "similarity" (0.0 to 1.0) to each result by comparing its snippet with the content.
def similarity_scores(content_text: str, results: list[dict]) -> list[dict]:
    if not results:
        return []
    scores = _cosine_scores(content_text, [r.get("snippet", "") for r in results])
    return [{**r, "similarity": _clamp(s)} for r, s in zip(results, scores)]


# Score all sources and return what Process 4.0 needs (Scored Source List).
def score_sources(content_text: str, results: list[dict], get_tier) -> dict:
    if not results:
        return {"sources": [], "result_count": 0, "avg_authority": 0.0, "avg_similarity": 0.0, "contradiction": False}
    scored = similarity_scores(content_text, authority_scores(results, get_tier))
    n = len(scored)
    return {
        "sources": scored,
        "result_count": n,
        "avg_authority": _clamp(sum(r["authority_score"] for r in scored) / n),
        "avg_similarity": _clamp(sum(r["similarity"] for r in scored) / n),
        "contradiction": has_contradiction_cue(scored),
    }
