import math

import pytest

from app import assess
from app.assess import (
    build_analysis_paragraph,
    composite_score,
    information_status,
    load_templates,
)

SAMPLE_SOURCES = [
    {"title": "Report", "url": "https://www.example-wire.com/a", "domain": "example-wire.com", "tier": 1},
    {"title": "Context", "url": "https://www.example-times.com/b", "domain": "example-times.com", "tier": 2},
]


# ---------------------------------------------------------------------------
# composite_score
# ---------------------------------------------------------------------------

# Known inputs give the expected weighted result.
@pytest.mark.parametrize("authority, similarity, tone, expected", [
    (1.0, 1.0, 1.0, 1.0),
    (0.0, 0.0, 0.0, 0.0),
    (1.0, 0.0, 0.0, 0.4),     # authority weight alone
    (0.0, 1.0, 0.0, 0.3),     # similarity weight alone
    (0.0, 0.0, 1.0, 0.3),     # tone weight alone
    (1.0, 0.5, 0.5, 0.7),     # exactly 0.70
    (0.8, 0.5, 0.75, 0.695),  # just under 0.70
    (0.0, 1.0, 1.0, 0.6),
])
def test_composite_values(authority, similarity, tone, expected):
    assert composite_score(authority, similarity, tone) == expected


# Inputs outside 0..1 are clamped before the formula runs.
@pytest.mark.parametrize("authority, similarity, tone, expected", [
    (2.0, 1.0, 1.0, 1.0),
    (-1.0, 0.0, 0.0, 0.0),
    (5.0, -5.0, 0.0, 0.4),
    (1.0, 1.0, 9.9, 1.0),
])
def test_composite_clamps_inputs(authority, similarity, tone, expected):
    assert composite_score(authority, similarity, tone) == expected


# The result is rounded to 3 decimals and is a float.
def test_composite_rounds_to_three_decimals():
    result = composite_score(0.123456, 0.654321, 0.111111)
    assert isinstance(result, float)
    assert result == round(result, 3)
    assert result == 0.279   # 0.4*0.123456 + 0.3*0.654321 + 0.3*0.111111 = 0.27907...


# NaN cannot be clamped, so it raises.
def test_composite_rejects_nan():
    with pytest.raises(ValueError):
        composite_score(math.nan, 0.5, 0.5)


# ---------------------------------------------------------------------------
# information_status
# ---------------------------------------------------------------------------

# Every boundary of the composite score (result_count is high enough, no contradiction).
@pytest.mark.parametrize("composite, expected", [
    (1.0, "Supported"),
    (0.70, "Supported"),
    (0.699, "Partially Supported"),
    (0.695, "Partially Supported"),
    (0.50, "Partially Supported"),
    (0.499, "Limited Evidence"),
    (0.30, "Limited Evidence"),
    (0.299, "Limited Evidence"),   # temporary rule: no contradiction
    (0.0, "Limited Evidence"),
])
def test_status_by_composite(composite, expected):
    assert information_status(composite, 5, False) == expected


# Fewer than 3 results always wins, even with a perfect score or a contradiction.
@pytest.mark.parametrize("result_count", [0, 1, 2])
@pytest.mark.parametrize("composite", [0.0, 0.299, 0.70, 1.0])
@pytest.mark.parametrize("contradiction", [True, False])
def test_status_too_few_results(result_count, composite, contradiction):
    assert information_status(composite, result_count, contradiction) == "Recent or Not Yet Widely Confirmed"


# Exactly 3 results is enough, so the composite rules apply.
def test_status_three_results_is_enough():
    assert information_status(0.70, 3, False) == "Supported"
    assert information_status(0.40, 3, False) == "Limited Evidence"


# Both branches of the contradiction rule (only used when composite < 0.30).
def test_status_contradiction_true_below_threshold():
    assert information_status(0.299, 3, True) == "Not Supported"
    assert information_status(0.0, 10, True) == "Not Supported"


def test_status_contradiction_false_below_threshold():
    assert information_status(0.299, 3, False) == "Limited Evidence"
    assert information_status(0.0, 10, False) == "Limited Evidence"


# A contradiction does not change the result when the composite is 0.30 or higher.
@pytest.mark.parametrize("composite, expected", [
    (0.30, "Limited Evidence"),
    (0.50, "Partially Supported"),
    (0.80, "Supported"),
])
def test_status_contradiction_ignored_at_or_above_threshold(composite, expected):
    assert information_status(composite, 5, True) == expected


# composite_score and information_status work together at the boundaries.
def test_score_and_status_together():
    assert information_status(composite_score(1.0, 0.5, 0.5), 5, False) == "Supported"
    assert information_status(composite_score(0.8, 0.5, 0.75), 5, False) == "Partially Supported"
    assert information_status(composite_score(0.0, 0.0, 1.0), 5, False) == "Limited Evidence"


# ---------------------------------------------------------------------------
# build_analysis_paragraph
# ---------------------------------------------------------------------------

# Every placeholder is filled from the right value.
def test_paragraph_fills_all_placeholders():
    templates = {"Supported": "{content_type}|{content_tone}|{source_count}|{top_source_domain}"}
    text = build_analysis_paragraph("Supported", "Health Claim", "Neutral", SAMPLE_SOURCES, templates)
    assert text == "Health Claim|Neutral|2|example-wire.com"


# The template is chosen by status.
def test_paragraph_uses_template_for_status():
    templates = {"Supported": "yes {source_count}", "Not Supported": "no {source_count}"}
    assert build_analysis_paragraph("Supported", "x", "y", SAMPLE_SOURCES, templates) == "yes 2"
    assert build_analysis_paragraph("Not Supported", "x", "y", SAMPLE_SOURCES, templates) == "no 2"


# With no sources, the count is 0 and the top domain falls back to "none".
def test_paragraph_with_no_sources():
    templates = {"Limited Evidence": "{source_count} / {top_source_domain}"}
    assert build_analysis_paragraph("Limited Evidence", "x", "y", [], templates) == "0 / none"


# A template does not have to use every placeholder.
def test_paragraph_unused_placeholders_are_fine():
    templates = {"Supported": "Only {content_type} here."}
    assert build_analysis_paragraph("Supported", "Announcement", "Neutral", SAMPLE_SOURCES, templates) == "Only Announcement here."


# A status with no template is a bug, so it raises a clear error.
def test_paragraph_unknown_status_raises():
    with pytest.raises(ValueError):
        build_analysis_paragraph("Made Up Status", "x", "y", SAMPLE_SOURCES, {"Supported": "text"})


# Guard for the real templates.json: every status has a template and none has a leftover "{".
@pytest.mark.parametrize("status", [
    "Supported", "Partially Supported", "Limited Evidence",
    "Not Supported", "Recent or Not Yet Widely Confirmed",
])
def test_real_templates_file(status):
    templates = load_templates()
    text = build_analysis_paragraph(status, "Health Claim", "Neutral", SAMPLE_SOURCES, templates)
    assert "{" not in text and "}" not in text
    assert "Health Claim" not in text   # content type is shown separately, not in the paragraph
    assert "Neutral" not in text
    assert "{" not in text and "}" not in text
    assert "example-wire.com" in text


# The status names returned by information_status all exist in templates.json.
def test_every_status_has_a_template():
    templates = load_templates()
    for status in [assess.STATUS_RECENT, assess.STATUS_SUPPORTED, assess.STATUS_PARTIAL,
                   assess.STATUS_LIMITED, assess.STATUS_NOT_SUPPORTED]:
        assert status in templates