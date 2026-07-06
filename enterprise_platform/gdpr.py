"""GDPR erasure across the enterprise datastore (Tombstone pattern).

``purge_user_from_enterprise(uid, tombstone_uid)`` is called best-effort from the
core account-deletion flow. Policy:

  * Workspaces the departing user SOLELY owns  -> HARD DELETE all proprietary
    data (source artifacts, similarity matches, repositories, snapshots, scans,
    policies, cases, evidence, feedback, profiles, API keys, memberships, and the
    workspace + its now-empty organization).
  * Enterprise audit logs               -> REASSIGN actor to the tombstone
    (append-only trail retained, PII anonymized).
  * Feedback authorship (NOT NULL)      -> REASSIGN to the tombstone.
  * created_by / assigned_to / requested_by tracking columns -> NULLIFY.
  * The user's memberships in shared workspaces -> DELETE.

Runs in its own enterprise session; the caller wraps it so a failure never blocks
the core deletion.
"""

from __future__ import annotations

import logging

from sqlalchemy import delete, func, select, update

logger = logging.getLogger(__name__)


def _hard_delete_workspace(session, workspace_id: int) -> None:
    """Delete a workspace and every row that belongs to it, in FK-safe order."""
    from enterprise_platform.models import (
        ApiCredential,
        AuditLog,
        CodeArtifact,
        ComplianceProfile,
        FeedbackEvent,
        Organization,
        PolicyExecution,
        PolicyRule,
        PolicySet,
        RepositoryConnection,
        RepositorySnapshot,
        ReviewCase,
        ReviewEvidence,
        ScanJob,
        SimilarityMatch,
        ThresholdProfile,
        Workspace,
        WorkspaceMembership,
    )

    repo_ids = session.execute(
        select(RepositoryConnection.id).where(RepositoryConnection.workspace_id == workspace_id)
    ).scalars().all()
    case_ids = session.execute(
        select(ReviewCase.id).where(ReviewCase.workspace_id == workspace_id)
    ).scalars().all()
    policy_set_ids = session.execute(
        select(PolicySet.id).where(PolicySet.workspace_id == workspace_id)
    ).scalars().all()

    # Leaf children first.
    if case_ids:
        session.execute(delete(ReviewEvidence).where(ReviewEvidence.case_id.in_(case_ids)))
    session.execute(delete(FeedbackEvent).where(FeedbackEvent.workspace_id == workspace_id))
    session.execute(delete(PolicyExecution).where(PolicyExecution.workspace_id == workspace_id))
    session.execute(delete(ReviewCase).where(ReviewCase.workspace_id == workspace_id))
    if policy_set_ids:
        session.execute(delete(PolicyRule).where(PolicyRule.policy_set_id.in_(policy_set_ids)))
    session.execute(delete(PolicySet).where(PolicySet.workspace_id == workspace_id))
    session.execute(delete(SimilarityMatch).where(SimilarityMatch.workspace_id == workspace_id))

    # Break the ScanJob <-> RepositorySnapshot circular FK before deleting either.
    session.execute(update(ScanJob).where(ScanJob.workspace_id == workspace_id).values(snapshot_id=None))
    if repo_ids:
        session.execute(
            update(RepositorySnapshot).where(RepositorySnapshot.repository_id.in_(repo_ids)).values(scan_job_id=None)
        )

    session.execute(delete(CodeArtifact).where(CodeArtifact.workspace_id == workspace_id))
    session.execute(delete(ScanJob).where(ScanJob.workspace_id == workspace_id))
    if repo_ids:
        session.execute(delete(RepositorySnapshot).where(RepositorySnapshot.repository_id.in_(repo_ids)))
    session.execute(delete(RepositoryConnection).where(RepositoryConnection.workspace_id == workspace_id))
    session.execute(delete(ThresholdProfile).where(ThresholdProfile.workspace_id == workspace_id))
    session.execute(delete(ComplianceProfile).where(ComplianceProfile.workspace_id == workspace_id))
    session.execute(delete(ApiCredential).where(ApiCredential.workspace_id == workspace_id))
    # Detach (retain) audit rows from the workspace being removed.
    session.execute(update(AuditLog).where(AuditLog.workspace_id == workspace_id).values(workspace_id=None))
    session.execute(delete(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace_id))

    org_id = session.execute(
        select(Workspace.organization_id).where(Workspace.id == workspace_id)
    ).scalar_one_or_none()
    session.execute(delete(Workspace).where(Workspace.id == workspace_id))

    # Remove the organization if it no longer owns any workspace.
    if org_id is not None:
        remaining = session.execute(
            select(func.count(Workspace.id)).where(Workspace.organization_id == org_id)
        ).scalar_one()
        if remaining == 0:
            session.execute(delete(ApiCredential).where(ApiCredential.organization_id == org_id))
            session.execute(delete(Organization).where(Organization.id == org_id))


