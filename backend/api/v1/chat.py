"""
Chat routes for API v1 — the persisted AI-analyst correspondence.

Endpoints:
    POST   /api/v1/chat                         -- send a message; creates or
                                                   continues a saved conversation
    GET    /api/v1/chat/conversations           -- list the caller's conversations
    GET    /api/v1/chat/conversations/<id>      -- one conversation + transcript
    PATCH  /api/v1/chat/conversations/<id>      -- rename
    DELETE /api/v1/chat/conversations/<id>      -- delete (with transcript)

Every reply is grounded in the conversation's OWN analysis (ownership-checked
each call), and the model now sees the saved transcript, so follow-ups have
real memory server-side instead of only appearing threaded in the UI.
"""

from __future__ import annotations

import json

from flask import jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import func as sa_func

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import Analysis, ChatConversation, ChatMessage
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

# The saved transcript window replayed to the model on each turn. Bounded so a
# long-running thread cannot balloon the prompt; per-message content is clipped
# too (a pasted 10k-char question should not ride along on every later turn).
HISTORY_MESSAGES_LIMIT = 12
HISTORY_CHARS_PER_MESSAGE = 6_000

MAX_CONVERSATIONS_LISTED = 100
TITLE_MAX_CHARS = 160


def _coerce_positive_int(raw) -> int | None:
    """Coerce a request-supplied id into a positive int, or ``None``.

    Accepts ints and numeric strings; rejects anything else so a malformed id
    never grounds the chat on (or resumes) the wrong record.
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
    analysis the conversation is attached to.  Returns ``None`` when no id is
    supplied or the analysis is not found / not owned by the caller — in which
    case the answer is produced without a (false) grounding claim.

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


def _own_conversation(conversation_id: int) -> ChatConversation | None:
    return ChatConversation.query.filter_by(
        id=conversation_id, user_id=current_user.id,
    ).first()


def _title_from(message: str) -> str:
    """Derive a listing title from the opening message: its first line, clipped."""
    first_line = message.strip().splitlines()[0].strip() if message.strip() else ""
    if len(first_line) > 72:
        first_line = first_line[:72].rstrip() + "…"
    return first_line or "…"


def _message_json(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "grounded": bool(m.grounded),
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


def _conversation_json(c: ChatConversation, message_count: int | None = None) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "analysisId": c.analysis_id,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
        **({"messageCount": message_count} if message_count is not None else {}),
    }


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

    # Resume an existing conversation (ownership-checked) or prepare a new one.
    conversation_id = _coerce_positive_int(payload.get("conversationId"))
    conversation = None
    if conversation_id is not None:
        conversation = _own_conversation(conversation_id)
        if conversation is None:
            return jsonify({"success": False, "message": "Conversation not found."}), 404

    # Grounding: a resumed conversation grounds on ITS OWN stored analysis —
    # the client cannot re-point an existing thread at a different record. A
    # new conversation adopts the requested analysis only after the ownership
    # check inside _grounded_analysis_data succeeds.
    if conversation is not None:
        analysis_id = conversation.analysis_id
    else:
        analysis_id = _coerce_positive_int(payload.get("analysisId"))
    analysis_data = _grounded_analysis_data(analysis_id)
    grounded = analysis_data is not None

    response_language = get_ai_response_language_name()
    system_content = (
        f"Respond in {response_language}. Keep code identifiers, filenames, "
        "metrics, and rule IDs in their original form when needed.\n"
    )

    # AI not configured / unavailable: answer with the operator-facing note but
    # persist nothing — an outage must not become a permanent transcript entry.
    health = check_ai_health(run_live_check=False)
    if health["status"] in ("not_configured", "client_unavailable"):
        return jsonify({
            "response": health.get("message", "AI is unavailable."),
            "grounded": grounded,
            "stored": False,
            "conversationId": conversation.id if conversation else None,
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

    # Replay the saved transcript so the model has real conversational memory.
    if conversation is not None:
        history = (
            ChatMessage.query.filter_by(conversation_id=conversation.id)
            .order_by(ChatMessage.id.desc())
            .limit(HISTORY_MESSAGES_LIMIT)
            .all()
        )
        for m in reversed(history):
            content = m.content
            if len(content) > HISTORY_CHARS_PER_MESSAGE:
                content = content[:HISTORY_CHARS_PER_MESSAGE] + "…"
            messages.append({"role": m.role, "content": content})

    messages.append({"role": "user", "content": user_message})

    response_text = generate_ai_chat(messages)

    # Persist the exchange (creating the conversation on first send).
    if conversation is None:
        conversation = ChatConversation(
            user_id=current_user.id,
            analysis_id=analysis_id if grounded else None,
            title=_title_from(user_message),
        )
        db.session.add(conversation)
        db.session.flush()  # assign conversation.id before the messages reference it

    user_row = ChatMessage(conversation_id=conversation.id, role="user", content=user_message)
    assistant_row = ChatMessage(
        conversation_id=conversation.id, role="assistant",
        content=response_text, grounded=grounded,
    )
    db.session.add_all([user_row, assistant_row])
    # Touch updated_at even though message inserts don't UPDATE the parent row.
    conversation.updated_at = sa_func.now()
    db.session.commit()

    return jsonify({
        "response": response_text,
        "grounded": grounded,
        "stored": True,
        "conversationId": conversation.id,
        "userMessage": _message_json(user_row),
        "assistantMessage": _message_json(assistant_row),
    })


# ---------------------------------------------------------------------------
# Conversation management
# ---------------------------------------------------------------------------
@v1_bp.route("/chat/conversations", methods=["GET"])
@login_required
def api_chat_conversations():
    """List the caller's conversations, newest activity first. ``analysisId``
    narrows to threads grounded in one analysis (used by the Results tab to
    resume the thread that belongs to the record on screen)."""
    query = ChatConversation.query.filter_by(user_id=current_user.id)

    analysis_id = _coerce_positive_int(request.args.get("analysisId"))
    if analysis_id is not None:
        query = query.filter_by(analysis_id=analysis_id)

    limit = _coerce_positive_int(request.args.get("limit")) or MAX_CONVERSATIONS_LISTED
    limit = min(limit, MAX_CONVERSATIONS_LISTED)

    rows = (
        query.add_columns(
            db.session.query(sa_func.count(ChatMessage.id))
            .filter(ChatMessage.conversation_id == ChatConversation.id)
            .correlate(ChatConversation)
            .scalar_subquery()
            .label("message_count"),
        )
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
        .limit(limit)
        .all()
    )
    return jsonify({
        "success": True,
        "items": [_conversation_json(c, message_count=count) for c, count in rows],
    })


@v1_bp.route("/chat/conversations/<int:conversation_id>", methods=["GET"])
@login_required
def api_chat_conversation_detail(conversation_id: int):
    conversation = _own_conversation(conversation_id)
    if conversation is None:
        return jsonify({"success": False, "message": "Conversation not found."}), 404
    messages = conversation.messages.all()
    return jsonify({
        "success": True,
        "conversation": _conversation_json(conversation, message_count=len(messages)),
        "messages": [_message_json(m) for m in messages],
    })


@v1_bp.route("/chat/conversations/<int:conversation_id>", methods=["PATCH"])
@login_required
def api_chat_conversation_rename(conversation_id: int):
    conversation = _own_conversation(conversation_id)
    if conversation is None:
        return jsonify({"success": False, "message": "Conversation not found."}), 404
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return jsonify({"success": False, "message": "Title is required."}), 400
    conversation.title = title[:TITLE_MAX_CHARS]
    db.session.commit()
    return jsonify({"success": True, "conversation": _conversation_json(conversation)})


@v1_bp.route("/chat/conversations/<int:conversation_id>", methods=["DELETE"])
@login_required
def api_chat_conversation_delete(conversation_id: int):
    conversation = _own_conversation(conversation_id)
    if conversation is None:
        return jsonify({"success": False, "message": "Conversation not found."}), 404
    db.session.delete(conversation)  # transcript rows go with it (delete-orphan cascade)
    db.session.commit()
    return jsonify({"success": True})
