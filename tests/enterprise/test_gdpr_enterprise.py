"""Enterprise GDPR erasure (Tombstone pattern) tests.

Asserts purge_user_from_enterprise:
  * HARD DELETES workspaces the user solely owns (source artifacts + matches +
    repos + the workspace itself),
  * leaves shared workspaces intact but removes the user's membership,
  * RETAINS enterprise audit + feedback, reassigned to the tombstone,
  * nullifies created_by attribution.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from backend.app_factory import create_app
from backend.extensions import db as _db
from enterprise_platform.gdpr import purge_user_from_enterprise
from enterprise_platform.models import (
    AuditLog,
    CodeArtifact,
    FeedbackEvent,
    Organization,
    RepositoryConnection,
    RepositorySnapshot,
    ReviewCase,
    ReviewEvidence,
    SimilarityMatch,
    Workspace,
    WorkspaceMembership,
)
from enterprise_platform.utils import session_scope, utcnow

UID = 501
OTHER = 502
TOMBSTONE = 999


@pytest.fixture(scope="module")
def ent_app(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("ent-gdpr") / "gdpr.db"
    uri = f"sqlite:///{db_file.as_posix()}"
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": uri, "DATABASE_URL": uri,
        "SECRET_KEY": "test-secret-key-not-for-production",
        "ENTERPRISE_DATA_KEY": "test-enterprise-key-gdpr",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


def _seed_workspace(session, org_id, slug):
    ws = Workspace(organization_id=org_id, slug=slug, name=slug, created_at=utcnow())
    session.add(ws)
    session.flush()
    repo = RepositoryConnection(workspace_id=ws.id, provider="local", name=f"{slug}-repo", created_at=utcnow())
    session.add(repo)
    session.flush()
    snap = RepositorySnapshot(repository_id=repo.id, status="completed")
    session.add(snap)
    session.flush()
    arts = []
    for i in range(2):
        art = CodeArtifact(
            workspace_id=ws.id, repository_id=repo.id, snapshot_id=snap.id,
            logical_path=f"{slug}{i}.py", language="python", language_family="dynamic",
            normalized_hash=f"{slug}h{i}", raw_sha256=f"{slug}r{i}",
            canonical_source_encrypted="e", raw_source_encrypted="e",
            embedding_vector="", created_at=utcnow(),
        )
        session.add(art)
        arts.append(art)
    session.flush()
    match = SimilarityMatch(
        workspace_id=ws.id, snapshot_id=snap.id, artifact_a_id=arts[0].id, artifact_b_id=arts[1].id,
        similarity_score=0.9, structural_score=0.9, semantic_score=0.9, token_score=0.9,
        clone_type="type_1", created_at=utcnow(),
    )
    session.add(match)
    session.flush()
    case = ReviewCase(
        workspace_id=ws.id, match_id=match.id, status="open", severity="high",
        clone_type="type_1", confidence_score=0.9, created_at=utcnow(), updated_at=utcnow(),
    )
    session.add(case)
    session.flush()
    session.add(ReviewEvidence(case_id=case.id, evidence_type="source", title="t", created_at=utcnow()))
    return ws, case


@pytest.fixture(scope="module")
def seeded(ent_app):
    with ent_app.app_context():
        with session_scope() as s:
            org = Organization(slug="g-org", name="G", created_by_legacy_user_id=UID, created_at=utcnow())
            s.add(org)
            s.flush()
            ws1, _ = _seed_workspace(s, org.id, "sole")          # solely owned by UID
            ws2, case2 = _seed_workspace(s, org.id, "shared")    # UID is a reviewer, OTHER owns
            ws2.created_by_legacy_user_id = UID                  # attribution to be nullified

            s.add(WorkspaceMembership(workspace_id=ws1.id, legacy_user_id=UID, role="owner", created_at=utcnow()))
            s.add(WorkspaceMembership(workspace_id=ws2.id, legacy_user_id=UID, role="reviewer", created_at=utcnow()))
            s.add(WorkspaceMembership(workspace_id=ws2.id, legacy_user_id=OTHER, role="owner", created_at=utcnow()))
            s.add(FeedbackEvent(workspace_id=ws2.id, case_id=case2.id, legacy_user_id=UID, label="accurate", created_at=utcnow()))
            s.add(AuditLog(workspace_id=ws1.id, actor_legacy_user_id=UID, action="scan.trigger", entity_type="scan", created_at=utcnow()))
            s.add(AuditLog(workspace_id=ws2.id, actor_legacy_user_id=UID, action="case.resolve", entity_type="case", created_at=utcnow()))
            ids = {"ws1": ws1.id, "ws2": ws2.id, "org": org.id}
    return ids


def test_enterprise_purge_hard_deletes_sole_and_anonymizes_rest(ent_app, seeded):
    with ent_app.app_context():
        summary = purge_user_from_enterprise(UID, TOMBSTONE)
        assert seeded["ws1"] in summary["workspaceIds"]
        assert seeded["ws2"] not in summary["workspaceIds"]

        with session_scope() as s:
            def count(model, *where):
                return s.execute(select(func.count(model.id)).where(*where)).scalar_one()

            # Sole-owned workspace + all its source data hard-deleted.
            assert s.get(Workspace, seeded["ws1"]) is None
            assert count(CodeArtifact, CodeArtifact.workspace_id == seeded["ws1"]) == 0
            assert count(SimilarityMatch, SimilarityMatch.workspace_id == seeded["ws1"]) == 0
            assert count(RepositoryConnection, RepositoryConnection.workspace_id == seeded["ws1"]) == 0

            # Shared workspace survives with its non-departing owner intact.
            assert s.get(Workspace, seeded["ws2"]) is not None
            assert count(CodeArtifact, CodeArtifact.workspace_id == seeded["ws2"]) == 2
            assert count(WorkspaceMembership, WorkspaceMembership.legacy_user_id == UID) == 0
            assert count(WorkspaceMembership,
                         WorkspaceMembership.workspace_id == seeded["ws2"],
                         WorkspaceMembership.legacy_user_id == OTHER) == 1

            # Feedback RETAINED, authorship reassigned to the tombstone.
            fb = s.execute(select(FeedbackEvent).where(FeedbackEvent.workspace_id == seeded["ws2"])).scalars().all()
            assert len(fb) == 1 and fb[0].legacy_user_id == TOMBSTONE

            # Audit RETAINED, actor anonymized to the tombstone (both rows).
            assert count(AuditLog, AuditLog.actor_legacy_user_id == UID) == 0
            assert count(AuditLog, AuditLog.actor_legacy_user_id == TOMBSTONE) == 2

            # created_by attribution nullified on the surviving workspace + org.
            assert s.get(Workspace, seeded["ws2"]).created_by_legacy_user_id is None
            assert s.get(Organization, seeded["org"]).created_by_legacy_user_id is None
