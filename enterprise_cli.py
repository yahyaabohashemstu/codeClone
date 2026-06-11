from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

from backend.app_factory import create_app
from enterprise_platform.models import (
    ApiCredential,
    CodeArtifact,
    FeedbackEvent,
    Organization,
    RepositoryConnection,
    ReviewCase,
    ScanJob,
    Workspace,
    WorkspaceMembership,
    storage,
)
from enterprise_platform.scans import (
    create_repository_scan_job,
    run_repository_scan,
)
from enterprise_platform.services import (
    build_review_case_report_payload,
    build_workspace_analytics,
    ensure_default_compliance_profile,
    ensure_default_policy_set,
    ensure_threshold_profile,
    fetch_case_bundle,
    serialize_repository,
    serialize_scan_job,
    serialize_workspace,
)
from enterprise_platform.utils import (
    ensure_region_supported,
    issue_api_key,
    issue_webhook_secret,
    normalize_clone_url,
    normalize_local_repository_path,
    normalize_provider,
    session_scope,
    slugify,
    utcnow,
)


app = create_app()


def emit(payload: Any) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2))
    sys.stdout.write("\n")


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("Value must be a positive integer.")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Enterprise administration CLI for the code similarity platform.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    organization_parser = subparsers.add_parser("create-organization", help="Create an enterprise organization.")
    organization_parser.add_argument("--name", required=True)
    organization_parser.add_argument("--slug")
    organization_parser.add_argument("--region", default="global")
    organization_parser.add_argument("--legacy-user-id", type=positive_int, default=1)

    workspace_parser = subparsers.add_parser("create-workspace", help="Create a workspace inside an organization.")
    workspace_parser.add_argument("--organization-id", type=positive_int, required=True)
    workspace_parser.add_argument("--name", required=True)
    workspace_parser.add_argument("--slug")
    workspace_parser.add_argument("--description", default="")
    workspace_parser.add_argument("--region", default="global")
    workspace_parser.add_argument("--similarity-threshold", type=float, default=0.78)
    workspace_parser.add_argument("--semantic-threshold", type=float, default=0.86)
    workspace_parser.add_argument("--legacy-user-id", type=positive_int, default=1)

    member_parser = subparsers.add_parser("add-member", help="Add or update a workspace member.")
    member_parser.add_argument("--workspace-id", type=positive_int, required=True)
    member_parser.add_argument("--legacy-user-id", type=positive_int, required=True)
    member_parser.add_argument("--role", choices=["student", "reviewer", "manager", "admin", "owner"], required=True)

    repository_parser = subparsers.add_parser("create-repository", help="Register a repository for enterprise scanning.")
    repository_parser.add_argument("--workspace-id", type=positive_int, required=True)
    repository_parser.add_argument("--provider", choices=["local", "github", "gitlab"], default="local")
    repository_parser.add_argument("--name", required=True)
    repository_parser.add_argument("--default-branch", default="main")
    repository_parser.add_argument("--region", default="global")
    repository_parser.add_argument("--external-id")
    repository_parser.add_argument("--local-path")
    repository_parser.add_argument("--clone-url")
    repository_parser.add_argument("--legacy-user-id", type=positive_int, default=1)

    api_key_parser = subparsers.add_parser("create-api-key", help="Create a workspace-scoped API key.")
    api_key_parser.add_argument("--workspace-id", type=positive_int, required=True)
    api_key_parser.add_argument("--name", required=True)
    api_key_parser.add_argument("--legacy-user-id", type=positive_int, default=1)
    api_key_parser.add_argument("--expires-in-days", type=int, default=365)
    api_key_parser.add_argument("--scope", action="append", dest="scopes")

    trigger_parser = subparsers.add_parser("trigger-scan", help="Create and optionally run a repository scan.")
    trigger_parser.add_argument("--repository-id", type=positive_int, required=True)
    trigger_parser.add_argument("--workspace-id", type=positive_int, required=True)
    trigger_parser.add_argument("--branch", default="main")
    trigger_parser.add_argument("--commit-sha")
    trigger_parser.add_argument("--legacy-user-id", type=positive_int, default=1)
    trigger_parser.add_argument("--sync", action="store_true", help="Run the scan immediately in-process.")

    analytics_parser = subparsers.add_parser("analytics", help="Print workspace analytics as JSON.")
    analytics_parser.add_argument("--workspace-id", type=positive_int, required=True)

    pdf_parser = subparsers.add_parser("export-case-pdf", help="Generate a native PDF report for a review case.")
    pdf_parser.add_argument("--case-id", type=positive_int, required=True)
    pdf_parser.add_argument("--output", required=True)

    migrate_parser = subparsers.add_parser(
        "migrate-encryption",
        help="Re-encrypt legacy enterprise ciphertext into the current (v2) format.",
    )
    migrate_parser.add_argument("--batch-size", type=positive_int, default=500)
    migrate_parser.add_argument(
        "--dry-run", action="store_true",
        help="Report how many records would be migrated without writing changes.",
    )

    retention_parser = subparsers.add_parser(
        "enforce-retention",
        help=(
            "Purge source-derived data (artifacts, matches, snapshots, resolved "
            "cases + evidence) older than each workspace's ComplianceProfile "
            "retention_days. Workspaces under legal hold are skipped. Scan jobs, "
            "policy executions, and audit logs are retained as operational history."
        ),
    )
    retention_parser.add_argument(
        "--workspace-id", type=positive_int, default=None,
        help="Limit enforcement to a single workspace (default: all workspaces).",
    )
    retention_parser.add_argument(
        "--dry-run", action="store_true",
        help="Report what would be deleted without writing changes.",
    )

    return parser


