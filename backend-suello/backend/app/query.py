"""Query builder for Process 3.0 (Algorithm 3: formulate a search query from entities and keywords)."""

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from",
    "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "as",
    "has", "have", "had", "will", "would", "can", "could", "not", "no", "so", "if", "than", "then",
}
LABEL_PRIORITY = {"PERSON": 0, "ORG": 1, "GPE": 2}  # everything else comes after
MIN_WORDS, MAX_WORDS = 6, 12


# Count words in a query string (quotes ignored).
def _word_count(parts: list[str]) -> int:
    return sum(len(p.replace('"', "").split()) for p in parts)


# Build a search query: up to 4 entities, then keywords until 6 to 12 words.
def build_query(profile: dict) -> str:
    text = profile.get("text", "") or ""
    entities = profile.get("entities", []) or []
    keywords = profile.get("keywords", []) or []

    ordered = sorted(entities, key=lambda e: LABEL_PRIORITY.get(e.get("label"), 3))  # stable sort
    parts, seen = [], set()

    for ent in ordered:
        if len(parts) >= 4:
            break
        etext = " ".join(ent.get("text", "").split())
        low = etext.lower()
        if not etext or low in seen:
            continue
        if parts and _word_count(parts) + len(etext.split()) > MAX_WORDS:
            continue
        seen.add(low)
        parts.append(f'"{etext}"' if len(etext.split()) > 1 else etext)

    entity_words = {w.lower() for p in parts for w in p.replace('"', "").split()}
    for kw in keywords:
        if _word_count(parts) >= MIN_WORDS:
            break
        low = kw.strip().lower()
        if not low or low in STOPWORDS or low in seen or low in entity_words:
            continue
        if _word_count(parts) + len(low.split()) > MAX_WORDS:
            continue
        seen.add(low)
        parts.append(kw.strip())

    if not parts:
        return " ".join(text.split()[:MAX_WORDS])
    return " ".join(parts)
