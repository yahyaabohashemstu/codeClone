"""
Chat routes for API v1.

Endpoints:
    POST /api/v1/chat -- send message, get AI response grounded in a specific,
                         ownership-checked saved analysis
"""

from __future__ import annotations

import json

from flask import jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import limiter
from backend.models import Analysis
from backend.services.ai_service import (
    check_ai_health,
    generate_ai_chat,
)
from backend.services.analysis_service import restore_saved_analysis_context
from backend.services.cache_service import build_cached_analysis_data
from backend.utils.localization import (
    get_ai_response_language_name,
    localize_ui_message,
)


def _coerce_analysis_id(raw) -> int | None:
    """Coerce a request-supplied analysis id into a positive int, or ``None``.

    Accepts ints and numeric strings; rejects anything else so a malformed
    ``analysisId`` never grounds the chat on the wrong record.
    """
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _grounded_analysis_data(analysis_id: int | None) -> dict | None:
    """Return the lean chat context for *analysis_id*, ownership-checked.

    The context is loaded **by id** for the current user rather than from the
    decoupled per-user cache, so the chat can only ever answer about the exact
    analysis the client is viewing.  Returns ``None`` when no id is supplied or
    the analysis is not found / not owned by the caller — in which case the
    answer is produced without a (false) grounding claim.

    ``allow_backfill=False`` keeps this cheap: the context is restored from the
    stored snapshot (or a minimal view) without re-running the ML pipeline.
    """
    if not analysis_id:
        return None

    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id,
    ).first()
    if analysis is None:
        return None

    context = restore_saved_analysis_context(analysis, allow_backfill=False)
    return build_cached_analysis_data(context)


# ---------------------------------------------------------------------------
# POST /api/v1/chat
# ---------------------------------------------------------------------------
@v1_bp.route("/chat", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_chat():
    payload = request.get_json(silent=True) or {}
    user_message = (payload.get("message") or "").strip()
    if not user_message:
        return jsonify({
            "response": localize_ui_message(
                "Please enter a message.",
                "يرجى إدخال رسالة.",
            ),
        }), 400

    if len(user_message) > 10000:
        return jsonify({"error": "Message is too long. Maximum 10,000 characters."}), 400

    # Ground strictly on the analysis the client names (and owns). ``grounded``
    # is echoed back so the UI only shows its "Grounded" trust badge when real,
    # matching context was actually attached.
    analysis_id = _coerce_analysis_id(payload.get("analysisId"))
    analysis_data = _grounded_analysis_data(analysis_id)
    grounded = analysis_data is not None

    response_language = get_ai_response_language_name()
    system_content = (
        f"Respond in {response_language}. Keep code identifiers, filenames, "
        "metrics, and rule IDs in their original form when needed.\n"
    )

    health = check_ai_health(run_live_check=False)
    if health["status"] in ("not_configured", "client_unavailable"):
        return jsonify({
            "response": health.get("message", "AI is unavailable."),
            "grounded": grounded,
        })

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    if analysis_data:
        messages.append({
            "role": "user",
            "content": "[Analysis Context]\n" + json.dumps(analysis_data, ensure_ascii=False, indent=2),
        })
        messages.append({
            "role": "assistant",
            "content": "I have reviewed the analysis context. How can I help?",
        })
    messages.append({"role": "user", "content": user_message})

    response_text = generate_ai_chat(messages)

    return jsonify({"response": response_text, "grounded": grounded})
