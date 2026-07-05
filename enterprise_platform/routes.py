from __future__ import annotations

import datetime as dt
import os
import re
from io import BytesIO
from typing import Any

from flask import Blueprint, current_app, jsonify, request, send_file
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from enterprise_platform.models import *
from enterprise_platform.utils import *
from enterprise_platform.services import *
from enterprise_platform.scans import *

api_bp = Blueprint("enterprise_api", __name__)

# Valid policy-rule values, enforced at creation time so a misconfigured rule
# fails fast with a 400 instead of silently no-op'ing (unsupported metric) or
# raising mid-scan (unsupported comparator).
_POLICY_COMPARATORS = frozenset({">=", ">", "<=", "<", "=="})
_POLICY_CONDITION_TYPES = frozenset(
    {"similarity_score", "semantic_score", "token_score", "structural_score"}
)
_POLICY_ACTIONS = frozenset({"create_case"})


def _require_int_variable(variables: dict, *keys: str) -> int:
    """Extract a required positive integer from GraphQL variables, with proper validation."""
    for key in keys:
        raw = variables.get(key)
        if raw is not None:
            try:
                value = int(raw)
            except (TypeError, ValueError):
                raise EnterpriseError(400, f"Variable '{key}' must be an integer.", code="invalid_variable_type")
            if value <= 0:
                raise EnterpriseError(400, f"Variable '{key}' must be a positive integer.", code="invalid_variable_value")
            return value
    raise EnterpriseError(400, f"Required variable '{'/'.join(keys)}' is missing.", code="missing_variable")


def _validated_threshold(raw_value, default: float) -> float:
    """Parse a threshold value, validate it is a float between 0.0 and 1.0."""
    try:
        value = float(raw_value or default)
    except (TypeError, ValueError):
        raise EnterpriseError(400, "Threshold must be a number.", code="invalid_input")
    if not 0.0 <= value <= 1.0:
        raise EnterpriseError(400, "Threshold must be between 0.0 and 1.0.", code="invalid_input")
    return value


def _validated_expires_at(payload: dict):
    """Parse expiresInDays and return a validated expiration datetime."""
    try:
        expires_days = int(payload.get("expiresInDays") or 365)
    except (TypeError, ValueError):
        raise EnterpriseError(400, "expiresInDays must be an integer.", code="invalid_input")
    if expires_days < 1 or expires_days > 3650:
        raise EnterpriseError(400, "expiresInDays must be between 1 and 3650.", code="invalid_input")
    return utcnow() + dt.timedelta(days=expires_days)


def graphql_dispatch(db_session, actor: dict[str, Any], query: str, variables: dict[str, Any]) -> dict[str, Any]:
    """Minimal field-dispatch RPC exposed at the GraphQL path.

    NOTE: this is *not* a spec-compliant GraphQL implementation. It extracts
    only the first root field name and dispatches on it, ignoring the selection
    set, fragments, aliases, and multi-field queries.  It is a thin
    compatibility shim for a fixed set of operations (``workspace``,
    ``reviewCases``, ``analytics``, ``createScan``); all inputs must be supplied
    via ``variables`` rather than inline arguments.
    """
    root_match = re.search(r"\{\s*(\w+)", query)
    if not root_match:
        raise EnterpriseError(400, "GraphQL query root field is required.", code="invalid_graphql_query")
    root_field = root_match.group(1)
    if root_field == "workspace":
        workspace_id = _require_int_variable(variables, "id", "workspaceId")
        workspace = require_workspace_access(db_session, workspace_id, actor, "student")
        membership = load_workspace_membership(db_session, workspace.id, actor.get("legacy_user_id"))
        repositories = db_session.execute(select(RepositoryConnection).where(RepositoryConnection.workspace_id == workspace.id)).scalars().all()
        return {"workspace": {**serialize_workspace(workspace, membership), "repositories": [serialize_repository(repository) for repository in repositories]}}
    if root_field == "reviewCases":
        workspace_id = _require_int_variable(variables, "workspaceId")
        require_workspace_access(db_session, workspace_id, actor, "reviewer")
        # Cap the result set: the REST list is paginated, and an unbounded
        # query here could load every case (and its evidence bundle) for a
        # large workspace into memory in one request.
        try:
            first = min(max(int(variables.get("first") or 100), 1), 500)
        except (TypeError, ValueError):
            raise EnterpriseError(400, "Variable 'first' must be an integer.", code="invalid_variable_type")
        review_cases = db_session.execute(
            select(ReviewCase)
            .where(ReviewCase.workspace_id == workspace_id)
            .order_by(ReviewCase.created_at.desc())
            .limit(first)
        ).scalars().all()
        bundles = fetch_case_bundles_batch(db_session, review_cases)
        return {"reviewCases": [serialize_review_case(*bundle) for bundle in bundles]}
    if root_field == "analytics":
        workspace_id = _require_int_variable(variables, "workspaceId")
        require_workspace_access(db_session, workspace_id, actor, "reviewer")
        return {"analytics": build_workspace_analytics(db_session, workspace_id)}
    if root_field == "createScan":
        workspace_id = _require_int_variable(variables, "workspaceId")
        repository_id = _require_int_variable(variables, "repositoryId")
        workspace = require_workspace_access(db_session, workspace_id, actor, "reviewer")
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository or repository.workspace_id != workspace.id:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        scan_job = create_repository_scan_job(db_session, actor, workspace, repository, "graphql", {"branch": variables.get("branch"), "commitSha": variables.get("commitSha")})
        db_session.flush()
        # Do NOT enqueue here: this still runs inside the caller's open
        # transaction, and the in-process executor could claim the job before
        # the INSERT commits (matching 0 rows and stranding the job 'queued'
        # forever).  The route enqueues after the session closes — same
        # pattern as the REST trigger and the webhooks.
        return {"createScan": serialize_scan_job(scan_job), "_enqueue_scan_job_id": scan_job.id}
    raise EnterpriseError(400, "Unsupported GraphQL root field.", code="unsupported_graphql_field")


