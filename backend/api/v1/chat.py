"""
Chat routes for API v1.

Endpoints:
    POST /api/v1/chat -- send message, get AI response based on analysis context
"""

from __future__ import annotations

import copy
import json

from flask import jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import limiter
from backend.services.ai_service import (
    check_ai_health,
    classify_ai_health_error,
    generate_ai_chat,
)
from backend.services.cache_service import get_cached_results_for_user
from backend.utils.localization import (
    get_ai_response_language_name,
    localize_ui_message,
)


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
                "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0631\u0633\u0627\u0644\u0629.",
            ),
        }), 400

    if len(user_message) > 10000:
        return jsonify({"error": "Message is too long. Maximum 10,000 characters."}), 400

    analysis_data = copy.deepcopy(get_cached_results_for_user(current_user.id) or {})

    response_language = get_ai_response_language_name()
    system_content = (
        f"Respond in {response_language}. Keep code identifiers, filenames, "
        "metrics, and rule IDs in their original form when needed.\n"
    )

    health = check_ai_health(run_live_check=False)
    if health["status"] in ("not_configured", "client_unavailable"):
        return jsonify({"response": health.get("message", "AI is unavailable.")})

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

    return jsonify({"response": response_text})
