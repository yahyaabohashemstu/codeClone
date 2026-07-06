"""Direct unit test for enterprise ``build_workspace_analytics``.

Covers the 2026-07-06 SQL-aggregate rewrite (exact counts, the four
similarity-spread bucket-boundary count queries, and the clone-type GROUP BY),
which previously had zero test coverage. Uses a temporary *file* SQLite DB so the
global EnterpriseStorage session sees the seeded rows.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from enterprise_platform.models import (
    CodeArtifact,
    Organization,
    RepositoryConnection,
    RepositorySnapshot,
    SimilarityMatch,
    Workspace,
)
from enterprise_platform.services import build_workspace_analytics
from enterprise_platform.utils import session_scope, utcnow


@pytest.fixture(scope="module")
def analytics_ctx(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("ent-analytics") / "analytics.db"
    uri = f"sqlite:///{db_file.as_posix()}"
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": uri,
        "DATABASE_URL": uri,
        "SECRET_KEY": "test-secret-key-not-for-production",
        "ENTERPRISE_DATA_KEY": "test-enterprise-key-analytics",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
    })
    with application.app_context():
        _db.create_all()
        with session_scope() as session:
            org = Organization(slug="an-org", name="Analytics Org",
                               created_by_legacy_user_id=1, created_at=utcnow())
            session.add(org)
            session.flush()
            ws = Workspace(organization_id=org.id, slug="an-ws", name="WS",
                           created_by_legacy_user_id=1, created_at=utcnow())
            session.add(ws)
            session.flush()
            repo = RepositoryConnection(workspace_id=ws.id, provider="local",
                                        name="repo-a", created_at=utcnow())
            session.add(repo)
            session.flush()
            snap = RepositorySnapshot(repository_id=repo.id, status="completed")
            session.add(snap)
            session.flush()

            arts = []
            for i in range(5):
                art = CodeArtifact(
                    workspace_id=ws.id, repository_id=repo.id, snapshot_id=snap.id,
                    logical_path=f"src/f{i}.py", language="python",
                    language_family="dynamic", normalized_hash=f"n{i}", raw_sha256=f"r{i}",
                    canonical_source_encrypted="enc", raw_source_encrypted="enc",
                    embedding_vector="", created_at=utcnow(),
                )
                session.add(art)
                arts.append(art)
            session.flush()

            # Scores chosen to land one per bucket boundary:
            #   [0,0.25) [0.25,0.5) [0.5,0.75) [0.75, ..]
            pairs = [
                (arts[0], arts[1], 0.10, "type_1"),
                (arts[0], arts[2], 0.25, "type_2"),   # boundary -> 25-50
                (arts[0], arts[3], 0.60, "type_3"),
                (arts[0], arts[4], 0.75, "type_3"),    # boundary -> 75-100
                (arts[1], arts[2], 0.99, "type_1"),
            ]
            for a, b, score, ctype in pairs:
                session.add(SimilarityMatch(
                    workspace_id=ws.id, snapshot_id=snap.id,
                    artifact_a_id=a.id, artifact_b_id=b.id,
                    similarity_score=score, structural_score=score,
                    semantic_score=score, token_score=score, clone_type=ctype,
                    created_at=utcnow(),
                ))
            workspace_id = ws.id
        yield {"app": application, "workspace_id": workspace_id}
        _db.drop_all()


def test_analytics_exact_counts_buckets_and_clone_types(analytics_ctx):
    with analytics_ctx["app"].app_context():
        with session_scope() as session:
            result = build_workspace_analytics(session, analytics_ctx["workspace_id"])

    assert result["artifacts"] == 5
    assert result["matches"] == 5
    assert result["repositories"] == 1

    spread = {row["bucket"]: row["count"] for row in result["similaritySpread"]}
    assert spread == {"0-25": 1, "25-50": 1, "50-75": 1, "75-100": 2}

    clone_types = {row["cloneType"]: row["count"] for row in result["cloneTypes"]}
    assert clone_types == {"type_1": 2, "type_2": 1, "type_3": 2}

    # The strongest match (0.99) is a genuine edge in the cluster graph.
    assert result["heatmap"]["repositories"] == ["repo-a"]
    assert isinstance(result["clusters"], list)


def test_analytics_empty_workspace_does_not_crash(analytics_ctx):
    """A workspace with no artifacts/matches must return zeroed aggregates."""
    with analytics_ctx["app"].app_context():
        with session_scope() as session:
            org = Organization(slug="empty-org", name="Empty",
                               created_by_legacy_user_id=1, created_at=utcnow())
            session.add(org)
            session.flush()
            ws = Workspace(organization_id=org.id, slug="empty-ws", name="Empty WS",
                           created_by_legacy_user_id=1, created_at=utcnow())
            session.add(ws)
            session.flush()
            result = build_workspace_analytics(session, ws.id)

    assert result["artifacts"] == 0
    assert result["matches"] == 0
    assert result["clusters"] == []
    assert {row["count"] for row in result["similaritySpread"]} == {0}
    assert result["cloneTypes"] == []
