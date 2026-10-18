from app.query import build_query


def wc(q): return len(q.replace('"', "").split())


def test_health_claim():
    q = build_query({"text": "x", "entities": [{"text": "Department of Health", "label": "ORG"}, {"text": "Manila", "label": "GPE"}],
                     "keywords": ["dengue", "vaccine", "cases", "rising", "outbreak"]})
    assert q.startswith('"Department of Health" Manila')
    assert 6 <= wc(q) <= 12


def test_political_priority_person_first():
    q = build_query({"text": "x", "entities": [{"text": "Senate", "label": "ORG"}, {"text": "Juan Dela Cruz", "label": "PERSON"}],
                     "keywords": ["bill", "passed", "law", "approved"]})
    assert q.startswith('"Juan Dela Cruz" Senate')


def test_announcement_max_four_entities():
    ents = [{"text": f"Ent{i}", "label": "ORG"} for i in range(6)]
    q = build_query({"text": "x", "entities": ents, "keywords": []})
    assert wc(q) == 4


def test_dedupe_and_stopwords():
    q = build_query({"text": "x", "entities": [{"text": "WHO", "label": "ORG"}, {"text": "who", "label": "ORG"}],
                     "keywords": ["the", "WHO", "polio", "Polio", "of", "campaign", "schedule", "children", "nationwide"]})
    words = [w.lower() for w in q.replace('"', "").split()]
    assert words.count("who") == 1 and words.count("polio") == 1 and "the" not in words


def test_max_12_words():
    q = build_query({"text": "x", "entities": [], "keywords": [f"kw{i}" for i in range(30)]})
    assert 6 <= wc(q) <= 12


def test_fallback_first_12_words():
    text = " ".join(f"w{i}" for i in range(20))
    assert build_query({"text": text, "entities": [], "keywords": []}) == " ".join(f"w{i}" for i in range(12))
