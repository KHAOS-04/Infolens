"""Search client with sqlite3 cache (Process 3.0, Algorithm 3). Only _call_provider knows the provider."""
import json
import os
import sqlite3
import time
from datetime import date
from urllib.parse import urlparse

import httpx

WARN_AT = 80  # warn when daily API calls reach this number (free tier is 100/day)


class SearchError(Exception):
    """Base class for search problems."""


class QuotaExceededError(SearchError):
    """Provider said quota is used up (HTTP 429 or 403)."""


class SearchNetworkError(SearchError):
    """Could not reach the search provider."""


class MissingKeysError(SearchError):
    """API key or search engine id is not set."""


# Open the cache database (path read each call so tests can change it).
def _db():
    path = os.getenv("INFOLENS_CACHE_DB", "search_cache.sqlite3")
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE IF NOT EXISTS cache (query TEXT PRIMARY KEY, results TEXT, ts REAL)")
    con.execute("CREATE TABLE IF NOT EXISTS calls (day TEXT PRIMARY KEY, count INTEGER)")
    return con


# Turn a URL into a lowercase host without a leading www.
def _host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


# ALL provider-specific code lives here. Swap providers by editing only this function.
# Returns a list of {"title", "url", "snippet"}.
def _call_provider(query: str, num: int) -> list[dict]:
    key = os.getenv("GOOGLE_API_KEY")
    cx = os.getenv("GOOGLE_CSE_ID")
    if not key or not cx:
        raise MissingKeysError("Set GOOGLE_API_KEY and GOOGLE_CSE_ID as environment variables.")
    try:
        resp = httpx.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": key, "cx": cx, "q": query, "num": min(num, 10)},
            timeout=15,
        )
    except httpx.RequestError as exc:
        raise SearchNetworkError(f"Network error: {exc.__class__.__name__}") from exc
    if resp.status_code in (429, 403):
        raise QuotaExceededError(f"Search quota exceeded (HTTP {resp.status_code}).")
    if resp.status_code >= 400:
        raise SearchError(f"Search provider error (HTTP {resp.status_code}).")
    items = resp.json().get("items", [])
    return [{"title": i.get("title", ""), "url": i.get("link", ""), "snippet": i.get("snippet", "")} for i in items]


# Count one real API call for today and print a warning at WARN_AT.
def _count_call(con) -> int:
    today = date.today().isoformat()
    con.execute("INSERT OR IGNORE INTO calls (day, count) VALUES (?, 0)", (today,))
    con.execute("UPDATE calls SET count = count + 1 WHERE day = ?", (today,))
    con.commit()
    count = con.execute("SELECT count FROM calls WHERE day = ?", (today,)).fetchone()[0]
    if count >= WARN_AT:
        print(f"WARNING: {count} search API calls used today (free tier limit is 100).")
    return count


# Return up to num results as title, url, domain, snippet. Same query twice = one API call.
def search(query: str, num: int = 10) -> list[dict]:
    key = query.lower().strip()
    con = _db()
    try:
        row = con.execute("SELECT results FROM cache WHERE query = ?", (key,)).fetchone()
        if row:
            return json.loads(row[0])
        raw = _call_provider(query, num)
        results = [
            {"title": r["title"], "url": r["url"], "domain": _host(r["url"]), "snippet": r["snippet"]}
            for r in raw[:num]
        ]
        _count_call(con)
        con.execute(
            "INSERT OR REPLACE INTO cache (query, results, ts) VALUES (?, ?, ?)",
            (key, json.dumps(results), time.time()),
        )
        con.commit()
        return results
    finally:
        con.close()
