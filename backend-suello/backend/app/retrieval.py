"""Process 3.0 entry point for the connect stage: get_sources(query, content_text) -> Scored Source List.
Live search first; if search fails (no key, quota, network), falls back to sample_results.json and says so.
Similarity: real model if it loads, otherwise a fixed 0.5 (stub, reported in similarity_mode)."""
import json
from pathlib import Path

from app.scoring import authority_scores, domain_of, score_sources
from app.search import SearchError, search
from app.simple_tiers import get_tier as default_get_tier

SAMPLE_FILE = Path(__file__).parent / "sample_results.json"
FIXED_SIMILARITY = 0.5


# Load the 5 saved results, adding a domain to each.
def _load_sample(num: int) -> list[dict]:
    with open(SAMPLE_FILE, encoding="utf-8") as f:
        items = json.load(f)
    return [{**r, "domain": domain_of(r["url"])} for r in items[:num]]


# Return up to num results with title, url, domain, tier, authority_score, similarity,
# plus result_count, avg_authority, avg_similarity, contradiction, source_mode and similarity_mode.
def get_sources(query: str, content_text: str = "", num: int = 5, get_tier=default_get_tier) -> dict:
    source_mode, notice = "live", None
    try:
        results = search(query, num)
    except SearchError as exc:
        results, source_mode, notice = _load_sample(num), "sample", f"Using saved sample results: {exc}"

    similarity_mode = "model"
    try:
        out = score_sources(content_text or query, results, get_tier)
    except Exception:  # model missing or not downloaded yet: use the fixed stub
        similarity_mode = "fixed"
        scored = [{**r, "similarity": FIXED_SIMILARITY} for r in authority_scores(results, get_tier)]
        n = len(scored)
        out = {
            "sources": scored,
            "result_count": n,
            "avg_authority": sum(r["authority_score"] for r in scored) / n if n else 0.0,
            "avg_similarity": FIXED_SIMILARITY if n else 0.0,
            "contradiction": False,
        }
    out.update({"source_mode": source_mode, "similarity_mode": similarity_mode, "notice": notice})
    return out


# Print the results with scores: python -m app.retrieval "dengue cases Philippines"
if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) or "dengue cases Philippines"
    res = get_sources(q)
    print(f"mode={res['source_mode']} similarity={res['similarity_mode']} count={res['result_count']}")
    for r in res["sources"]:
        print(f"- {r['title'][:50]} | {r['domain']} | tier {r['tier']} | auth {r['authority_score']} | sim {r['similarity']:.2f}")
    print(f"avg_authority={res['avg_authority']:.2f} avg_similarity={res['avg_similarity']:.2f}")
