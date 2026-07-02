"""HTTP-level authorization tests for enterprise routes.

Locks the Phase-A security fixes:
  * add_workspace_member now refuses API-key actors (require_human_actor),
    so a leaked workspace:write key cannot mint or upgrade members.
  * git/probe is now workspace-scoped and admin-gated instead of open to any
    authenticated caller.

This is the first harness that drives the enterprise HTTP API. It uses a
temporary *file* SQLite database (not :memory:) so the data seeded through the
global EnterpriseStorage session and the data read inside a request share the
same connection/database.
"""

from __future__ import annotations

import json

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from enterprise_platform.models import ApiCredential, Organization, Workspace
from enterprise_platform.utils import issue_api_key, session_scope, utcnow


@pytest.fixture(scope="module")
def ent_app(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("ent") / "authz.db"
    uri = f"sqlite:///{db_file.as_posix()}"
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": uri,
        "DATABASE_URL": uri,
        "SECRET_KEY": "test-secret-key-not-for-production",
        "ENTERPRISE_DATA_KEY": "test-enterprise-key-authz",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture(scope="module")
def seeded(ent_app):
    """Seed one org + workspace and two API keys (write- and read-scoped)."""
    with ent_app.app_context():
        with session_scope() as session:
            org = Organization(slug="authz-org", name="Authz Org",
                               created_by_legacy_user_id=1, created_at=utcnow())
            session.add(org)
            session.flush()
            workspace = Workspace(organization_id=org.id, slug="ws", name="WS",
                                  created_by_legacy_user_id=1, created_at=utcnow())
            session.add(workspace)
            session.flush()
            workspace_id = workspace.id

            def make_key(scope: str) -> str:
                prefix, token_hash, token = issue_api_key()
                session.add(ApiCredential(
                    organization_id=org.id,
                    workspace_id=workspace_id,
                    name=f"key-{scope}",
                    token_prefix=prefix,
                    token_hash=token_hash,
                    scopes_json=json.dumps([f"workspace:{workspace_id}:{scope}"]),
                    created_by_legacy_user_id=1,
                    created_at=utcnow(),
                ))
                return token

            write_token = make_key("write")
            read_token = make_key("read")
    return {"workspace_id": workspace_id, "write_token": write_token, "read_token": read_token}


@pytest.fixture()
def client(ent_app):
    return ent_app.test_client()


class TestAddMemberBlocksApiKeys:
    def test_write_scoped_api_key_cannot_add_member(self, client, seeded):
        """A workspace:write key maps to admin-equivalent access, so without the
        human-actor guard it could upgrade members. The guard must return 403
        before any membership is written."""
        resp = client.post(
            f"/api/enterprise/v1/workspaces/{seeded['workspace_id']}/members",
            json={"legacyUserId": 999, "role": "admin"},
            headers={"X-API-Key": seeded["write_token"]},
        )
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "human_actor_required"

    def test_missing_credentials_unauthorized(self, client, seeded):
        resp = client.post(
            f"/api/enterprise/v1/workspaces/{seeded['workspace_id']}/members",
            json={"legacyUserId": 999, "role": "admin"},
        )
        assert resp.status_code == 401


class TestGitProbeIsWorkspaceScoped:
    def test_missing_workspace_id_rejected(self, client, seeded):
        resp = client.post(
            "/api/enterprise/v1/git/probe",
            json={"cloneUrl": "https://github.com/owner/repo"},
            headers={"X-API-Key": seeded["write_token"]},
        )
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "missing_workspace_id"

    def test_read_scoped_key_cannot_probe(self, client, seeded):
        """Probing spawns git against an arbitrary URL — it must require admin
        access to the target workspace, so a read-only key is refused before any
        subprocess runs."""
        resp = client.post(
            "/api/enterprise/v1/git/probe",
            json={"workspaceId": seeded["workspace_id"],
                  "cloneUrl": "https://github.com/owner/repo"},
            headers={"X-API-Key": seeded["read_token"]},
        )
        assert resp.status_code == 403

    def test_unauthenticated_probe_never_reaches_git(self, client, seeded):
        """No credentials: rejected at auth, not at the subprocess."""
        resp = client.post(
            "/api/enterprise/v1/git/probe",
            json={"workspaceId": seeded["workspace_id"],
                  "cloneUrl": "https://github.com/owner/repo"},
        )
        assert resp.status_code == 401
