import json
import os
from pathlib import Path

from app.analyze import analyze_input
from app.assess import (
    build_analysis_paragraph,
    composite_score,
    information_status,
    load_templates,
)
from app.query import build_query
from app.retrieval import get_sources
from app.schemas import AnalyzeRequest, AnalyzeResponse, Source

# The sample file sits next to this script.
SAMPLE_PATH = Path(__file__).parent / "sample_response.json"


# Read the fixed sample answer from disk and turn it into a response model.
def load_sample_response() -> AnalyzeResponse:
    with open(SAMPLE_PATH, encoding="utf-8") as file:
        data = json.load(file)
    return AnalyzeResponse(**data)


# Run the whole analysis: classify the text, get scored sources, decide the status.
# Set INFOLENS_USE_SAMPLE=1 to get the fixed sample instead (no API keys or models needed).
def run_pipeline(request: AnalyzeRequest) -> AnalyzeResponse:
    if os.getenv("INFOLENS_USE_SAMPLE") == "1":
        return load_sample_response()

    notices = []
    if request.image_base64:
        notices.append("The image was ignored: image analysis is not available yet.")

    # Process 2.0: content type, tone, entities, keywords.
    profile = analyze_input(request)

    # Process 3.0 (Velado): live search with saved-sample fallback, authority and similarity.
    # To use Segundine's tiers later, pass get_tier=... here.
    retrieved = get_sources(build_query(profile), profile["text"])
    if retrieved["notice"]:
        notices.append(retrieved["notice"])
    if retrieved["similarity_mode"] == "fixed":
        notices.append("The similarity model was not available, so a fixed similarity of 0.5 was used.")

    # Process 4.0: composite score, status, paragraph.
    composite = composite_score(retrieved["avg_authority"], retrieved["avg_similarity"], profile["tone_score"])
    status = information_status(composite, retrieved["result_count"], retrieved["contradiction"])

    # Best source first: highest authority, then highest similarity.
    sources = sorted(retrieved["sources"], key=lambda s: (-s["authority_score"], -s["similarity"]))
    paragraph = build_analysis_paragraph(
        status, profile["content_type"], profile["content_tone"], sources, load_templates()
    )

    return AnalyzeResponse(
        content_type=profile["content_type"],
        content_tone=profile["content_tone"],
        information_status=status,
        analysis_paragraph=paragraph,
        sources=[Source(title=s["title"], url=s["url"], domain=s["domain"], tier=s["tier"]) for s in sources],
        notice=" ".join(notices) or None,
    )