@api_bp.errorhandler(EnterpriseError)
def handle_enterprise_error(exc: EnterpriseError):
    return (
        jsonify(
            {
                "success": False,
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
                "requestId": request_request_id(),
            }
        ),
        exc.status_code,
    )


@api_bp.record_once
def initialize_enterprise_platform(state) -> None:
    storage.configure(state.app)
    if not state.app.extensions.get("enterprise_teardown_registered"):
        state.app.teardown_appcontext(lambda _exc: storage.remove())
        state.app.extensions["enterprise_teardown_registered"] = True
    app_before_request_funcs = state.app.before_request_funcs.setdefault(None, [])
    for index, fn in enumerate(list(app_before_request_funcs)):
        if getattr(fn, "_enterprise_csrf_bridge", False):
            return
        if getattr(fn, "__name__", "") == "validate_csrf_token":
            def wrapped_validate(original=fn):
                path = request.path or ""
                if path.startswith(ENTERPRISE_API_PREFIX) or path.startswith(GITHUB_WEBHOOK_PREFIX) or path.startswith(GITLAB_WEBHOOK_PREFIX):
                    return None
                return original()

            wrapped_validate.__name__ = getattr(fn, "__name__", "validate_csrf_token")
            wrapped_validate._enterprise_csrf_bridge = True
            app_before_request_funcs[index] = wrapped_validate
            break


@api_bp.route(f"{ENTERPRISE_API_PREFIX}/health", methods=["GET"])
def enterprise_health():
    with session_scope() as db_session:
        db_session.execute(select(func.count(Workspace.id))).one()
    return jsonify({"success": True, "status": "ok", "requestId": request_request_id()})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/organizations", methods=["GET"])
