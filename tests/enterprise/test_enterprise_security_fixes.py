"""Tests for the enterprise security/correctness fixes.

Covers:
  * webhook secret verification accepting the issued full token,
  * the human-actor guard that stops API keys from minting/revoking keys,
  * evidence excerpt encryption round-trip (with legacy plaintext fallback),
  * the additive auto-migration that adds webhook_secret_encrypted to
    pre-existing databases.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text

from enterprise_platform.models import EnterpriseError, EnterpriseStorage
from enterprise_platform.utils import (
    issue_webhook_secret,
    require_human_actor,
    verify_webhook_secret,
)

RAW_KEY = "unit-test-enterprise-key-1234567890"


class _StubApp:
    def __init__(self, uri: str = "sqlite:///:memory:") -> None:
        self.config = {
            "SQLALCHEMY_DATABASE_URI": uri,
            "SECRET_KEY": "stub-secret",
            "TESTING": True,
        }


@pytest.fixture()
def storage(monkeypatch):
    monkeypatch.setenv("ENTERPRISE_DATA_KEY", RAW_KEY)
    store = EnterpriseStorage()
    store.configure(_StubApp())
    return store


class TestWebhookSecretVerification:
    def test_full_issued_token_verifies(self):
        hint, secret_hash, full_token = issue_webhook_secret()
        # The API hands the caller the FULL token; pasting it verbatim into a
        # webhook configuration must verify.
        assert verify_webhook_secret(hint, secret_hash, full_token)

    def test_bare_secret_part_verifies(self):
        hint, secret_hash, full_token = issue_webhook_secret()
        bare_secret = full_token.split(".", 1)[1]
        assert verify_webhook_secret(hint, secret_hash, bare_secret)

    def test_wrong_secret_rejected(self):
        hint, secret_hash, _ = issue_webhook_secret()
        assert not verify_webhook_secret(hint, secret_hash, "wrong-secret")
        assert not verify_webhook_secret(hint, secret_hash, f"{hint}.wrong")
        assert not verify_webhook_secret(hint, secret_hash, "")
        assert not verify_webhook_secret(None, secret_hash, "anything")


class TestHumanActorGuard:
    def test_api_key_actor_rejected(self):
        actor = {"kind": "api_key", "scopes": ["workspace:1:write"], "is_admin": False}
        with pytest.raises(EnterpriseError) as excinfo:
            require_human_actor(actor)
        assert excinfo.value.status_code == 403
        assert excinfo.value.code == "human_actor_required"

    def test_session_and_cli_actors_pass(self):
        require_human_actor({"kind": "user", "is_admin": False})
        require_human_actor({"kind": "cli", "is_admin": True})


class TestEvidenceExcerptEncryption:
    def test_round_trip(self, storage, monkeypatch):
        import enterprise_platform.services as services
        monkeypatch.setattr(services, "storage", storage)

        class _Row:
            payload_json = None

        row = _Row()
        encrypted = storage.encrypt_text("def secret(): pass")
        row.payload_json = (
            '{"path": "a.py", "excerptEncrypted": ' + _json_quote(encrypted) + "}"
        )
        payload = services._evidence_payload_for_display(row)
        assert payload["excerpt"] == "def secret(): pass"
        assert "excerptEncrypted" not in payload
        # The stored payload itself must not contain the plaintext.
        assert "def secret" not in row.payload_json

    def test_legacy_plaintext_passthrough(self, storage, monkeypatch):
        import enterprise_platform.services as services
        monkeypatch.setattr(services, "storage", storage)

        class _Row:
            payload_json = '{"path": "a.py", "excerpt": "legacy plaintext"}'

        payload = services._evidence_payload_for_display(_Row())
        assert payload["excerpt"] == "legacy plaintext"


def _json_quote(value: str) -> str:
    import json
    return json.dumps(value)


class TestAdditiveMigration:
    def test_existing_table_gains_new_column(self, monkeypatch, tmp_path):
        """A database created BEFORE webhook_secret_encrypted existed must be
        upgraded in place by configure()."""
        db_file = tmp_path / "legacy.db"
        uri = f"sqlite:///{db_file.as_posix()}"

        # Simulate the legacy schema: the table exists without the column.
        engine = create_engine(uri)
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE enterprise_repository_connection ("
                "id INTEGER PRIMARY KEY, workspace_id INTEGER, provider VARCHAR(24), "
                "name VARCHAR(255), webhook_secret_hash VARCHAR(128), "
                "webhook_secret_hint VARCHAR(24))"
            ))
        engine.dispose()

        monkeypatch.setenv("ENTERPRISE_DATA_KEY", RAW_KEY)
        store = EnterpriseStorage()
        store.configure(_StubApp(uri))

        inspector = inspect(store._engine)
        columns = {c["name"] for c in inspector.get_columns("enterprise_repository_connection")}
        assert "webhook_secret_encrypted" in columns
