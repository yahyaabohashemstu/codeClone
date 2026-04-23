"""
In-memory LRU analysis cache.

Stores the most recent analysis result and context for up to
``MAX_CACHED_USERS`` users.  ``OrderedDict`` provides O(1) LRU eviction:
when the cache exceeds the limit, the oldest (least-recently-used) entry is
discarded.

Thread safety: all reads/writes are guarded by ``_results_lock``.

Limitations (single-instance only):
  - Data is lost on server restart.
  - Not shared across multiple server processes/instances.
  - Memory usage: ~2--5 MB per cached user (code + base64 chart images).
  - At 200 users: up to ~1 GB worst case.

Production upgrade path (Redis):
  1. pip install redis
  2. Replace OrderedDict with Redis HASH (HSET/HGET per user)
  3. Use Redis EXPIRE for automatic TTL (e.g., 1 hour)
  4. Set maxmemory-policy to allkeys-lru for automatic eviction
  5. Configure via REDIS_URL environment variable
  6. This enables multi-instance deployments behind a load balancer
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from typing import TypedDict

from backend.engine.similarity import (
    clone_pairs_from_items,
    ensure_graph_payload,
    similarity_pairs_from_items,
)
from backend.utils.serialization import ensure_dict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_CACHED_USERS: int = 200


# ---------------------------------------------------------------------------
# Return type documentation
# ---------------------------------------------------------------------------

class CachedAnalysisData(TypedDict):
    """Shape of the dict returned by :func:`build_cached_analysis_data`.

    Keys
    ----
    Similarity Section : list[dict]
        Pairwise similarity scores between code fragments.
    Cloning Section : list[dict]
        Detected clone pairs with type and location info.
    Code 1 Graph : dict
        Graph/AST visualization payload for the first code input.
    Code 2 Graph : dict
        Graph/AST visualization payload for the second code input.
    Code Metrics for Code 1 : dict
        Complexity, LOC, and other metrics for the first input.
    Code Metrics for Code 2 : dict
        Complexity, LOC, and other metrics for the second input.
    Inter-Code Analysis : str
        AI-generated narrative comparing the two code inputs.
    """

    Similarity_Section: list  # noqa: N815  -- kept for JSON compat
    Cloning_Section: list
    Code_1_Graph: dict
    Code_2_Graph: dict
    Code_Metrics_for_Code_1: dict
    Code_Metrics_for_Code_2: dict
    Inter_Code_Analysis: str


# ---------------------------------------------------------------------------
# In-memory caches
# ---------------------------------------------------------------------------

_user_results: OrderedDict = OrderedDict()
_user_analysis_contexts: OrderedDict = OrderedDict()
_results_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_cached_analysis_data(context: dict) -> dict:
    """Extract the minimal data subset from *context* needed by API responses.

    Parameters
    ----------
    context:
        A full analysis context dict as produced by
        :func:`~backend.services.analysis_service.build_analysis_context`.

    Returns
    -------
    dict
        Lean payload suitable for JSON serialization.  Keys:

        * ``"Similarity Section"`` -- list of similarity pair dicts
        * ``"Cloning Section"`` -- list of clone pair dicts
        * ``"Code 1 Graph"`` / ``"Code 2 Graph"`` -- graph payloads
        * ``"Code Metrics for Code 1"`` / ``"Code Metrics for Code 2"``
        * ``"Inter-Code Analysis"`` -- AI narrative string
    """
    return {
        "Similarity Section": similarity_pairs_from_items(context.get("similarity_items")),
        "Cloning Section": clone_pairs_from_items(context.get("clone_items")),
        "Code 1 Graph": ensure_graph_payload(context.get("graph_json1")),
        "Code 2 Graph": ensure_graph_payload(context.get("graph_json2")),
        "Code Metrics for Code 1": ensure_dict(context.get("metrics1")),
        "Code Metrics for Code 2": ensure_dict(context.get("metrics2")),
        "Inter-Code Analysis": context.get("analysis_text") or "",
    }


def cache_analysis_context_for_user(user_id: int | None, context: dict) -> None:
    """Cache *context* for *user_id* with LRU eviction.

    If the user does not exist in the database the call is silently ignored,
    preventing phantom cache entries for deleted accounts.
    """
    if not user_id:
        return

    # Guard against phantom entries for deleted users.
    from backend.extensions import db
    from backend.models.user import User

    if db.session.get(User, user_id) is None:
        return

    cached_data = build_cached_analysis_data(context)
    with _results_lock:
        # Move-to-end (most-recently-used) or insert fresh.
        _user_results.pop(user_id, None)
        _user_analysis_contexts.pop(user_id, None)

        _user_results[user_id] = cached_data
        _user_analysis_contexts[user_id] = context

        # Evict least-recently-used entries when the cap is exceeded.
        while len(_user_results) > MAX_CACHED_USERS:
            _user_results.popitem(last=False)
        while len(_user_analysis_contexts) > MAX_CACHED_USERS:
            _user_analysis_contexts.popitem(last=False)


def get_cached_context_for_user(user_id: int | None) -> dict | None:
    """Return the cached analysis context for *user_id*, or ``None``.

    The entry is **not** moved to the head of the LRU queue; it simply
    returns whatever is currently stored.
    """
    if not user_id:
        return None
    with _results_lock:
        return _user_analysis_contexts.get(user_id)


def get_cached_results_for_user(user_id: int | None) -> dict | None:
    """Return the cached minimal results for *user_id*, or ``None``."""
    if not user_id:
        return None
    with _results_lock:
        return _user_results.get(user_id)


def invalidate_cached_analysis_for_user(
    user_id: int | None,
    analysis_id: int | None = None,
) -> None:
    """Remove cached data for *user_id*.

    Parameters
    ----------
    user_id:
        The user whose cache should be cleared.
    analysis_id:
        When provided, the cache is only cleared when it matches the cached
        analysis.  This prevents accidentally evicting a newer result when
        the caller only intends to invalidate a specific (older) analysis.
    """
    if not user_id:
        return

    with _results_lock:
        if analysis_id is None:
            _user_results.pop(user_id, None)
            _user_analysis_contexts.pop(user_id, None)
            return

        cached_context = _user_analysis_contexts.get(user_id)
        if not isinstance(cached_context, dict):
            return

        cached_summary = ensure_dict(cached_context.get("summary"))
        cached_analysis_id = cached_context.get("saved_analysis_id")

        if cached_analysis_id == analysis_id or cached_summary.get("id") == analysis_id:
            _user_results.pop(user_id, None)
            _user_analysis_contexts.pop(user_id, None)
