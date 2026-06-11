"""
Tests for enterprise data-at-rest encryption (EnterpriseStorage).

Verifies:
  * v2 round-trips (per-record random salt).
  * Backward-compatible decryption of legacy v1 (fixed-salt HKDF) and v0
    (unsalted SHA-256) ciphertext -- ensuring the existing production database
    remains readable after the migration to the versioned format.
  * Tamper / garbage detection.
"""

from __future__ import annotations

import base64
import hashlib

import pytest
from cryptography.fernet import Fernet

from enterprise_platform.models import EnterpriseStorage, _ENTERPRISE_ENC_V2_PREFIX

RAW_KEY = "unit-test-enterprise-key-1234567890"


class _StubApp:
    """Minimal app stand-in exposing the ``.config`` mapping configure() reads."""

    def __init__(self) -> None:
        self.config = {
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "stub-secret",
            "TESTING": True,
        }


@pytest.fixture()
def storage(monkeypatch):
    monkeypatch.setenv("ENTERPRISE_DATA_KEY", RAW_KEY)
    store = EnterpriseStorage()          # fresh instance, not the global singleton
    store.configure(_StubApp())
    return store


def _legacy_v1_token(plaintext: str) -> str:
    """Reproduce the old fixed-salt HKDF ciphertext format."""
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32,
                salt=b"codeclone-enterprise-v1", info=b"fernet-encryption-key")
    key = base64.urlsafe_b64encode(hkdf.derive(RAW_KEY.encode("utf-8")))
    return Fernet(key).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def _legacy_v0_token(plaintext: str) -> str:
    """Reproduce the oldest unsalted SHA-256 ciphertext format."""
    key = base64.urlsafe_b64encode(hashlib.sha256(RAW_KEY.encode("utf-8")).digest())
    return Fernet(key).encrypt(plaintext.encode("utf-8")).decode("utf-8")


class TestEnterpriseEncryption:

    def test_none_passthrough(self, storage):
        assert storage.encrypt_text(None) is None
        assert storage.decrypt_text(None) is None

    def test_v2_roundtrip(self, storage):
        ct = storage.encrypt_text("secret source code")
        assert ct.startswith(_ENTERPRISE_ENC_V2_PREFIX)
        assert storage.is_v2_ciphertext(ct)
        assert storage.decrypt_text(ct) == "secret source code"

    def test_v2_uses_random_per_record_salt(self, storage):
        a = storage.encrypt_text("identical plaintext")
        b = storage.encrypt_text("identical plaintext")
        assert a != b                       # different salt => different ciphertext
        assert storage.decrypt_text(a) == "identical plaintext"
        assert storage.decrypt_text(b) == "identical plaintext"

    def test_decrypts_legacy_v1(self, storage):
        token = _legacy_v1_token("legacy hkdf payload")
        assert not storage.is_v2_ciphertext(token)
        assert storage.decrypt_text(token) == "legacy hkdf payload"

    def test_decrypts_legacy_v0(self, storage):
        token = _legacy_v0_token("legacy sha256 payload")
        assert storage.decrypt_text(token) == "legacy sha256 payload"

    def test_unicode_roundtrip(self, storage):
        text = "تحليل الكود — 代码 — \U0001f510"
        assert storage.decrypt_text(storage.encrypt_text(text)) == text

    def test_tampered_v2_raises(self, storage):
        ct = storage.encrypt_text("x")
        tampered = ct[:-3] + ("AAA" if not ct.endswith("AAA") else "BBB")
        with pytest.raises(Exception):
            storage.decrypt_text(tampered)

    def test_unknown_garbage_raises(self, storage):
        with pytest.raises(Exception):
            storage.decrypt_text("definitely-not-a-valid-token")
