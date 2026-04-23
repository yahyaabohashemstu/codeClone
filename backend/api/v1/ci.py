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

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.engine.clone_detector import SUPPORTED_LANGUAGES, get_detector
from backend.services.analysis_service import analyze_similarities
from backend.utils.serialization import json_dumps_compact

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────────────

DEFAULT_THRESHOLD = 80.0  # percent
MAX_CI_SOURCE_BYTES = 512 * 1024  # 512 KB per source
MAX_CI_PAIRS = 50  # max pairs per request


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

    # For enterprise API keys (epk_ prefix), validate against enterprise credentials
    if token.startswith("epk_"):
        try:
            from enterprise_platform.utils import resolve_actor, session_scope
            with session_scope() as db_session:
                actor = resolve_actor(db_session, require_authenticated=True)
                return actor
        except Exception:
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


@v1_bp.route("/ci/check", methods=["POST"])
@limiter.limit("60 per minute")
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

    # ── Parse request ───────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({
            "success": False,
            "error": "Request body must be a JSON object.",
            "code": "invalid_request",
        }), 400

    threshold = float(data.get("threshold", DEFAULT_THRESHOLD))
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
                    k for k, v in similarity_data.items()
                    if k.startswith("is_") and v is True
                ],
            }
            results.append(result_entry)

        except Exception as exc:
            logger.warning("CI check pair analysis failed: %s", exc)
            results.append({
                "label_a": pair["label_a"],
                "label_b": pair["label_b"],
                "error": str(exc),
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
