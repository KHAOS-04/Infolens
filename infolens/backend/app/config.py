"""All Infolens back-end settings live here.

The Tavily API key is read from the environment (loaded from backend/.env)
and is kept in this one file. Other modules must import `settings` from here
and must never read the key themselves, print it, or log it.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# backend/.env sits one folder above this file (backend/app/config.py).
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _clean_key(value: str | None) -> str:
    """Return the key, or an empty string if it is missing or still the placeholder."""
    value = (value or "").strip()
    if not value or value == "your-tavily-api-key-here":
        return ""
    return value


@dataclass(frozen=True)
class Settings:
    # The key never appears in repr(), str(), or logs.
    tavily_api_key: str = field(default="", repr=False)

    # Tavily search (basic depth costs 1 credit per search).
    tavily_search_depth: str = "basic"
    tavily_max_results: int = 5
    tavily_timeout_s: int = 12

    # Scoring knobs (calibrated in Phase 7).
    relevance_threshold: float = 0.40
    refutation_min_sources: int = 2

    # Request limits that match the extension.
    min_text_chars: int = 10
    max_text_chars: int = 5000
    max_image_bytes: int = 5 * 1024 * 1024

    # Cache for repeated checks.
    cache_ttl_s: int = 3600

    @property
    def has_tavily_key(self) -> bool:
        return bool(self.tavily_api_key)

    def public_summary(self) -> dict:
        """Safe to print or return: shows whether a key is set, never the key."""
        return {
            "tavily_key_configured": self.has_tavily_key,
            "tavily_search_depth": self.tavily_search_depth,
            "tavily_max_results": self.tavily_max_results,
            "relevance_threshold": self.relevance_threshold,
            "refutation_min_sources": self.refutation_min_sources,
        }


def load_settings() -> Settings:
    return Settings(
        tavily_api_key=_clean_key(os.getenv("TAVILY_API_KEY")),
        tavily_max_results=_int("INFOLENS_TAVILY_MAX_RESULTS", 5),
        tavily_timeout_s=_int("INFOLENS_TAVILY_TIMEOUT_S", 12),
        relevance_threshold=_float("INFOLENS_RELEVANCE_THRESHOLD", 0.40),
        refutation_min_sources=_int("INFOLENS_REFUTATION_MIN_SOURCES", 2),
        cache_ttl_s=_int("INFOLENS_CACHE_TTL_S", 3600),
    )


settings = load_settings()