def command_create_organization(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            organization = Organization(
                slug=slugify(args.slug or args.name),
                name=args.name.strip(),
                storage_region=ensure_region_supported(args.region),
                encrypted_settings=storage.encrypt_text("{}"),
                created_by_legacy_user_id=args.legacy_user_id,
                created_at=utcnow(),
            )
            db_session.add(organization)
            db_session.flush()
            emit(
                {
                    "success": True,
                    "organization": {
                        "id": organization.id,
                        "slug": organization.slug,
                        "name": organization.name,
                        "storageRegion": organization.storage_region,
                    },
                }
            )


def command_create_workspace(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            organization = db_session.get(Organization, args.organization_id)
            if not organization:
                raise SystemExit(f"Organization {args.organization_id} does not exist.")
            workspace = Workspace(
                organization_id=organization.id,
                slug=slugify(args.slug or args.name),
                name=args.name.strip(),
                description=args.description.strip() or None,
                storage_region=ensure_region_supported(args.region or organization.storage_region),
                default_similarity_threshold=float(args.similarity_threshold),
                semantic_threshold=float(args.semantic_threshold),
                created_by_legacy_user_id=args.legacy_user_id,
                created_at=utcnow(),
            )
            db_session.add(workspace)
            db_session.flush()
            db_session.add(
                WorkspaceMembership(
                    workspace_id=workspace.id,
                    legacy_user_id=args.legacy_user_id,
                    role="owner",
                    is_active=True,
                    created_at=utcnow(),
                    last_active_at=utcnow(),
                )
            )
            ensure_default_policy_set(db_session, workspace, args.legacy_user_id)
            ensure_default_compliance_profile(db_session, workspace)
            ensure_threshold_profile(db_session, workspace.id, "generic", "generic")
            emit({"success": True, "workspace": serialize_workspace(workspace)})


def command_add_member(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            workspace = db_session.get(Workspace, args.workspace_id)
            if not workspace:
                raise SystemExit(f"Workspace {args.workspace_id} does not exist.")
            membership = db_session.query(WorkspaceMembership).filter(
                WorkspaceMembership.workspace_id == workspace.id,
                WorkspaceMembership.legacy_user_id == args.legacy_user_id,
            ).one_or_none()
            if membership is None:
                membership = WorkspaceMembership(
                    workspace_id=workspace.id,
                    legacy_user_id=args.legacy_user_id,
                    role=args.role,
                    is_active=True,
                    created_at=utcnow(),
                    last_active_at=utcnow(),
                )
                db_session.add(membership)
            else:
                membership.role = args.role
                membership.is_active = True
                membership.last_active_at = utcnow()
            db_session.flush()
            emit(
                {
                    "success": True,
                    "membership": {
                        "id": membership.id,
                        "workspaceId": membership.workspace_id,
                        "legacyUserId": membership.legacy_user_id,
                        "role": membership.role,
                        "isActive": membership.is_active,
                    },
                }
            )


def command_create_repository(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            workspace = db_session.get(Workspace, args.workspace_id)
            if not workspace:
                raise SystemExit(f"Workspace {args.workspace_id} does not exist.")
            local_path = args.local_path.strip() if args.local_path else None
            clone_url = args.clone_url.strip() if args.clone_url else None
            if not local_path and not clone_url:
                raise SystemExit("Either --local-path or --clone-url is required.")
            provider = normalize_provider(args.provider)
            # Apply the same safety rails as the HTTP route: local paths must
            # be inside the configured allowlist and clone URLs must pass
            # SSRF/scheme validation — the CLI used to bypass both.
            if local_path:
                if provider != "local":
                    raise SystemExit("--local-path requires --provider local.")
                local_path = normalize_local_repository_path(local_path, require_exists=True)
            if clone_url:
                if provider == "local":
                    raise SystemExit("--clone-url requires a remote --provider (github/gitlab).")
                clone_url = normalize_clone_url(clone_url)
            # Issue a webhook secret exactly like the route does; without one
            # the webhook endpoints reject every delivery for this repository.
            webhook_hint, webhook_secret_hash, webhook_secret = issue_webhook_secret()
            repository = RepositoryConnection(
                workspace_id=workspace.id,
                provider=provider,
                external_id=(args.external_id or "").strip() or None,
                name=args.name.strip(),
                default_branch=args.default_branch.strip() or "main",
                clone_url_encrypted=storage.encrypt_text(clone_url) if clone_url else None,
                local_path_encrypted=storage.encrypt_text(local_path) if local_path else None,
                declared_region=ensure_region_supported(args.region or workspace.storage_region),
                webhook_secret_hash=webhook_secret_hash,
                webhook_secret_hint=webhook_hint,
                webhook_secret_encrypted=storage.encrypt_text(webhook_secret),
                created_by_legacy_user_id=args.legacy_user_id,
                created_at=utcnow(),
            )
            db_session.add(repository)
            db_session.flush()
            emit({
                "success": True,
                "repository": serialize_repository(repository),
                "secrets": {"webhookSecret": webhook_secret},
            })


def command_create_api_key(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            workspace = db_session.get(Workspace, args.workspace_id)
            if not workspace:
                raise SystemExit(f"Workspace {args.workspace_id} does not exist.")
            prefix, token_hash, raw_token = issue_api_key()
            scopes = args.scopes or [f"workspace:{workspace.id}:read", f"workspace:{workspace.id}:write"]
            credential = ApiCredential(
                organization_id=workspace.organization_id,
                workspace_id=workspace.id,
                name=args.name.strip(),
                token_prefix=prefix,
                token_hash=token_hash,
                scopes_json=json.dumps(scopes, ensure_ascii=False),
                created_by_legacy_user_id=args.legacy_user_id,
                created_at=utcnow(),
                expires_at=utcnow().replace(microsecond=0) + dt.timedelta(days=args.expires_in_days),
            )
            db_session.add(credential)
            db_session.flush()
            emit(
                {
                    "success": True,
                    "apiKey": {
                        "id": credential.id,
                        "name": credential.name,
                        "scopes": scopes,
                        "token": raw_token,
                    },
                }
            )


def command_trigger_scan(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            repository = db_session.get(RepositoryConnection, args.repository_id)
            if not repository:
                raise SystemExit(f"Repository {args.repository_id} does not exist.")
            workspace = db_session.get(Workspace, args.workspace_id)
            if not workspace:
                raise SystemExit(f"Workspace {args.workspace_id} does not exist.")
            actor = {
                "kind": "cli",
                "legacy_user_id": args.legacy_user_id,
                "workspace_id": workspace.id,
                "organization_id": workspace.organization_id,
                "scopes": ["*"],
                "is_admin": True,
            }
            scan_job = create_repository_scan_job(
                db_session,
                actor,
                workspace,
                repository,
                "cli",
                {"branch": args.branch.strip() or repository.default_branch or "main", "commitSha": (args.commit_sha or "").strip() or None},
            )
            scan_job_id = scan_job.id
            payload = serialize_scan_job(scan_job)
        if args.sync:
            run_repository_scan(scan_job_id)
            with session_scope() as db_session:
                payload = serialize_scan_job(db_session.get(ScanJob, scan_job_id))
        emit({"success": True, "scanJob": payload})


def command_analytics(args) -> None:
    with app.app_context():
        with session_scope() as db_session:
            workspace = db_session.get(Workspace, args.workspace_id)
            if not workspace:
                raise SystemExit(f"Workspace {args.workspace_id} does not exist.")
            emit({"success": True, "analytics": build_workspace_analytics(db_session, workspace.id)})


def command_export_case_pdf(args) -> None:
    from enterprise_reports import generate_review_case_pdf

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        with session_scope() as db_session:
            review_case = db_session.get(ReviewCase, args.case_id)
            if not review_case:
                raise SystemExit(f"Review case {args.case_id} does not exist.")
            case_bundle = fetch_case_bundle(db_session, review_case.id)
            payload = build_review_case_report_payload(db_session, *case_bundle)
        pdf_bytes = generate_review_case_pdf(payload)
        output_path.write_bytes(pdf_bytes)
        emit({"success": True, "output": str(output_path), "caseId": args.case_id, "bytes": len(pdf_bytes)})


# Columns holding Fernet ciphertext, keyed by model.  Used by migrate-encryption
# to upgrade legacy (v0/v1) payloads to the current per-record-salt (v2) format.
_ENCRYPTED_COLUMNS = [
    (Organization, ["encrypted_settings"]),
    (RepositoryConnection, ["clone_url_encrypted", "local_path_encrypted"]),
    (CodeArtifact, ["canonical_source_encrypted", "raw_source_encrypted"]),
    (ReviewCase, ["resolution_notes_encrypted"]),
    (FeedbackEvent, ["notes_encrypted"]),
]


def command_migrate_encryption(args) -> None:
    """Re-encrypt all legacy ciphertext columns into the v2 format.

    Idempotent: rows already in v2 are skipped.  Undecryptable values are left
    untouched and counted, never destroyed.  Pages through each table so the
    working set stays bounded even on large deployments.
    """
    batch_size = max(1, args.batch_size)
    dry_run = bool(args.dry_run)
    summary: dict[str, Any] = {}
    with app.app_context():
        for model, columns in _ENCRYPTED_COLUMNS:
            migrated = undecryptable = 0
            offset = 0
            while True:
                with session_scope() as db_session:
                    rows = (
                        db_session.query(model)
                        .order_by(model.id)
                        .offset(offset)
                        .limit(batch_size)
                        .all()
                    )
                    if not rows:
                        break
                    for row in rows:
                        for column in columns:
                            value = getattr(row, column)
                            if not value or storage.is_v2_ciphertext(value):
                                continue
                            try:
                                plaintext = storage.decrypt_text(value)
                            except Exception:
                                undecryptable += 1
                                continue
                            if not dry_run:
                                setattr(row, column, storage.encrypt_text(plaintext))
                            migrated += 1
                offset += batch_size
            summary[model.__tablename__] = {
                "migrated": migrated,
                "undecryptable": undecryptable,
            }
    emit({"success": True, "dryRun": dry_run, "summary": summary})


def command_enforce_retention(args) -> None:
    """Enforce ComplianceProfile.retention_days per workspace.

    Previously ``retention_days`` and ``legal_hold`` were stored but never
    read by anything.  Scope: purge *source-derived* data older than the
    cutoff — code artifacts (encrypted source), similarity matches, repository
    snapshots (manifests), resolved/dismissed review cases with their evidence
    and feedback.  Open cases and everything they reference are preserved, as
    are scan jobs, policy executions, and audit logs (operational history,
    not source material).
    """
    from sqlalchemy import delete, select, update

    from enterprise_platform.models import (
        ComplianceProfile,
        PolicyExecution,
        RepositorySnapshot,
        ReviewEvidence,
        SimilarityMatch,
    )

    dry_run = bool(args.dry_run)
    terminal_statuses = ("resolved", "dismissed", "confirmed_clone", "false_positive")
    report: dict[str, Any] = {}

    with app.app_context():
        with session_scope() as db_session:
            profile_query = select(ComplianceProfile)
            if args.workspace_id:
                profile_query = profile_query.where(ComplianceProfile.workspace_id == args.workspace_id)
            profiles = db_session.execute(profile_query).scalars().all()

            for profile in profiles:
                workspace_id = profile.workspace_id
                if profile.legal_hold:
                    report[str(workspace_id)] = {"skipped": "legal_hold"}
                    continue
                retention_days = int(profile.retention_days or 0)
                if retention_days <= 0:
                    report[str(workspace_id)] = {"skipped": "retention_disabled"}
                    continue
                cutoff = utcnow() - dt.timedelta(days=retention_days)

                # 1. Terminal review cases past retention (+ evidence/feedback).
                case_ids = db_session.execute(
                    select(ReviewCase.id).where(
                        ReviewCase.workspace_id == workspace_id,
                        ReviewCase.status.in_(terminal_statuses),
                        ReviewCase.created_at < cutoff,
                    )
                ).scalars().all()

                # 2. Matches past retention not referenced by remaining cases.
                # not_in([]) compiles to TRUE (nothing excluded), so the empty
                # case needs no special handling.
                remaining_case_match_ids = select(ReviewCase.match_id).where(
                    ReviewCase.workspace_id == workspace_id,
                    ReviewCase.id.not_in(case_ids),
                )
                match_ids = db_session.execute(
                    select(SimilarityMatch.id).where(
                        SimilarityMatch.workspace_id == workspace_id,
                        SimilarityMatch.created_at < cutoff,
                        SimilarityMatch.id.not_in(remaining_case_match_ids),
                    )
                ).scalars().all()

                # 3. Artifacts past retention not referenced by surviving
                #    matches or surviving evidence.
                surviving_matches = select(SimilarityMatch.artifact_a_id).where(
                    SimilarityMatch.workspace_id == workspace_id,
                    SimilarityMatch.id.not_in(match_ids),
                )
                surviving_matches_b = select(SimilarityMatch.artifact_b_id).where(
                    SimilarityMatch.workspace_id == workspace_id,
                    SimilarityMatch.id.not_in(match_ids),
                )
                surviving_evidence_artifacts = (
                    select(ReviewEvidence.artifact_id)
                    .join(ReviewCase, ReviewCase.id == ReviewEvidence.case_id)
                    .where(
                        ReviewCase.workspace_id == workspace_id,
                        ReviewEvidence.artifact_id.is_not(None),
                        ReviewEvidence.case_id.not_in(case_ids),
                    )
                )
                artifact_ids = db_session.execute(
                    select(CodeArtifact.id).where(
                        CodeArtifact.workspace_id == workspace_id,
                        CodeArtifact.created_at < cutoff,
                        CodeArtifact.id.not_in(surviving_matches),
                        CodeArtifact.id.not_in(surviving_matches_b),
                        CodeArtifact.id.not_in(surviving_evidence_artifacts),
                    )
                ).scalars().all()

                # 4. Snapshots past retention with no surviving artifacts/matches.
                surviving_artifact_snapshots = select(CodeArtifact.snapshot_id).where(
                    CodeArtifact.workspace_id == workspace_id,
                    CodeArtifact.id.not_in(artifact_ids),
                )
                surviving_match_snapshots = select(SimilarityMatch.snapshot_id).where(
                    SimilarityMatch.workspace_id == workspace_id,
                    SimilarityMatch.id.not_in(match_ids),
                )
                snapshot_ids = db_session.execute(
                    select(RepositorySnapshot.id)
                    .join(RepositoryConnection, RepositoryConnection.id == RepositorySnapshot.repository_id)
                    .where(
                        RepositoryConnection.workspace_id == workspace_id,
                        RepositorySnapshot.scanned_at < cutoff,
                        RepositorySnapshot.id.not_in(surviving_artifact_snapshots),
                        RepositorySnapshot.id.not_in(surviving_match_snapshots),
                    )
                ).scalars().all()

                report[str(workspace_id)] = {
                    "retentionDays": retention_days,
                    "cutoff": cutoff.isoformat(),
                    "cases": len(case_ids),
                    "matches": len(match_ids),
                    "artifacts": len(artifact_ids),
                    "snapshots": len(snapshot_ids),
                }
                if dry_run:
                    continue

                if case_ids:
                    db_session.execute(delete(ReviewEvidence).where(ReviewEvidence.case_id.in_(case_ids)))
                    db_session.execute(delete(FeedbackEvent).where(FeedbackEvent.case_id.in_(case_ids)))
                    # Policy executions are kept as audit history; detach them
                    # from the purged cases instead of deleting them.
                    db_session.execute(
                        update(PolicyExecution)
                        .where(PolicyExecution.case_id.in_(case_ids))
                        .values(case_id=None)
                    )
                    db_session.execute(delete(ReviewCase).where(ReviewCase.id.in_(case_ids)))
                if match_ids:
                    db_session.execute(delete(SimilarityMatch).where(SimilarityMatch.id.in_(match_ids)))
                if artifact_ids:
                    db_session.execute(delete(CodeArtifact).where(CodeArtifact.id.in_(artifact_ids)))
                if snapshot_ids:
                    # Break the ScanJob -> snapshot reference before deleting.
                    db_session.execute(
                        update(ScanJob)
                        .where(ScanJob.snapshot_id.in_(snapshot_ids))
                        .values(snapshot_id=None)
                    )
                    db_session.execute(delete(RepositorySnapshot).where(RepositorySnapshot.id.in_(snapshot_ids)))
                storage.invalidate_workspace_index(workspace_id)

    emit({"success": True, "dryRun": dry_run, "workspaces": report})


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    command_map = {
        "create-organization": command_create_organization,
        "create-workspace": command_create_workspace,
        "add-member": command_add_member,
        "create-repository": command_create_repository,
        "create-api-key": command_create_api_key,
        "trigger-scan": command_trigger_scan,
        "analytics": command_analytics,
        "export-case-pdf": command_export_case_pdf,
        "migrate-encryption": command_migrate_encryption,
        "enforce-retention": command_enforce_retention,
    }
    handler = command_map[args.command]
    handler(args)


if __name__ == "__main__":
    main()
