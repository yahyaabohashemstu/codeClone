"""
CI/CD integration endpoint.

Provides ``POST /api/v1/ci/check`` for automated pipeline checks.
Designed to be called by GitHub Actions, GitLab CI, or any CI/CD system.

Authentication is via API key (``Authorization: Bearer <key>`` or
``X-API-Key: <key>``), not session cookies — CI environments are stateless.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

from flask import jsonify, request
from flask_limiter.util import get_remote_address

from backend.api.v1 import v1_bp
from backend.extensions import limiter
from backend.engine.clone_detector import SUPPORTED_LANGUAGES, get_detector
from backend.services.analysis_service import analyze_similarities

logger = logging.getLogger(__name__)


def _ci_rate_key() -> str:
    """Rate-limit key for the CI endpoint.

    This endpoint is authenticated by API key, not by session/IP, so keying its
    limit on the client IP (the limiter's default) was wrong twice over: one
    leaked key could bypass the 60/min cap by rotating source IPs, and distinct
    CI runners sharing one NAT egress IP throttled each other. Key on a stable,
    NON-secret fingerprint of the presented credential instead, falling back to
    the IP only for unauthenticated callers.
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if not token:
        token = request.headers.get("X-API-Key", "").strip()
    if token:
        # csk_<prefix>.<secret> keys carry a public prefix — use it and never the
        # secret. Anything else is fingerprinted with a truncated SHA-256 so the
        # raw token never becomes a limiter storage key.
        if token.startswith("csk_") and "." in token:
            return "ci:" + token.split(".", 1)[0]
        return "ci:" + hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]
    return "ci-ip:" + (get_remote_address() or "anon")

# ── Constants ───────────────────────────────────────────────────────────────

DEFAULT_THRESHOLD = 80.0  # percent
MAX_CI_SOURCE_BYTES = 512 * 1024  # 512 KB per source
MAX_CI_PAIRS = 50  # max pairs per request

# Maps the boolean ``*_clone_result`` keys returned by ``analyze_similarities``
# to the short clone-type labels surfaced in the CI response.  The previous
# implementation filtered for keys beginning with ``is_``, which never matched
# any real key, so ``clone_types_detected`` was always empty.
_CLONE_TYPE_LABELS: dict[str, str] = {
    "exact_clone_result": "exact",
    "near_miss_clone_result": "near_miss",
    "parameterized_clone_result": "parameterized",
    "function_clone_result": "function",
    "non_contiguous_clone_result": "non_contiguous",
    "structural_clone_result": "structural",
    "reordered_clone_result": "reordered",
    "function_reordered_clone_result": "function_reordered",
    "gapped_clone_result": "gapped",
    "intertwined_clone_result": "intertwined",
    "semantic_clone_result": "semantic",
}


def _authenticate_ci_request() -> dict[str, Any] | None:
    """
    Authenticate a CI request via API key.

    Supports two header formats:
    - ``Authorization: Bearer <token>``
    - ``X-API-Key: <token>``

    Returns actor dict on success, None on failure.
    """
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.headers.get("X-API-Key", "").strip()
    if not token:
        return None

    # Per-user API keys (csk_<prefix>.<secret>) from the account API-keys page.
    if token.startswith("csk_"):
        return _authenticate_user_api_key(token)

    # For enterprise API keys (epk_ prefix), validate against enterprise credentials
    if token.startswith("epk_"):
        try:
            from enterprise_platform.utils import resolve_actor, session_scope
            with session_scope() as db_session:
                actor = resolve_actor(db_session, require_authenticated=True)
                return actor
        except Exception:
            logger.warning("CI enterprise API-key authentication failed.", exc_info=True)
            return None

    # For simple CI tokens, validate against configured CI_API_KEY
    import os
    ci_key = os.environ.get("CI_API_KEY", "").strip()
    if ci_key and hmac.compare_digest(token, ci_key):
        return {
            "kind": "ci",
            "legacy_user_id": None,
            "workspace_id": None,
            "organization_id": None,
            "scopes": ["ci:check"],
            "is_admin": False,
        }

    return None


