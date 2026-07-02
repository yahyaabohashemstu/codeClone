"""TOTP two-factor auth + recovery codes.

The TOTP secret is stored encrypted on the user row; recovery codes are stored
as hashes and consumed on use. All verification is constant-time where it
matters (TOTP window handling is inside pyotp).
"""

from __future__ import annotations

import json
import secrets

import pyotp

from backend.auth.crypto import decrypt, encrypt, hash_code, verify_code

_RECOVERY_CODE_COUNT = 10


def generate_secret() -> str:
    return pyotp.random_base32()


def store_secret(user, secret: str) -> None:
    user.totp_secret_encrypted = encrypt(secret)


def get_secret(user) -> str | None:
    if not user.totp_secret_encrypted:
        return None
    return decrypt(user.totp_secret_encrypted)


def provisioning_uri(user, secret: str, issuer: str = "CodeSimilar") -> str:
    label = user.email or user.username
    return pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolerates ~30s clock skew on either side.
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def generate_recovery_codes() -> tuple[list[str], str]:
    """Return (plaintext codes to show once, json of hashes to store)."""
    plain = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(_RECOVERY_CODE_COUNT)]
    hashes = [hash_code(code) for code in plain]
    return plain, json.dumps(hashes)


def consume_recovery_code(user, code: str) -> bool:
    """Return True (and remove the code) if *code* matches an unused recovery code."""
    if not user.recovery_codes_json:
        return False
    try:
        hashes = json.loads(user.recovery_codes_json)
    except (ValueError, TypeError):
        return False
    normalized = code.strip().lower()
    for i, hashed in enumerate(hashes):
        if verify_code(normalized, hashed):
            hashes.pop(i)
            user.recovery_codes_json = json.dumps(hashes)
            return True
    return False


def clear_2fa(user) -> None:
    user.totp_secret_encrypted = None
    user.totp_enabled = False
    user.recovery_codes_json = None
