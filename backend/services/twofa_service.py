"""TOTP two-factor auth + recovery codes.

The TOTP secret is stored encrypted on the user row; recovery codes are stored
as hashes and consumed on use. All verification is constant-time where it
matters (TOTP window handling is inside pyotp).
"""

from __future__ import annotations

import hmac
import json
import secrets
import time as _time

import pyotp
from sqlalchemy import update

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


def provisioning_uri(user, secret: str, issuer: str = "Clone Lens") -> str:
    label = user.email or user.username
    return pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolerates ~30s clock skew on either side.
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def verify_totp_step(secret: str, code: str) -> int | None:
    """Return the matched TOTP time-step (counter) if *code* is valid within the
    ±1 window, else ``None``.  Mirrors ``verify_totp``'s window but exposes which
    step matched so callers can enforce single-use of a step (anti-replay)."""
    if not secret or not code:
        return None
    totp = pyotp.TOTP(secret)
    normalized = code.strip().replace(" ", "")
    interval = int(totp.interval)
    now = int(_time.time())
    for offset in (-1, 0, 1):
        for_time = now + offset * interval
        # Constant-time compare against each window's expected code.
        if hmac.compare_digest(str(totp.at(for_time)), normalized):
            return for_time // interval
    return None


def verify_and_consume_totp(user, code: str) -> bool:
    """Verify a TOTP code for *user* and reject replays of an already-used step.

    A TOTP code stays valid for a ~90s window, so without recording the last
    accepted step a captured code could be re-submitted to mint additional
    sessions.  Records the matched step on the user (the caller must commit) and
    refuses any step less than or equal to the last one accepted.
    """
    secret = get_secret(user)
    if not secret:
        return False
    step = verify_totp_step(secret, code)
    if step is None:
        return False
    last = getattr(user, "last_totp_step", None)
    if last is not None and step <= last:
        return False
    user.last_totp_step = step
    return True


def generate_recovery_codes() -> tuple[list[str], str]:
    """Return (plaintext codes to show once, json of hashes to store)."""
    plain = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(_RECOVERY_CODE_COUNT)]
    hashes = [hash_code(code) for code in plain]
    return plain, json.dumps(hashes)


def consume_recovery_code(user, code: str) -> bool:
    """Return True (and remove the code) if *code* matches an unused recovery code.

    Consumption is atomic via compare-and-swap so a one-time code cannot be
    redeemed more than once through a race.  A plain read-modify-write (load the
    JSON list, pop the match, reassign) let two concurrent requests carrying the
    same code both read the identical list, both pop, and both commit —
    last-write-wins, and both requests passed the 2FA gate.  The
    ``UPDATE ... WHERE recovery_codes_json = <old value>`` below only affects a
    row when the stored value is still exactly what we read, so of two racing
    requests at most one gets ``rowcount == 1``; the loser fails closed.
    """
    if not user.recovery_codes_json:
        return False
    try:
        hashes = json.loads(user.recovery_codes_json)
    except (ValueError, TypeError):
        return False
    normalized = code.strip().lower()
    for i, hashed in enumerate(hashes):
        if verify_code(normalized, hashed):
            from backend.extensions import db
            from backend.models.user import User

            old_json = user.recovery_codes_json
            remaining = list(hashes)
            remaining.pop(i)
            new_json = json.dumps(remaining)
            result = db.session.execute(
                update(User)
                .where(User.id == user.id, User.recovery_codes_json == old_json)
                .values(recovery_codes_json=new_json)
            )
            if result.rowcount != 1:
                # Another request consumed a code (changing the list) between our
                # read and write — treat this attempt as a miss.
                return False
            # Keep the in-memory instance consistent with the row we just wrote.
            user.recovery_codes_json = new_json
            return True
    return False


def clear_2fa(user) -> None:
    user.totp_secret_encrypted = None
    user.totp_enabled = False
    user.recovery_codes_json = None
