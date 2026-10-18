# (rule, tier, score). A rule starting with "." is a suffix rule; otherwise an exact domain or its subdomains.
TIER_RULES = [
    (".gov.ph", 1, 1.0), ("doh.gov.ph", 1, 1.0), ("who.int", 1, 1.0), ("psa.gov.ph", 1, 1.0), ("cdc.gov", 1, 1.0),
    ("reuters.com", 2, 0.8), ("bbc.com", 2, 0.8), ("apnews.com", 2, 0.8), (".edu", 2, 0.8), (".edu.ph", 2, 0.8),
    ("inquirer.net", 3, 0.7), ("gmanetwork.com", 3, 0.7), ("abs-cbn.com", 3, 0.7),
    ("rappler.com", 3, 0.7), ("philstar.com", 3, 0.7), ("mb.com.ph", 3, 0.7),
    ("wikipedia.org", 4, 0.5),
]
# TODO (Suello to approve, do not invent): peer-reviewed publication domains (Tier 2) and other Tier 4 sites.


# Return (tier, score) for a domain. Longest matching rule wins; unknown domains are Tier 5 with 0.3.
def get_tier(domain: str) -> tuple[int, float]:
    d = (domain or "").lower().strip()
    if d.startswith("www."):
        d = d[4:]
    best = None
    for rule, tier, score in TIER_RULES:
        if rule.startswith("."):
            hit = d.endswith(rule)  # suffix rule: doh.gov.ph.evil.com does NOT end with .gov.ph
        else:
            hit = d == rule or d.endswith("." + rule)
        if hit and (best is None or len(rule) > len(best[0])):
            best = (rule, tier, score)
    return (best[1], best[2]) if best else (5, 0.3)