def _authenticate_user_api_key(token: str):
    """Validate a csk_<prefix>.<secret> per-user key and stamp last_used_at."""
    import datetime

    from backend.extensions import db
    from backend.models import ApiKey

    if "." not in token:
        return None
    prefix, _, secret = token.partition(".")
    key = ApiKey.query.filter_by(prefix=prefix, revoked_at=None).first()
    if not key:
        return None
    if not hmac.compare_digest(key.key_hash, ApiKey.hash_secret(prefix, secret)):
        return None
    key.last_used_at = datetime.datetime.now(datetime.timezone.utc)
    db.session.commit()
    return {
        "kind": "user_api_key",
        "legacy_user_id": key.user_id,
        "workspace_id": None,
        "organization_id": None,
        "scopes": ["ci:check"],
        "is_admin": False,
    }


@v1_bp.route("/ci/check", methods=["POST"])
@limiter.limit("60 per minute", key_func=_ci_rate_key)
def ci_check():
    """
    CI/CD similarity check endpoint.

    Accepts one or more code pairs, runs similarity analysis on each,
    and returns a pass/fail verdict based on a configurable threshold.

    **Request JSON:**

    .. code-block:: json

        {
            "threshold": 80.0,
            "language": "python",
            "pairs": [
                {
                    "label_a": "student-A/sort.py",
                    "label_b": "student-B/sort.py",
                    "code_a": "def sort(arr): ...",
                    "code_b": "def sort(lst): ..."
                }
            ]
        }

    **Response JSON:**

    .. code-block:: json

        {
            "success": true,
            "verdict": "fail",
            "threshold": 80.0,
            "total_pairs": 2,
            "violations": 1,
            "results": [ ... ],
            "duration_ms": 1234
        }
    """
    # ── Authentication ──────────────────────────────────────────────────
    actor = _authenticate_ci_request()
    if actor is None:
        return jsonify({
            "success": False,
            "error": "Authentication required. Provide API key via Authorization header or X-API-Key.",
            "code": "authentication_required",
        }), 401

    # Enforce the 'ci:check' scope. Enterprise (epk_) keys carry their stored
    # scopes verbatim, so a key minted for an unrelated, restricted purpose must
    # not be able to invoke this compute-heavy endpoint just because it exists.
    scopes = actor.get("scopes") or []
    if not (actor.get("is_admin") or "ci:check" in scopes or "*" in scopes):
        return jsonify({
            "success": False,
            "error": "This API key is not authorized for CI checks (missing 'ci:check' scope).",
            "code": "insufficient_scope",
        }), 403

    # ── Parse request ───────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be a JSON object.",
            "code": "invalid_request",
        }), 400

    try:
        threshold = float(data.get("threshold", DEFAULT_THRESHOLD))
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "error": "Threshold must be a number between 0 and 100.",
            "code": "invalid_threshold",
        }), 400
    if threshold < 0 or threshold > 100:
        return jsonify({
            "success": False,
            "error": "Threshold must be between 0 and 100.",
            "code": "invalid_threshold",
        }), 400

    language = (data.get("language") or "python").strip().lower()
    if language not in SUPPORTED_LANGUAGES:
        return jsonify({
            "success": False,
            "error": f"Unsupported language: {language}. Supported: {', '.join(SUPPORTED_LANGUAGES)}",
            "code": "unsupported_language",
        }), 400

    pairs = data.get("pairs")
    if not pairs or not isinstance(pairs, list):
        return jsonify({
            "success": False,
            "error": "Request must include a non-empty 'pairs' array.",
            "code": "missing_pairs",
        }), 400

    if len(pairs) > MAX_CI_PAIRS:
        return jsonify({
            "success": False,
            "error": f"Too many pairs. Maximum is {MAX_CI_PAIRS} per request.",
            "code": "too_many_pairs",
        }), 400

    # ── Validate and extract pairs ──────────────────────────────────────
    validated_pairs: list[dict[str, str]] = []
    for i, pair in enumerate(pairs):
        if not isinstance(pair, dict):
            return jsonify({
                "success": False,
                "error": f"Pair at index {i} must be a JSON object.",
                "code": "invalid_pair",
            }), 400

        code_a = (pair.get("code_a") or "").strip()
        code_b = (pair.get("code_b") or "").strip()

        if not code_a or not code_b:
            return jsonify({
                "success": False,
                "error": f"Pair at index {i} must have non-empty 'code_a' and 'code_b'.",
                "code": "empty_code",
            }), 400

        if len(code_a.encode("utf-8")) > MAX_CI_SOURCE_BYTES:
            return jsonify({
                "success": False,
                "error": f"Pair {i}: code_a exceeds {MAX_CI_SOURCE_BYTES // 1024} KB limit.",
                "code": "code_too_large",
            }), 400

        if len(code_b.encode("utf-8")) > MAX_CI_SOURCE_BYTES:
            return jsonify({
                "success": False,
                "error": f"Pair {i}: code_b exceeds {MAX_CI_SOURCE_BYTES // 1024} KB limit.",
                "code": "code_too_large",
            }), 400

        validated_pairs.append({
            "label_a": pair.get("label_a", f"source_a_{i}"),
            "label_b": pair.get("label_b", f"source_b_{i}"),
            "code_a": code_a,
            "code_b": code_b,
        })

    # ── Usage-based billing (the API's own plan) ────────────────────────
    # For per-user (csk_) keys, reserve the pairs against the caller's API plan
    # BEFORE running the compute-heavy analysis. Hard-capped tiers (api_free /
    # lapsed) are refused atomically here; paid tiers are metered for overage.
    # Enterprise (epk_) and static CI tokens are not billed through this path.
    if actor.get("kind") == "user_api_key" and actor.get("legacy_user_id"):
        from backend.services.api_billing_service import api_reserve_usage
        reservation = api_reserve_usage(actor["legacy_user_id"], len(validated_pairs))
        if not reservation.get("allowed"):
            return jsonify({
                "success": False,
                "error": (
                    f"API quota exceeded for your current plan ({reservation.get('apiPlanName')}). "
                    "Upgrade your API plan to continue."
                ),
                "code": "api_quota_exceeded",
                "usage": {
                    "apiPlan": reservation.get("apiPlan"),
                    "pairs": reservation.get("pairs"),
                    "includedPairs": reservation.get("includedPairs"),
                    "remainingIncluded": reservation.get("remainingIncluded"),
                },
            }), 402

    # ── Run analysis ────────────────────────────────────────────────────
    start_time = time.monotonic()
    detector = get_detector(language)
    results: list[dict[str, Any]] = []
    violations = 0

    for pair in validated_pairs:
        code_a = pair["code_a"]
        code_b = pair["code_b"]

        try:
            clean_a = detector.remove_comments_and_whitespace(code_a)
            clean_b = detector.remove_comments_and_whitespace(code_b)

            similarity_data = analyze_similarities(
                detector, code_a, code_b,
                clean_code1=clean_a, clean_code2=clean_b,
            )

            combined = similarity_data.get("combined_similarity", 0) * 100
            is_violation = combined >= threshold

            if is_violation:
                violations += 1

            result_entry: dict[str, Any] = {
                "label_a": pair["label_a"],
                "label_b": pair["label_b"],
                "combined_similarity": round(combined, 2),
                "text_similarity": round(similarity_data.get("text_sim", 0) * 100, 2),
                "token_similarity": round(
                    similarity_data.get("token_sim_with_order_without_comments", 0) * 100, 2
                ),
                "graph_similarity": round(similarity_data.get("graph_sim", 0) * 100, 2),
                "ai_similarity": round(similarity_data.get("ai_similarity_score", 0) * 100, 2),
                "is_violation": is_violation,
                "clone_types_detected": [
                    label for key, label in _CLONE_TYPE_LABELS.items()
                    if similarity_data.get(key) is True
                ],
            }
            results.append(result_entry)

        except Exception as exc:
            # Log the real exception server-side but return a generic message:
            # raw exception text can leak internal paths/library details to
            # any API-key holder.
            logger.warning("CI check pair analysis failed: %s", exc, exc_info=True)
            results.append({
                "label_a": pair["label_a"],
                "label_b": pair["label_b"],
                "error": "Analysis failed for this pair.",
                "code": "pair_analysis_failed",
                "is_violation": False,
            })

    elapsed_ms = round((time.monotonic() - start_time) * 1000)
    verdict = "fail" if violations > 0 else "pass"

    response = {
        "success": True,
        "verdict": verdict,
        "threshold": threshold,
        "language": language,
        "total_pairs": len(results),
        "violations": violations,
        "duration_ms": elapsed_ms,
        "results": results,
    }

    status_code = 200 if verdict == "pass" else 422
    return jsonify(response), status_code


@v1_bp.route("/ci/languages", methods=["GET"])
def ci_languages():
    """Return the list of supported programming languages for CI checks."""
    return jsonify({
        "success": True,
        "languages": SUPPORTED_LANGUAGES,
    })
