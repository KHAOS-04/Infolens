import math

import pytest

from app import analyze
from app.analyze import classify_content_tone, classify_content_type


# ---------------------------------------------------------------------------
# classify_content_type: at least 3 samples per type
# ---------------------------------------------------------------------------

# Health Claim: keywords, a health ORG, and the keywords argument.
@pytest.mark.parametrize("text, entities, keywords", [
    ("Drinking lemon water every morning can cure diabetes.", [], []),
    ("The new vaccine reduces severe symptoms.", [], []),
    ("The WHO released new guidance today.", [("WHO", "ORG"), ("today", "DATE")], []),
    ("Ginger tea works wonders.", [], ["remedy"]),
])
def test_health_claim(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "Health Claim"


# Political or Government: keywords and a government-named ORG entity.
@pytest.mark.parametrize("text, entities, keywords", [
    ("The Senate passed the new tax law on Tuesday.", [("Senate", "ORG"), ("Tuesday", "DATE")], []),
    ("Mayor Santos signed an ordinance banning plastic bags.", [("Santos", "PERSON")], []),
    ("The president announced a new election date.", [], []),
    ("Quezon City Hall will open a new park.", [("Quezon City Hall", "ORG")], []),
])
def test_political_or_government(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "Political or Government"


# Announcement: notice wording, and a date entity plus a schedule word.
@pytest.mark.parametrize("text, entities, keywords", [
    ("Service interruption: the water supply will be off on March 5 from 9 AM.",
     [("March 5", "DATE"), ("9 AM", "TIME")], []),
    ("Class suspension in all schools tomorrow due to heavy rain.", [("tomorrow", "DATE")], []),
    ("The annual company meeting will be held at the main hall.", [], []),
    ("Registration is open until June 30.", [("June 30", "DATE")], []),
    ("We are pleased to announce our new opening hours.", [], []),
])
def test_announcement(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "Announcement"


# Promotional or Viral Content: marketing, calls to action, clickbait, viral.
@pytest.mark.parametrize("text, entities, keywords", [
    ("Huge sale this weekend! Buy now and get 50% off.", [("this weekend", "DATE")], []),
    ("You won't believe what happens next! Click here.", [], []),
    ("Use code SAVE10 for free shipping on our new product line.", [], []),
    ("This video went viral overnight.", [], []),
])
def test_promotional_or_viral(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "Promotional or Viral Content"


# Opinion or Editorial: subjective language with few entities.
@pytest.mark.parametrize("text, entities, keywords", [
    ("I think the new cafe downtown is the best in the city.", [], []),
    ("In my opinion this movie was terrible and overrated.", [], []),
    ("Honestly, we should stop wasting time on this ridiculous plan.", [], []),
])
def test_opinion_or_editorial(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "Opinion or Editorial"


# General Factual Claim: nothing else matched.
@pytest.mark.parametrize("text, entities, keywords", [
    ("The Eiffel Tower is located in Paris.", [("Eiffel Tower", "FAC"), ("Paris", "GPE")], []),
    ("Water boils at 100 degrees Celsius at sea level.", [], []),
    ("The river is 300 kilometers long.", [("300 kilometers", "QUANTITY")], []),
    ("", [], []),
])
def test_general_factual_claim(text, entities, keywords):
    assert classify_content_type(text, entities, keywords) == "General Factual Claim"


# ---------------------------------------------------------------------------
# classify_content_type: priority order and edge cases
# ---------------------------------------------------------------------------

# Each pair: a text that matches two rules, and the rule that must win.
@pytest.mark.parametrize("text, entities, expected", [
    ("The president says the vaccine is safe.", [], "Health Claim"),
    ("The senator announces a hearing scheduled for Monday.", [("Monday", "DATE")], "Political or Government"),
    ("Notice: store sale starts Monday.", [("Monday", "DATE")], "Announcement"),
    ("I think this is the best deal ever, buy now.", [], "Promotional or Viral Content"),
])
def test_priority_order(text, entities, expected):
    assert classify_content_type(text, entities, []) == expected


# "cure" inside "secure" or "manicure" must not trigger a health claim.
def test_whole_word_matching():
    assert classify_content_type("A secure manicure appointment.", [], []) == "General Factual Claim"


# The pronoun "who" is not the WHO organization (no ORG entity here).
def test_pronoun_who_is_not_health_org():
    assert classify_content_type("Who is coming to dinner tonight?", [], []) == "General Factual Claim"


# Matching ignores upper/lower case.
def test_case_insensitive():
    text = "THE SENATE PASSED THE NEW TAX LAW."
    assert classify_content_type(text, [], []) == "Political or Government"


# A plain PERSON entity is not political, and a date without a schedule word is not an announcement.
@pytest.mark.parametrize("text, entities", [
    ("Maria Santos baked a cake yesterday.", [("Maria Santos", "PERSON"), ("yesterday", "DATE")]),
    ("The bridge was completed in 1998.", [("1998", "DATE")]),
])
def test_entities_alone_do_not_trigger(text, entities):
    assert classify_content_type(text, entities, []) == "General Factual Claim"


# Subjective text with too many entities is not an opinion.
def test_opinion_needs_few_entities():
    entities = [("Maria", "PERSON"), ("John", "PERSON"), ("Paula", "PERSON"), ("Ken", "PERSON")]
    text = "I think Maria, John, Paula and Ken are the best."
    assert classify_content_type(text, entities, []) == "General Factual Claim"


# Guard against editing mistakes: every term in every list must be lowercase and trimmed.
@pytest.mark.parametrize("list_name", [
    "HEALTH_KEYWORDS", "HEALTH_ORGS", "POLITICAL_KEYWORDS",
    "GOVERNMENT_ENTITY_MARKERS", "ANNOUNCEMENT_KEYWORDS",
    "ANNOUNCEMENT_DATE_WORDS", "MARKETING_KEYWORDS",
    "CALL_TO_ACTION_PHRASES", "CLICKBAIT_PHRASES", "SUBJECTIVE_WORDS",
])
def test_keyword_lists_are_lowercase(list_name):
    for term in getattr(analyze, list_name):
        assert term == term.lower().strip()


# ---------------------------------------------------------------------------
# classify_content_tone
# ---------------------------------------------------------------------------

# Every boundary value and the values just beyond it (text has no promotional word).
@pytest.mark.parametrize("compound, expected_label", [
    (0.0, "Neutral"),
    (0.049, "Neutral"),
    (0.05, "Neutral"),
    (-0.049, "Neutral"),
    (-0.05, "Neutral"),
    (0.051, "Informational"),
    (0.299, "Informational"),
    (0.30, "Informational"),
    (-0.051, "Misleading"),
    (-0.299, "Misleading"),
    (-0.30, "Misleading"),
    (0.301, "Exaggerated"),
    (1.0, "Exaggerated"),
    (-0.301, "Exaggerated"),
    (-1.0, "Exaggerated"),
])
def test_tone_label_boundaries(compound, expected_label):
    label, _ = classify_content_tone(compound, "A plain sentence.")
    assert label == expected_label


# Promotional needs BOTH compound > 0.30 and a promotional keyword.
@pytest.mark.parametrize("compound, text, expected_label", [
    (0.301, "Big sale today, buy now!", "Promotional"),
    (1.0, "SALE ENDS SOON", "Promotional"),
    (0.30, "Big sale today, buy now!", "Informational"),
    (0.301, "What a wonderful day.", "Exaggerated"),
    (-0.301, "Big sale today, buy now!", "Exaggerated"),
    (0.0, "Big sale today, buy now!", "Neutral"),
])
def test_tone_promotional_rule(compound, text, expected_label):
    label, _ = classify_content_tone(compound, text)
    assert label == expected_label


# tone_score is 1 - abs(compound).
@pytest.mark.parametrize("compound, expected_score", [
    (0.0, 1.0),
    (0.05, 0.95),
    (-0.05, 0.95),
    (0.30, 0.70),
    (-0.30, 0.70),
    (1.0, 0.0),
    (-1.0, 0.0),
])
def test_tone_score(compound, expected_score):
    _, score = classify_content_tone(compound, "A plain sentence.")
    assert score == pytest.approx(expected_score)


# A compound score outside -1..1 (or NaN) is a bug in the caller, so it raises.
@pytest.mark.parametrize("bad_value", [1.01, -1.01, math.nan])
def test_tone_rejects_invalid_compound(bad_value):
    with pytest.raises(ValueError):
        classify_content_tone(bad_value, "text")