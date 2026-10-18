import json
import math
from pathlib import Path

# ---------------------------------------------------------------------------
# Editable settings.
# ---------------------------------------------------------------------------

# Weights for the composite score. They add up to 1.0.
AUTHORITY_WEIGHT = 0.40
SIMILARITY_WEIGHT = 0.30
TONE_WEIGHT = 0.30

# Fewer results than this means "too early to say".
MIN_RESULT_COUNT = 3

# Composite score cut-offs (a score equal to the cut-off counts as that level).
SUPPORTED_MIN = 0.70
PARTIAL_MIN = 0.50
LIMITED_MIN = 0.30

# Status names. Keep them identical to the keys in templates.json.
STATUS_RECENT = "Recent or Not Yet Widely Confirmed"
STATUS_SUPPORTED = "Supported"
STATUS_PARTIAL = "Partially Supported"
STATUS_LIMITED = "Limited Evidence"
STATUS_NOT_SUPPORTED = "Not Supported"

# Used for {top_source_domain} when there are no sources.
NO_SOURCE_TEXT = "none"

# The templates file sits next to this script.
TEMPLATES_PATH = Path(__file__).parent / "templates.json"


# Force a number into the range 0.0 to 1.0. NaN is rejected because it cannot be clamped.
def _clamp(value: float) -> float:
    if math.isnan(value):
        raise ValueError("score must be a number, not NaN")
    return max(0.0, min(1.0, value))


# Combine three 0-1 scores into one weighted score, rounded to 3 decimals.
def composite_score(avg_authority: float, avg_similarity: float, tone_score: float) -> float:
    authority = _clamp(avg_authority)
    similarity = _clamp(avg_similarity)
    tone = _clamp(tone_score)
    total = AUTHORITY_WEIGHT * authority + SIMILARITY_WEIGHT * similarity + TONE_WEIGHT * tone
    return round(total, 3)


# Turn the composite score into a status label. The rules run in order; the first match wins.
def information_status(composite: float, result_count: int, contradiction: bool) -> str:
    if result_count < MIN_RESULT_COUNT:
        return STATUS_RECENT
    if composite >= SUPPORTED_MIN:
        return STATUS_SUPPORTED
    if composite >= PARTIAL_MIN:
        return STATUS_PARTIAL
    if composite >= LIMITED_MIN:
        return STATUS_LIMITED
    # Here the composite is below LIMITED_MIN.
    if contradiction:
        return STATUS_NOT_SUPPORTED
    # TODO: temporary rule. A weak score with no contradiction is "Limited Evidence" for now.
    # Revisit this once we know how the contradiction check behaves on real data.
    return STATUS_LIMITED


# Read the paragraph templates (a dict of status -> template text) from templates.json.
def load_templates() -> dict:
    with open(TEMPLATES_PATH, encoding="utf-8") as file:
        return json.load(file)


# Fill the template for this status. Each source is a dict with a "domain" key.
# The first source in the list is treated as the top source.
def build_analysis_paragraph(
    status: str,
    content_type: str,
    content_tone: str,
    sources: list[dict],
    templates: dict,
) -> str:
    if status not in templates:
        raise ValueError(f"No template for status: {status!r}")

    if sources:
        top_source_domain = sources[0]["domain"]
    else:
        top_source_domain = NO_SOURCE_TEXT

    return templates[status].format(
        content_type=content_type,
        content_tone=content_tone,
        source_count=len(sources),
        top_source_domain=top_source_domain,
    )


# Placeholder (unchanged): later this will compare the claim against trusted sources
# (using sentence-transformers and httpx) and call the functions above.
def assess_information(text: str) -> dict:
    return {"information_status": "unverified", "sources": []}