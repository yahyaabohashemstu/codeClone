"""Core application audit log + per-user API keys.

The enterprise platform has its own richer audit trail; this is the equivalent
for the core app (auth events, plan changes, key management). Both are new
tables, so create_all / Alembic provision them automatically.
"""

from __future__ import annotations

import datetime
import hashlib
import secrets

from sqlalchemy.sql import func

from backend.extensions import db


class AuditLog(db.Model):  # type: ignore[name-defined]
    """Append-only record of a security-relevant action."""

    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    action = db.Column(db.String(64), nullable=False, index=True)
    detail = db.Column(db.String(255), nullable=True)
    ip_hash = db.Column(db.String(64), nullable=True)  # hashed, never raw IP
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "action": self.action,
            "detail": self.detail,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class ApiKey(db.Model):  # type: ignore[name-defined]
    """A per-user API key for the public API (stored as a hash; shown once)."""

    __tablename__ = "api_key"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=True)
    prefix = db.Column(db.String(16), unique=True, nullable=False, index=True)
    key_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    last_used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)

    @staticmethod
    def hash_secret(prefix: str, secret: str) -> str:
        return hashlib.sha256(f"{prefix}:{secret}".encode("utf-8")).hexdigest()

    @classmethod
    def issue(cls, user_id: int, name: str | None) -> tuple["ApiKey", str]:
        """Create a key; return (row, full_plaintext_token shown once)."""
        prefix = "csk_" + secrets.token_hex(4)
        secret = secrets.token_urlsafe(32)
        row = cls(user_id=user_id, name=name, prefix=prefix, key_hash=cls.hash_secret(prefix, secret))
        token = f"{prefix}.{secret}"
        return row, token

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "prefix": self.prefix,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastUsedAt": self.last_used_at.isoformat() if self.last_used_at else None,
            "revoked": self.revoked_at is not None,
        }
