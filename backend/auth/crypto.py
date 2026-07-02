"""Symmetric encryption for small secrets stored on core models (e.g. the TOTP
secret). Keyed off the app SECRET_KEY via HKDF, so no extra key material is
required. Recovery codes are hashed (not encrypted) with werkzeug instead.

This is intentionally tiny — the enterprise platform has its own richer,
versioned scheme; core only needs to protect the odd secret column.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from flask import current_app


def _fernet() -> Fernet:
    secret = current_app.config["SECRET_KEY"]
    raw = secret.encode("utf-8") if isinstance(secret, str) else bytes(secret)
    derived = HKDF(
        algorithm=hashes.SHA256(), length=32,
        salt=b"codesimilar-core-fernet-v1", info=b"core-secret-encryption",
    ).derive(raw)
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return None


def hash_code(code: str) -> str:
    """Hash a recovery code for at-rest storage (compare with verify_code)."""
    from werkzeug.security import generate_password_hash
    return generate_password_hash(code)


def verify_code(code: str, hashed: str) -> bool:
    from werkzeug.security import check_password_hash
    try:
        return check_password_hash(hashed, code)
    except Exception:
        return False
