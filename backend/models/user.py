"""User model — authentication and authorization."""

from __future__ import annotations

from flask_login import UserMixin
from sqlalchemy.sql import func
from werkzeug.security import check_password_hash, generate_password_hash

from backend.extensions import db


class User(db.Model, UserMixin):  # type: ignore[name-defined]
    """Application user with hashed password storage."""

    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)

    # Self-service accounts.  ``email`` is nullable so the legacy admin-only
    # accounts (created without an address) keep working; uniqueness is enforced
    # at the app layer as well, because a plain SQLite ``ALTER TABLE ADD COLUMN``
    # on an existing database cannot add a UNIQUE constraint retroactively.
    email = db.Column(db.String(255), unique=True, nullable=True, index=True)
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    analyses = db.relationship("Analysis", backref="user", lazy="dynamic")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f"<User {self.username!r}>"