def list_organizations():
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        org_query = select(Organization).order_by(Organization.created_at.desc())
        if not actor.get("is_admin"):
            # Filter in SQL rather than fetching every organization and
            # discarding rows in Python.
            visible_orgs = (
                select(Workspace.organization_id)
                .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
                .where(
                    WorkspaceMembership.legacy_user_id == actor.get("legacy_user_id"),
                    WorkspaceMembership.is_active.is_(True),
                )
            )
            org_query = org_query.where(Organization.id.in_(visible_orgs))
        organizations = db_session.execute(org_query).scalars().all()
        return jsonify(
            {
                "success": True,
                "items": [
                    {
                        "id": organization.id,
                        "slug": organization.slug,
                        "name": organization.name,
                        "storageRegion": organization.storage_region,
                        "createdByLegacyUserId": organization.created_by_legacy_user_id,
                        "createdAt": organization.created_at.isoformat() if organization.created_at else None,
                    }
                    for organization in organizations
                ],
            }
        )


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/organizations", methods=["POST"])
def create_organization():
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_enterprise_admin(actor, "Only platform administrators can create organizations.")
        organization = Organization(
            slug=slugify(payload.get("slug") or payload.get("name") or ""),
            name=(payload.get("name") or "").strip(),
            storage_region=ensure_region_supported(payload.get("storageRegion")),
            encrypted_settings=storage.encrypt_text(dumps(payload.get("settings") or {})),
            created_by_legacy_user_id=actor.get("legacy_user_id"),
            created_at=utcnow(),
        )
        if not organization.name:
            raise EnterpriseError(400, "Organization name is required.", code="organization_name_required")
        db_session.add(organization)
        try:
            db_session.flush()
        except IntegrityError as exc:
            raise EnterpriseError(409, "Organization slug already exists.", code="organization_slug_conflict") from exc
        audit(db_session, actor, "organization.create", "organization", organization.id, None, {"slug": organization.slug})
        return jsonify({"success": True, "item": {"id": organization.id, "slug": organization.slug, "name": organization.name, "storageRegion": organization.storage_region}}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces", methods=["GET"])
def list_workspaces():
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        offset, limit, page = parse_pagination_params()
        if actor.get("is_admin"):
            base_query = select(Workspace)
            total = db_session.execute(select(func.count()).select_from(base_query.subquery())).scalar() or 0
            workspaces = db_session.execute(base_query.order_by(Workspace.created_at.desc()).offset(offset).limit(limit)).scalars().all()
            memberships = {}
        else:
            base_query = (
                select(Workspace, WorkspaceMembership)
                .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
                .where(WorkspaceMembership.legacy_user_id == actor.get("legacy_user_id"), WorkspaceMembership.is_active.is_(True))
            )
            count_query = (
                select(func.count())
                .select_from(Workspace)
                .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
                .where(WorkspaceMembership.legacy_user_id == actor.get("legacy_user_id"), WorkspaceMembership.is_active.is_(True))
            )
            total = db_session.execute(count_query).scalar() or 0
            rows = db_session.execute(base_query.order_by(Workspace.created_at.desc()).offset(offset).limit(limit)).all()
            workspaces = [row[0] for row in rows]
            memberships = {row[0].id: row[1] for row in rows}
        serialized = [serialize_workspace(workspace, memberships.get(workspace.id)) for workspace in workspaces]
        return jsonify(paginated_response(serialized, total, page, limit))


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces", methods=["POST"])
def create_workspace():
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_enterprise_admin(actor, "Only platform administrators can create workspaces.")
        try:
            organization_id = int(payload.get("organizationId") or 0)
        except (TypeError, ValueError):
            raise EnterpriseError(400, "organizationId must be an integer.", code="invalid_input")
        organization = db_session.get(Organization, organization_id)
        if not organization:
            raise EnterpriseError(404, "Organization not found.", code="organization_not_found")
        workspace = Workspace(
            organization_id=organization.id,
            slug=slugify(payload.get("slug") or payload.get("name") or ""),
            name=(payload.get("name") or "").strip(),
            description=(payload.get("description") or "").strip() or None,
            storage_region=ensure_region_supported(payload.get("storageRegion") or organization.storage_region),
            default_similarity_threshold=_validated_threshold(payload.get("defaultSimilarityThreshold"), DEFAULT_WORKSPACE_THRESHOLD),
            semantic_threshold=_validated_threshold(payload.get("semanticThreshold"), DEFAULT_SEMANTIC_THRESHOLD),
            created_by_legacy_user_id=actor.get("legacy_user_id"),
            created_at=utcnow(),
        )
        if not workspace.name:
            raise EnterpriseError(400, "Workspace name is required.", code="workspace_name_required")
        db_session.add(workspace)
        try:
            db_session.flush()
        except IntegrityError as exc:
            raise EnterpriseError(409, "Workspace slug already exists in this organization.", code="workspace_slug_conflict") from exc
        db_session.add(
            WorkspaceMembership(
                workspace_id=workspace.id,
                legacy_user_id=actor.get("legacy_user_id"),
                role="owner",
                is_active=True,
                created_at=utcnow(),
                last_active_at=utcnow(),
            )
        )
        ensure_default_policy_set(db_session, workspace, actor.get("legacy_user_id"))
        ensure_default_compliance_profile(db_session, workspace)
        ensure_threshold_profile(db_session, workspace.id, "generic", "generic")
        audit(db_session, actor, "workspace.create", "workspace", workspace.id, workspace.id, {"slug": workspace.slug})
        return jsonify({"success": True, "item": serialize_workspace(workspace)}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/members", methods=["GET"])
def list_workspace_members(workspace_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "reviewer")
        memberships = db_session.execute(
            select(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace_id).order_by(WorkspaceMembership.created_at.asc())
        ).scalars().all()
        return jsonify({"success": True, "items": [serialize_membership(membership) for membership in memberships]})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/members", methods=["POST"])
def add_workspace_member(workspace_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        # Membership management is a privilege-granting operation: block API-key
        # actors so a leaked workspace:write key cannot mint/upgrade members
        # (a write scope already maps to admin-equivalent access). Matches
        # remove_workspace_member and the credential/archive/delete routes.
        require_human_actor(actor, "API keys cannot manage workspace members.")
        require_workspace_access(db_session, workspace_id, actor, "admin")
        try:
            legacy_user_id = int(payload.get("legacyUserId") or 0)
        except (TypeError, ValueError):
            raise EnterpriseError(400, "legacyUserId must be an integer.", code="invalid_input")
        role = (payload.get("role") or "student").strip().lower()
        if role not in ROLE_ORDER:
            raise EnterpriseError(400, "Invalid workspace role.", code="invalid_workspace_role")
        membership = db_session.execute(
            select(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace_id, WorkspaceMembership.legacy_user_id == legacy_user_id)
        ).scalar_one_or_none()
        if membership:
            membership.role = role
            membership.is_active = True
            membership.last_active_at = utcnow()
        else:
            membership = WorkspaceMembership(
                workspace_id=workspace_id,
                legacy_user_id=legacy_user_id,
                role=role,
                is_active=True,
                created_at=utcnow(),
                last_active_at=utcnow(),
            )
            db_session.add(membership)
        db_session.flush()
        audit(db_session, actor, "workspace.member.upsert", "workspace_membership", membership.id, workspace_id, {"legacyUserId": legacy_user_id, "role": role})
        return jsonify({"success": True, "item": serialize_membership(membership)}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/repositories", methods=["GET"])
def list_repositories(workspace_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "student")
        repositories = db_session.execute(
            select(RepositoryConnection).where(RepositoryConnection.workspace_id == workspace_id).order_by(RepositoryConnection.created_at.desc())
        ).scalars().all()
        return jsonify({"success": True, "items": [serialize_repository(repository) for repository in repositories]})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/repositories", methods=["POST"])
def create_repository(workspace_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        workspace = require_workspace_access(db_session, workspace_id, actor, "admin")
        compliance_profile = ensure_default_compliance_profile(db_session, workspace)
        declared_region = ensure_region_supported(payload.get("declaredRegion") or workspace.storage_region)
        if declared_region != compliance_profile.storage_region and not compliance_profile.cross_region_transfer_enabled:
            raise EnterpriseError(409, "Declared repository region violates compliance policy.", code="repository_region_violation")
        provider = normalize_provider(payload.get("provider") or "local")
        name = (payload.get("name") or "").strip()
        if not name:
            raise EnterpriseError(400, "Repository name is required.", code="repository_name_required")
        local_path = (payload.get("localPath") or "").strip() or None
        clone_url = (payload.get("cloneUrl") or "").strip() or None
        if local_path and clone_url:
            raise EnterpriseError(400, "Provide either localPath or cloneUrl, not both.", code="repository_location_ambiguous")
        if not local_path and not clone_url:
            raise EnterpriseError(400, "Either localPath or cloneUrl is required.", code="repository_location_required")
        if local_path:
            if provider != "local":
                raise EnterpriseError(400, "Repositories using localPath must use provider='local'.", code="repository_provider_mismatch")
            local_path = normalize_local_repository_path(local_path, require_exists=True)
        if clone_url:
            if provider == "local":
                raise EnterpriseError(400, "Repositories using cloneUrl must use a remote provider.", code="repository_provider_mismatch")
            clone_url = normalize_clone_url(clone_url)
        webhook_hint, webhook_secret_hash, webhook_secret = issue_webhook_secret()
        repository = RepositoryConnection(
            workspace_id=workspace.id,
            provider=provider,
            external_id=(payload.get("externalId") or "").strip() or None,
            name=name,
            default_branch=(payload.get("defaultBranch") or "main").strip() or None,
            clone_url_encrypted=storage.encrypt_text(clone_url) if clone_url else None,
            local_path_encrypted=storage.encrypt_text(local_path) if local_path else None,
            declared_region=declared_region,
            webhook_secret_hash=webhook_secret_hash,
            webhook_secret_hint=webhook_hint,
            # Encrypted copy of the full token so GitHub's native
            # X-Hub-Signature-256 can be verified without a custom header.
            webhook_secret_encrypted=storage.encrypt_text(webhook_secret),
            created_by_legacy_user_id=actor.get("legacy_user_id"),
            created_at=utcnow(),
        )
        db_session.add(repository)
        try:
            db_session.flush()
        except IntegrityError as exc:
            raise EnterpriseError(409, "A repository with this name already exists in the workspace.", code="repository_conflict") from exc
        audit(db_session, actor, "repository.create", "repository", repository.id, workspace.id, {"provider": provider, "name": name})
        return (
            jsonify(
                {
                    "success": True,
                    "item": serialize_repository(repository),
                    "secrets": {
                        "webhookSecret": webhook_secret,
                        # Prefer the configured public base URL over the
                        # Host-header-derived request.url_root, so a spoofed Host
                        # cannot bend the webhook URL handed back to the admin.
                        "githubWebhookUrl": f"{((current_app.config.get('APP_BASE_URL') or '').strip().rstrip('/')) or request.url_root.rstrip('/')}{GITHUB_WEBHOOK_PREFIX}/{repository.id}/webhook",
                        "gitlabWebhookUrl": f"{((current_app.config.get('APP_BASE_URL') or '').strip().rstrip('/')) or request.url_root.rstrip('/')}{GITLAB_WEBHOOK_PREFIX}/{repository.id}/webhook",
                    },
                }
            ),
            201,
        )


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/git/probe", methods=["POST"])
def git_probe():
    """
    Probe a git URL to validate it and discover available branches.

    Runs ``git ls-remote --heads <url>`` to fetch branch names without
    cloning the repository.  Returns the list of branches and the
    detected default branch.

    Request JSON::

        {"cloneUrl": "https://github.com/owner/repo"}

    Response JSON::

        {
            "success": true,
            "branches": ["main", "develop", "feature/x"],
            "defaultBranch": "main"
        }
    """
    import re
    import subprocess

    payload = require_json_body()
    # Probing spawns a git subprocess against an arbitrary URL, so it must be a
    # privileged, workspace-scoped operation — not open to any authenticated
    # user. It is only ever invoked from the admin-only add-repository flow, so
    # gate it on admin access to the target workspace (mirrors create_repository).
    try:
        workspace_id = int(payload.get("workspaceId") or 0)
    except (TypeError, ValueError):
        raise EnterpriseError(400, "workspaceId must be an integer.", code="invalid_input")
    if not workspace_id:
        raise EnterpriseError(400, "workspaceId is required.", code="missing_workspace_id")
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "admin")

    clone_url = (payload.get("cloneUrl") or "").strip()
    if not clone_url:
        raise EnterpriseError(400, "cloneUrl is required.", code="missing_clone_url")

    try:
        clone_url = normalize_clone_url(clone_url)
    except EnterpriseError:
        raise
    except Exception:
        raise EnterpriseError(400, "Invalid clone URL.", code="invalid_clone_url")

    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    # Discover branches via ls-remote
    try:
        ls_result = subprocess.run(
            ["git", "ls-remote", "--heads", "--quiet", clone_url],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise EnterpriseError(504, "Repository probe timed out.", code="probe_timeout")

    if ls_result.returncode != 0:
        stderr = (ls_result.stderr or "").strip()
        raise EnterpriseError(
            502,
            f"Cannot reach repository: {stderr[:200]}" if stderr else "Cannot reach repository.",
            code="probe_failed",
        )

    branches: list[str] = []
    for line in ls_result.stdout.strip().splitlines():
        match = re.match(r"^[0-9a-f]+\s+refs/heads/(.+)$", line)
        if match:
            branches.append(match.group(1))

    branches.sort(key=lambda b: (b != "main", b != "master", b != "develop", b))

    # Detect default branch via HEAD
    default_branch = "main"
    try:
        head_result = subprocess.run(
            ["git", "ls-remote", "--symref", clone_url, "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            env=env,
        )
        if head_result.returncode == 0:
            head_match = re.search(r"ref: refs/heads/(\S+)\s+HEAD", head_result.stdout)
            if head_match:
                default_branch = head_match.group(1)
    except Exception:
        pass

    if default_branch not in branches and branches:
        default_branch = branches[0]

    return jsonify({
        "success": True,
        "branches": branches,
        "defaultBranch": default_branch,
        "totalBranches": len(branches),
    })


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/repositories/<int:repository_id>/scans", methods=["POST"])
def trigger_repository_scan(repository_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        workspace = require_workspace_access(db_session, repository.workspace_id, actor, "reviewer")
        scan_job = create_repository_scan_job(
            db_session,
            actor,
            workspace,
            repository,
            "manual",
            {"branch": (payload.get("branch") or repository.default_branch or "main").strip(), "commitSha": (payload.get("commitSha") or "").strip() or None},
        )
        audit(db_session, actor, "scan.trigger", "scan_job", scan_job.id, workspace.id, {"repositoryId": repository.id})
        scan_job_id = scan_job.id
    enqueue_scan_job(scan_job_id)
    with session_scope() as db_session:
        return jsonify({"success": True, "item": serialize_scan_job(db_session.get(ScanJob, scan_job_id))}), 202


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/scan-jobs/<int:scan_job_id>", methods=["GET"])
def get_scan_job(scan_job_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        scan_job = db_session.get(ScanJob, scan_job_id)
        if not scan_job:
            raise EnterpriseError(404, "Scan job not found.", code="scan_job_not_found")
        require_workspace_access(db_session, scan_job.workspace_id, actor, "student")
        include_operational_details = can_view_workspace_operational_details(db_session, scan_job.workspace_id, actor)
        payload = serialize_scan_job(scan_job, include_error_message=include_operational_details)
        if scan_job.snapshot_id:
            snapshot = db_session.get(RepositorySnapshot, scan_job.snapshot_id)
            payload["snapshot"] = serialize_snapshot(snapshot) if snapshot else None
        return jsonify({"success": True, "item": payload})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/search", methods=["POST"])
def corpus_search(workspace_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "student")
        try:
            top_k = max(1, min(int(payload.get("topK") or 10), 50))
        except (TypeError, ValueError):
            raise EnterpriseError(400, "topK must be an integer.", code="invalid_input")
        query_artifact_id = payload.get("artifactId")
        query_text = (payload.get("queryText") or "").strip()
        language = (payload.get("language") or "python").strip().lower()
        if query_artifact_id:
            try:
                query_artifact_pk = int(query_artifact_id)
            except (TypeError, ValueError):
                raise EnterpriseError(400, "artifactId must be an integer.", code="invalid_input")
            query_artifact = db_session.get(CodeArtifact, query_artifact_pk)
            if not query_artifact or query_artifact.workspace_id != workspace_id:
                raise EnterpriseError(404, "Query artifact not found.", code="query_artifact_not_found")
            vector = deserialize_vector(query_artifact.embedding_vector, query_artifact.embedding_dim)
            exclude_id = query_artifact.id
        elif query_text:
            _, tokens = canonicalize_source(query_text, language)
            vector = feature_hash_vector(tokens)
            exclude_id = None
        else:
            raise EnterpriseError(400, "Either queryText or artifactId is required.", code="search_query_required")
        candidate_ids = workspace_search_candidates(db_session, workspace_id, vector, top_k, exclude_id)
        artifacts = db_session.execute(select(CodeArtifact).where(CodeArtifact.id.in_(candidate_ids))).scalars().all() if candidate_ids else []
        artifact_by_id = {artifact.id: artifact for artifact in artifacts}
        results = []
        for artifact_id in candidate_ids:
            artifact = artifact_by_id.get(artifact_id)
            if not artifact:
                continue
            candidate_vector = deserialize_vector(artifact.embedding_vector, artifact.embedding_dim)
            score = cosine_similarity(vector, candidate_vector)
            results.append({"artifact": serialize_artifact(artifact), "similarityScore": round(score * 100, 2)})
        return jsonify({"success": True, "items": results})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/cases", methods=["GET"])
def list_cases(workspace_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "reviewer")
        status_filter = (request.args.get("status") or "").strip().lower()
        base_query = select(ReviewCase).where(ReviewCase.workspace_id == workspace_id)
        if status_filter:
            base_query = base_query.where(ReviewCase.status == status_filter)

        # Count total
        total = db_session.execute(select(func.count()).select_from(base_query.subquery())).scalar() or 0

        # Paginate
        offset, limit, page = parse_pagination_params()
        cases = db_session.execute(
            base_query.order_by(ReviewCase.created_at.desc()).offset(offset).limit(limit)
        ).scalars().all()

        bundles = fetch_case_bundles_batch(db_session, cases)
        serialized = [serialize_review_case(*bundle) for bundle in bundles]
        return jsonify(paginated_response(serialized, total, page, limit))


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/cases/<int:case_id>", methods=["GET"])
def get_case(case_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        review_case, match, artifacts, evidence_rows = fetch_case_bundle(db_session, case_id)
        require_workspace_access(db_session, review_case.workspace_id, actor, "reviewer")
        return jsonify({"success": True, "item": serialize_review_case(review_case, match, artifacts, evidence_rows)})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/cases/<int:case_id>/report.pdf", methods=["GET"])
def export_case_pdf(case_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        review_case, match, artifacts, evidence_rows = fetch_case_bundle(db_session, case_id)
        require_workspace_access(db_session, review_case.workspace_id, actor, "reviewer")
        payload = build_review_case_report_payload(db_session, review_case, match, artifacts, evidence_rows)
        audit(
            db_session,
            actor,
            "case.report.export",
            "review_case",
            review_case.id,
            review_case.workspace_id,
            {"format": "pdf"},
        )
    try:
        from enterprise_reports import generate_review_case_pdf
    except ModuleNotFoundError as exc:
        raise EnterpriseError(
            503,
            "Native PDF reporting dependencies are not installed. Install reportlab to enable export.",
            code="pdf_dependencies_missing",
            details={"missingModule": getattr(exc, "name", "unknown")},
        ) from exc
    pdf_bytes = generate_review_case_pdf(payload)
    filename = f"review-case-{case_id}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=(request.args.get("download", "1").strip() != "0"),
        download_name=filename,
        max_age=0,
    )


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/cases/<int:case_id>", methods=["PATCH"])
def update_case(case_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        review_case = db_session.get(ReviewCase, case_id)
        if not review_case:
            raise EnterpriseError(404, "Review case not found.", code="case_not_found")
        require_workspace_access(db_session, review_case.workspace_id, actor, "reviewer")
        if "status" in payload:
            new_status = (payload.get("status") or review_case.status).strip().lower()
            # Vocabulary matches what the feedback flow and the UI produce;
            # 'confirmed'/'disputed' were never written or read by anything.
            if new_status not in ("open", "in_review", "resolved", "dismissed", "confirmed_clone", "false_positive"):
                raise EnterpriseError(400, "Invalid case status.", code="invalid_case_status")
            review_case.status = new_status
        if "severity" in payload:
            new_severity = (payload.get("severity") or review_case.severity).strip().lower()
            if new_severity not in ("critical", "high", "medium", "low", "info", "none"):
                raise EnterpriseError(400, "Invalid case severity.", code="invalid_case_severity")
            review_case.severity = new_severity
        if "assignedToLegacyUserId" in payload:
            assigned_to = payload.get("assignedToLegacyUserId")
            try:
                review_case.assigned_to_legacy_user_id = int(assigned_to) if assigned_to else None
            except (TypeError, ValueError):
                raise EnterpriseError(400, "assignedToLegacyUserId must be an integer.", code="invalid_input")
        if "resolutionLabel" in payload:
            review_case.resolution_label = (payload.get("resolutionLabel") or "").strip() or None
        if "resolutionNotes" in payload:
            review_case.resolution_notes_encrypted = storage.encrypt_text((payload.get("resolutionNotes") or "").strip() or None)
        if review_case.status in {"resolved", "confirmed_clone", "false_positive", "dismissed"}:
            review_case.resolved_at = utcnow()
        elif review_case.status in {"open", "in_review"}:
            review_case.resolved_at = None
        review_case.updated_at = utcnow()
        audit(db_session, actor, "case.update", "review_case", review_case.id, review_case.workspace_id, {"status": review_case.status, "severity": review_case.severity})
        review_case_row, match, artifacts, evidence_rows = fetch_case_bundle(db_session, review_case.id)
        return jsonify({"success": True, "item": serialize_review_case(review_case_row, match, artifacts, evidence_rows)})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/cases/<int:case_id>/feedback", methods=["POST"])
def create_feedback(case_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        review_case = db_session.get(ReviewCase, case_id)
        if not review_case:
            raise EnterpriseError(404, "Review case not found.", code="case_not_found")
        require_workspace_access(db_session, review_case.workspace_id, actor, "reviewer")
        label = (payload.get("label") or "").strip().lower()
        if label not in {"confirmed_clone", "confirmed_plagiarism", "false_positive", "benign_similarity", "needs_more_review"}:
            raise EnterpriseError(400, "Unsupported feedback label.", code="invalid_feedback_label")
        db_session.add(
            FeedbackEvent(
                workspace_id=review_case.workspace_id,
                case_id=review_case.id,
                legacy_user_id=actor.get("legacy_user_id"),
                label=label,
                confidence_override=_validated_threshold(payload["confidenceOverride"], 0.0) if payload.get("confidenceOverride") is not None else None,
                notes_encrypted=storage.encrypt_text((payload.get("notes") or "").strip() or None),
                created_at=utcnow(),
            )
        )
        review_case.reviewer_feedback = label
        review_case.updated_at = utcnow()
        if label in {"confirmed_clone", "confirmed_plagiarism"}:
            review_case.status = "confirmed_clone"
            review_case.resolution_label = label
            review_case.resolved_at = utcnow()
        elif label in {"false_positive", "benign_similarity"}:
            review_case.status = "false_positive"
            review_case.resolution_label = label
            review_case.resolved_at = utcnow()
        recalibrate_thresholds(db_session, review_case.workspace_id)
        audit(db_session, actor, "case.feedback", "feedback_event", review_case.id, review_case.workspace_id, {"label": label})
        review_case_row, match, artifacts, evidence_rows = fetch_case_bundle(db_session, review_case.id)
        return jsonify({"success": True, "item": serialize_review_case(review_case_row, match, artifacts, evidence_rows)}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/policy-sets", methods=["POST"])
def create_policy_set(workspace_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "admin")
        policy_set = PolicySet(
            workspace_id=workspace_id,
            name=(payload.get("name") or "").strip() or "Policy Set",
            is_active=bool(payload.get("isActive", True)),
            created_by_legacy_user_id=actor.get("legacy_user_id"),
            created_at=utcnow(),
        )
        db_session.add(policy_set)
        db_session.flush()
        rules = payload.get("rules") or []
        if not isinstance(rules, list):
            raise EnterpriseError(400, "rules must be an array.", code="invalid_rules_payload")
        created_rules = []
        for rule_payload in rules:
            if not isinstance(rule_payload, dict):
                raise EnterpriseError(400, "Each rule must be an object.", code="invalid_rule_entry")
            condition_type = (rule_payload.get("conditionType") or "similarity_score").strip()
            if condition_type not in _POLICY_CONDITION_TYPES:
                raise EnterpriseError(
                    400, f"Unsupported policy conditionType '{condition_type}'.",
                    code="invalid_policy_condition_type",
                )
            comparator = (rule_payload.get("comparator") or ">=").strip()
            if comparator not in _POLICY_COMPARATORS:
                raise EnterpriseError(
                    400, f"Unsupported policy comparator '{comparator}'.",
                    code="invalid_policy_comparator",
                )
            action = (rule_payload.get("action") or "create_case").strip()
            if action not in _POLICY_ACTIONS:
                raise EnterpriseError(
                    400, f"Unsupported policy action '{action}'.",
                    code="invalid_policy_action",
                )
            rule = PolicyRule(
                policy_set_id=policy_set.id,
                name=(rule_payload.get("name") or "").strip() or "Policy Rule",
                condition_type=condition_type,
                comparator=comparator,
                threshold_value=_validated_threshold(rule_payload.get("thresholdValue"), DEFAULT_WORKSPACE_THRESHOLD),
                clone_types_json=dumps(rule_payload.get("cloneTypes") or []),
                action=action,
                severity=(rule_payload.get("severity") or "medium").strip().lower(),
                enabled=bool(rule_payload.get("enabled", True)),
                created_at=utcnow(),
            )
            db_session.add(rule)
            created_rules.append(rule)
        audit(db_session, actor, "policy_set.create", "policy_set", policy_set.id, workspace_id, {"ruleCount": len(created_rules)})
        return jsonify({"success": True, "item": {"id": policy_set.id, "workspaceId": policy_set.workspace_id, "name": policy_set.name, "isActive": policy_set.is_active}}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/api-keys", methods=["POST"])
def create_api_credential(workspace_id: int):
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_human_actor(actor, "API keys cannot mint other API keys.")
        workspace = require_workspace_access(db_session, workspace_id, actor, "admin")
        prefix, token_hash, raw_token = issue_api_key()
        scopes = payload.get("scopes") or [f"workspace:{workspace.id}:read", f"workspace:{workspace.id}:write"]
        if not isinstance(scopes, list) or not all(isinstance(item, str) for item in scopes):
            raise EnterpriseError(400, "scopes must be an array of strings.", code="invalid_scopes")
        api_credential = ApiCredential(
            organization_id=workspace.organization_id,
            workspace_id=workspace.id,
            name=(payload.get("name") or "").strip() or "Enterprise API Key",
            token_prefix=prefix,
            token_hash=token_hash,
            scopes_json=dumps(scopes),
            created_by_legacy_user_id=actor.get("legacy_user_id"),
            created_at=utcnow(),
            expires_at=_validated_expires_at(payload),
        )
        db_session.add(api_credential)
        db_session.flush()
        audit(db_session, actor, "api_key.create", "api_credential", api_credential.id, workspace.id, {"scopes": scopes})
        return jsonify({"success": True, "item": {"id": api_credential.id, "name": api_credential.name, "scopes": scopes, "token": raw_token}}), 201


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/api-keys/<int:credential_id>", methods=["DELETE"])
def revoke_api_credential(workspace_id: int, credential_id: int):
    """Revoke a workspace API key (sets ``revoked_at``; the key stops authenticating)."""
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_human_actor(actor, "API keys cannot revoke API keys.")
        require_workspace_access(db_session, workspace_id, actor, "admin")
        credential = db_session.get(ApiCredential, credential_id)
        if not credential or credential.workspace_id != workspace_id:
            raise EnterpriseError(404, "API credential not found.", code="api_credential_not_found")
        if credential.revoked_at is None:
            credential.revoked_at = utcnow()
        audit(db_session, actor, "api_key.revoke", "api_credential", credential.id, workspace_id, {})
        return jsonify({"success": True})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/members/<int:membership_id>", methods=["DELETE"])
def remove_workspace_member(workspace_id: int, membership_id: int):
    """Deactivate a workspace membership (soft remove; preserves audit history)."""
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_human_actor(actor, "API keys cannot manage workspace members.")
        require_workspace_access(db_session, workspace_id, actor, "admin")
        membership = db_session.get(WorkspaceMembership, membership_id)
        if not membership or membership.workspace_id != workspace_id:
            raise EnterpriseError(404, "Workspace membership not found.", code="membership_not_found")
        membership.is_active = False
        membership.last_active_at = utcnow()
        audit(db_session, actor, "workspace.member.remove", "workspace_membership", membership.id, workspace_id, {"legacyUserId": membership.legacy_user_id})
        return jsonify({"success": True})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/archive", methods=["POST"])
def archive_workspace(workspace_id: int):
    """Archive a workspace (sets ``archived_at``)."""
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_human_actor(actor, "API keys cannot archive workspaces.")
        workspace = require_workspace_access(db_session, workspace_id, actor, "admin")
        if workspace.archived_at is None:
            workspace.archived_at = utcnow()
        audit(db_session, actor, "workspace.archive", "workspace", workspace.id, workspace.id, {})
        return jsonify({"success": True})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/repositories/<int:repository_id>", methods=["DELETE"])
def delete_repository(workspace_id: int, repository_id: int):
    """Delete a repository connection.

    Blocked when the repository already has scan history, to avoid orphaning
    snapshots/artifacts/matches; archive the workspace instead in that case.
    """
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_human_actor(actor, "API keys cannot delete repositories.")
        require_workspace_access(db_session, workspace_id, actor, "admin")
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository or repository.workspace_id != workspace_id:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        dependent_jobs = db_session.execute(
            select(func.count(ScanJob.id)).where(ScanJob.repository_id == repository_id)
        ).scalar() or 0
        if dependent_jobs:
            raise EnterpriseError(
                409,
                "Repository has scan history and cannot be deleted. Archive the workspace instead.",
                code="repository_has_dependents",
            )
        db_session.delete(repository)
        audit(db_session, actor, "repository.delete", "repository", repository_id, workspace_id, {})
        return jsonify({"success": True})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces/<int:workspace_id>/analytics", methods=["GET"])
def workspace_analytics(workspace_id: int):
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_workspace_access(db_session, workspace_id, actor, "reviewer")
        analytics = build_workspace_analytics(db_session, workspace_id)
        return jsonify({"success": True, "item": analytics})


@api_bp.route(ENTERPRISE_GRAPHQL_PATH, methods=["POST"])
def enterprise_graphql():
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        query = (payload.get("query") or "").strip()
        variables = payload.get("variables") or {}
        if not isinstance(variables, dict):
            raise EnterpriseError(400, "GraphQL variables must be an object.", code="invalid_graphql_variables")
        data = graphql_dispatch(db_session, actor, query, variables)
        # createScan defers its enqueue until the transaction commits (see
        # graphql_dispatch); pop the internal marker before responding.
        pending_scan_job_id = data.pop("_enqueue_scan_job_id", None)
        response = jsonify({"data": data})
    if pending_scan_job_id is not None:
        enqueue_scan_job(pending_scan_job_id)
    return response


def _is_duplicate_webhook_delivery(db_session, repository_id, delivery_id, commit_sha, window_seconds=300):
    """Replay / duplicate-delivery guard for repository webhooks.

    A signed webhook can be replayed verbatim, and each valid delivery would
    otherwise enqueue another git-clone + full scan (a resource-exhaustion DoS).
    Treat a delivery as a duplicate when the same provider delivery id — or the
    same commit for the same repository — was already recorded within the window.
    """
    if not delivery_id and not commit_sha:
        return False
    cutoff = utcnow() - dt.timedelta(seconds=window_seconds)
    recent_jobs = db_session.execute(
        select(ScanJob)
        .where(ScanJob.repository_id == repository_id, ScanJob.created_at >= cutoff)
        .order_by(ScanJob.created_at.desc())
        .limit(50)
    ).scalars().all()
    for job in recent_jobs:
        existing = loads(job.trigger_payload_json, {})
        if delivery_id and existing.get("deliveryId") == delivery_id:
            return True
        if commit_sha and existing.get("commitSha") == commit_sha:
            return True
    return False


@api_bp.route(f"{GITHUB_WEBHOOK_PREFIX}/<int:repository_id>/webhook", methods=["POST"])
def github_webhook(repository_id: int):
    payload_bytes = request.get_data(cache=False)
    payload = request.get_json(silent=True) or {}
    with session_scope() as db_session:
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        github_signature = (request.headers.get("X-Hub-Signature-256") or "").strip()
        if not github_signature:
            raise EnterpriseError(401, "Missing webhook signature", code="missing_webhook_signature")

        # Native github.com path: GitHub cannot send custom headers, only the
        # HMAC signature computed with the configured secret (the full token
        # this API returned at repository creation).  When we hold an
        # encrypted copy of that token, verify the signature directly.
        verified = False
        if repository.webhook_secret_encrypted:
            stored_token = storage.decrypt_text(repository.webhook_secret_encrypted)
            verified = verify_hmac_signature(stored_token, payload_bytes, github_signature, "sha256")

        # Legacy / proxy path: repositories created before the encrypted copy
        # existed must supply the secret via X-Webhook-Secret (e.g. injected
        # by a relay proxy); the signature is then checked with that secret.
        if not verified:
            secret_header = (request.headers.get("X-Webhook-Secret") or "").strip()
            if not verify_webhook_secret(repository.webhook_secret_hint, repository.webhook_secret_hash, secret_header):
                raise EnterpriseError(401, "Invalid webhook secret.", code="invalid_webhook_secret")
            secret_parts = secret_header.split(".", 1)
            hmac_key = secret_parts[1] if len(secret_parts) > 1 else secret_header
            if not (
                verify_hmac_signature(secret_header, payload_bytes, github_signature, "sha256")
                or verify_hmac_signature(hmac_key, payload_bytes, github_signature, "sha256")
            ):
                raise EnterpriseError(401, "Invalid GitHub webhook signature.", code="invalid_github_signature")
        branch_ref = (payload.get("ref") or "").strip()
        branch = branch_ref.split("/")[-1] if branch_ref else repository.default_branch
        commit_sha = (payload.get("after") or "").strip() or None
        delivery_id = (request.headers.get("X-GitHub-Delivery") or "").strip() or None
        actor = {"kind": "webhook", "legacy_user_id": repository.created_by_legacy_user_id, "workspace_id": repository.workspace_id, "scopes": ["scan:create", "scan:read"], "is_admin": False}
        workspace = db_session.get(Workspace, repository.workspace_id)
        if not workspace:
            raise EnterpriseError(404, "Workspace not found", code="workspace_not_found")
        repository.last_webhook_at = utcnow()
        if _is_duplicate_webhook_delivery(db_session, repository.id, delivery_id, commit_sha):
            return jsonify({"success": True, "deduplicated": True}), 200
        scan_job = create_repository_scan_job(db_session, actor, workspace, repository, "github_webhook", {"branch": branch, "commitSha": commit_sha, "deliveryId": delivery_id})
        audit(db_session, actor, "webhook.github", "scan_job", scan_job.id, workspace.id, {"repositoryId": repository.id, "branch": branch, "commitSha": commit_sha})
        scan_job_id = scan_job.id
    enqueue_scan_job(scan_job_id)
    return jsonify({"success": True, "jobId": scan_job_id}), 202


@api_bp.route(f"{GITLAB_WEBHOOK_PREFIX}/<int:repository_id>/webhook", methods=["POST"])
def gitlab_webhook(repository_id: int):
    payload = request.get_json(silent=True) or {}
    with session_scope() as db_session:
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        secret_header = (request.headers.get("X-Webhook-Secret") or request.headers.get("X-Gitlab-Token") or "").strip()
        if not verify_webhook_secret(repository.webhook_secret_hint, repository.webhook_secret_hash, secret_header):
            raise EnterpriseError(401, "Invalid webhook secret.", code="invalid_webhook_secret")
        branch_ref = (payload.get("ref") or "").strip()
        branch = branch_ref.split("/")[-1] if branch_ref else repository.default_branch
        commit_sha = None
        commits = payload.get("commits") or []
        if isinstance(commits, list) and commits:
            last_commit = commits[-1] or {}
            if isinstance(last_commit, dict):
                commit_sha = (last_commit.get("id") or "").strip() or None
        actor = {"kind": "webhook", "legacy_user_id": repository.created_by_legacy_user_id, "workspace_id": repository.workspace_id, "scopes": ["scan:create", "scan:read"], "is_admin": False}
        workspace = db_session.get(Workspace, repository.workspace_id)
        if not workspace:
            raise EnterpriseError(404, "Workspace not found", code="workspace_not_found")
        repository.last_webhook_at = utcnow()
        if _is_duplicate_webhook_delivery(db_session, repository.id, None, commit_sha):
            return jsonify({"success": True, "deduplicated": True}), 200
        scan_job = create_repository_scan_job(db_session, actor, workspace, repository, "gitlab_webhook", {"branch": branch, "commitSha": commit_sha, "event": request.headers.get("X-Gitlab-Event")})
        audit(db_session, actor, "webhook.gitlab", "scan_job", scan_job.id, workspace.id, {"repositoryId": repository.id, "branch": branch, "commitSha": commit_sha})
        scan_job_id = scan_job.id
    enqueue_scan_job(scan_job_id)
    return jsonify({"success": True, "jobId": scan_job_id}), 202