def _anonymize_attribution(session, uid: int, tombstone_uid: int) -> None:
    from enterprise_platform.models import (
        ApiCredential,
        AuditLog,
        FeedbackEvent,
        Organization,
        PolicySet,
        RepositoryConnection,
        ReviewCase,
        ScanJob,
        Workspace,
    )

    # Retain-but-anonymize: append-only enterprise audit trail.
    session.execute(
        update(AuditLog).where(AuditLog.actor_legacy_user_id == uid).values(actor_legacy_user_id=tombstone_uid)
    )
    # Feedback authorship is NOT NULL -> reassign to the tombstone.
    session.execute(
        update(FeedbackEvent).where(FeedbackEvent.legacy_user_id == uid).values(legacy_user_id=tombstone_uid)
    )
    # Nullify all created_by / requested_by / assigned_to tracking columns.
    session.execute(update(Organization).where(Organization.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))
    session.execute(update(Workspace).where(Workspace.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))
    session.execute(update(RepositoryConnection).where(RepositoryConnection.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))
    session.execute(update(ScanJob).where(ScanJob.requested_by_legacy_user_id == uid).values(requested_by_legacy_user_id=None))
    session.execute(update(PolicySet).where(PolicySet.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))
    session.execute(update(ReviewCase).where(ReviewCase.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))
    session.execute(update(ReviewCase).where(ReviewCase.assigned_to_legacy_user_id == uid).values(assigned_to_legacy_user_id=None))
    session.execute(update(ApiCredential).where(ApiCredential.created_by_legacy_user_id == uid).values(created_by_legacy_user_id=None))


def purge_user_from_enterprise(legacy_user_id: int, tombstone_legacy_user_id: int) -> dict:
    """Erase a departing user across the enterprise datastore. Returns a summary."""
    from enterprise_platform.models import WorkspaceMembership
    from enterprise_platform.utils import session_scope

    uid = int(legacy_user_id)
    tombstone_uid = int(tombstone_legacy_user_id)
    hard_deleted: list[int] = []

    with session_scope() as session:
        member_ws_ids = session.execute(
            select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.legacy_user_id == uid)
        ).scalars().all()

        for ws_id in set(member_ws_ids):
            owners = session.execute(
                select(WorkspaceMembership.legacy_user_id).where(
                    WorkspaceMembership.workspace_id == ws_id,
                    WorkspaceMembership.role == "owner",
                )
            ).scalars().all()
            # Sole owner => the user is the only owner of this workspace.
            if set(owners) == {uid}:
                _hard_delete_workspace(session, ws_id)
                hard_deleted.append(ws_id)

        _anonymize_attribution(session, uid, tombstone_uid)

        # Remove the user's memberships in any workspaces that survived.
        session.execute(delete(WorkspaceMembership).where(WorkspaceMembership.legacy_user_id == uid))

    summary = {"soleOwnedWorkspacesHardDeleted": len(hard_deleted), "workspaceIds": hard_deleted}
    logger.info("Enterprise GDPR purge for user %s: %s", uid, summary)
    return summary
