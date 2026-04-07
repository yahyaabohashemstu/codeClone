from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

from app import app
from api import (
    ApiCredential,
    Organization,
    RepositoryConnection,
    ReviewCase,
    ScanJob,
    Workspace,
    WorkspaceMembership,
    build_review_case_report_payload,
    create_repository_scan_job,
    ensure_default_compliance_profile,
    ensure_default_policy_set,
    ensure_region_supported,
    ensure_threshold_profile,
    fetch_case_bundle,
    issue_api_key,
    normalize_provider,
    run_repository_scan,
    serialize_repository,
    serialize_scan_job,
    serialize_workspace,
    session_scope,
    slugify,
    storage,
    utcnow,
)


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
            repository = RepositoryConnection(
                workspace_id=workspace.id,
                provider=normalize_provider(args.provider),
                external_id=(args.external_id or "").strip() or None,
                name=args.name.strip(),
                default_branch=args.default_branch.strip() or "main",
                clone_url_encrypted=storage.encrypt_text(clone_url) if clone_url else None,
                local_path_encrypted=storage.encrypt_text(local_path) if local_path else None,
                declared_region=ensure_region_supported(args.region or workspace.storage_region),
                webhook_secret_hash=None,
                webhook_secret_hint=None,
                created_by_legacy_user_id=args.legacy_user_id,
                created_at=utcnow(),
            )
            db_session.add(repository)
            db_session.flush()
            emit({"success": True, "repository": serialize_repository(repository)})


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
    from api import build_workspace_analytics

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
    }
    handler = command_map[args.command]
    handler(args)


if __name__ == "__main__":
    main()
