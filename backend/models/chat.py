"""Chat models — persisted AI-analyst conversations.

A ``ChatConversation`` is one thread between a user and the AI analyst,
optionally grounded in a saved analysis; ``ChatMessage`` rows are its ordered
transcript. Both are personal data: they are hard-deleted on GDPR erasure and
included in the account export (see gdpr_service / account.py).

``analysis_id`` is a *logical* reference (no FK constraint): analyses can be
deleted independently from History, and a conversation must survive that as an
ungrounded thread rather than block or cascade the delete. Ownership is always
re-checked at read time before the id is used to ground anything.
"""

from __future__ import annotations

from sqlalchemy.sql import func

from backend.extensions import db


class ChatConversation(db.Model):  # type: ignore[name-defined]
    """One saved analyst thread (title + optional analysis grounding)."""

    __tablename__ = "chat_conversation"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    analysis_id = db.Column(db.Integer, nullable=True, index=True)
    title = db.Column(db.String(160), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, server_default=func.now())
    updated_at = db.Column(
        db.DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), index=True,
    )

    messages = db.relationship(
        "ChatMessage",
        backref="conversation",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )

    def __repr__(self) -> str:
        return f"<ChatConversation id={self.id} user={self.user_id} analysis={self.analysis_id}>"


class ChatMessage(db.Model):  # type: ignore[name-defined]
    """One transcript entry ('user' or 'assistant') inside a conversation."""

    __tablename__ = "chat_message"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(
        db.Integer, db.ForeignKey("chat_conversation.id"), nullable=False, index=True,
    )
    role = db.Column(db.String(12), nullable=False)  # "user" | "assistant"
    content = db.Column(db.Text, nullable=False)
    # True on assistant rows whose reply was produced WITH analysis context
    # attached — the persisted counterpart of the response's `grounded` flag.
    grounded = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=func.now())

    def __repr__(self) -> str:
        return f"<ChatMessage id={self.id} conv={self.conversation_id} role={self.role}>"
