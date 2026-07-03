"""Application-level field encryption for sensitive columns at rest.

Provides :class:`EncryptedText`, a SQLAlchemy ``TypeDecorator`` that
transparently encrypts a TEXT column on write and decrypts it on read using
Fernet (AES-128-CBC + HMAC-SHA256).  The key is derived from
``DATA_ENCRYPTION_KEY`` (falling back to ``SECRET_KEY``) at query time, so
models can declare the column type at import time without an app context.

Backward compatibility
----------------------
Rows written before encryption was enabled are stored as plaintext.  On read,
any value that is not one of our ciphertext tokens (prefix ``fenc1:``) is
returned unchanged, so legacy plaintext keeps working.  New writes are always
encrypted.  If no key is resolvable (misconfigured environment) the value is
stored as-is rather than crashing the request path.
"""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from backend.extensions import db

logger = logging.getLogger(__name__)

# Marker prefix so reads can distinguish our ciphertext from legacy plaintext
# rows written before encryption existed.
_ENC_PREFIX = "fenc1:"

# Cache one Fernet per raw key string (keys never rotate within a process).
_fernet_cache: dict[str, Fernet] = {}


def _resolve_key() -> str | None:
    """Return the raw key material from app config, or None if unavailable."""
    try:
        from flask import current_app

        cfg = current_app.config
        return cfg.get("DATA_ENCRYPTION_KEY") or cfg.get("SECRET_KEY") or None
    except Exception:  # pragma: no cover - no app context
        return None


def _fernet() -> Fernet | None:
    raw = _resolve_key()
    if not raw:
        return None
    cached = _fernet_cache.get(raw)
    if cached is not None:
        return cached
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    fernet = Fernet(base64.urlsafe_b64encode(digest))
    _fernet_cache[raw] = fernet
    return fernet


def encrypt_text(value):
    """Encrypt *value* (str) for storage; return plaintext unchanged if no key."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    fernet = _fernet()
    if fernet is None:
        return value
    token = fernet.encrypt(value.encode("utf-8")).decode("ascii")
    return _ENC_PREFIX + token


def decrypt_text(value):
    """Decrypt a stored value; pass through legacy plaintext untouched.

    If a value that IS our ciphertext (``fenc1:`` prefix) cannot be decrypted —
    a rotated/absent key — we return ``None`` rather than the raw token.  That
    surfaces the field as *unavailable* instead of handing callers a garbage
    ``fenc1:...`` string (which would, e.g., break ``json.loads(snapshot_json)``
    and export ciphertext as the user's "data").
    """
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith(_ENC_PREFIX):
        return value  # legacy plaintext (or already-decrypted)
    fernet = _fernet()
    if fernet is not None:
        try:
            return fernet.decrypt(value[len(_ENC_PREFIX):].encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError):
            pass
    logger.error(
        "Cannot decrypt an encrypted field (key rotated or unavailable); returning "
        "None. Set a stable DATA_ENCRYPTION_KEY to avoid this.")
    return None


class EncryptedText(db.TypeDecorator):  # type: ignore[name-defined]
    """A TEXT column whose Python value is transparently encrypted at rest."""

    impl = db.Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_text(value)

    def process_result_value(self, value, dialect):
        return decrypt_text(value)
