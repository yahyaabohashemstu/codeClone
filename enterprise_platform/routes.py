from __future__ import annotations

import datetime as dt
from io import BytesIO
from typing import Any

from flask import Blueprint, current_app, jsonify, request, send_file
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from enterprise_platform.models import *
from enterprise_platform.utils import *
from enterprise_platform.services import *
from enterprise_platform.scans import *

api_bp = Blueprint("enterprise_api", __name__)


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


def graphql_dispatch(db_session, actor: dict[str, Any], query: str, variables: dict[str, Any]) -> dict[str, Any]:
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
        review_cases = db_session.execute(select(ReviewCase).where(ReviewCase.workspace_id == workspace_id).order_by(ReviewCase.created_at.desc())).scalars().all()
        payload = []
        for review_case in review_cases:
            case_bundle = fetch_case_bundle(db_session, review_case.id)
            payload.append(serialize_review_case(*case_bundle))
        return {"reviewCases": payload}
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
        enqueue_scan_job(scan_job.id)
        return {"createScan": serialize_scan_job(scan_job)}
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
        organizations = db_session.execute(select(Organization).order_by(Organization.created_at.desc())).scalars().all()
        if not actor.get("is_admin"):
            visible_org_ids = {
                row.organization_id
                for row in db_session.execute(
                    select(Workspace.organization_id)
                    .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
                    .where(WorkspaceMembership.legacy_user_id == actor.get("legacy_user_id"), WorkspaceMembership.is_active.is_(True))
                ).all()
            }
            organizations = [organization for organization in organizations if organization.id in visible_org_ids]
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
        if actor.get("is_admin"):
            workspaces = db_session.execute(select(Workspace).order_by(Workspace.created_at.desc())).scalars().all()
            memberships = {}
        else:
            rows = db_session.execute(
                select(Workspace, WorkspaceMembership)
                .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
                .where(WorkspaceMembership.legacy_user_id == actor.get("legacy_user_id"), WorkspaceMembership.is_active.is_(True))
                .order_by(Workspace.created_at.desc())
            ).all()
            workspaces = [row[0] for row in rows]
            memberships = {row[0].id: row[1] for row in rows}
        return jsonify({"success": True, "items": [serialize_workspace(workspace, memberships.get(workspace.id)) for workspace in workspaces]})


@api_bp.route(f"{ENTERPRISE_PUBLIC_PREFIX}/workspaces", methods=["POST"])
def create_workspace():
    payload = require_json_body()
    with session_scope() as db_session:
        actor = resolve_actor(db_session)
        require_enterprise_admin(actor, "Only platform administrators can create workspaces.")
        organization_id = int(payload.get("organizationId") or 0)
        organization = db_session.get(Organization, organization_id)
        if not organization:
            raise EnterpriseError(404, "Organization not found.", code="organization_not_found")
        workspace = Workspace(
            organization_id=organization.id,
            slug=slugify(payload.get("slug") or payload.get("name") or ""),
            name=(payload.get("name") or "").strip(),
            description=(payload.get("description") or "").strip() or None,
            storage_region=ensure_region_supported(payload.get("storageRegion") or organization.storage_region),
            default_similarity_threshold=float(payload.get("defaultSimilarityThreshold") or DEFAULT_WORKSPACE_THRESHOLD),
            semantic_threshold=float(payload.get("semanticThreshold") or DEFAULT_SEMANTIC_THRESHOLD),
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
        require_workspace_access(db_session, workspace_id, actor, "admin")
        legacy_user_id = int(payload.get("legacyUserId") or 0)
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
                        "githubWebhookUrl": f"{request.url_root.rstrip('/')}{GITHUB_WEBHOOK_PREFIX}/{repository.id}/webhook",
                        "gitlabWebhookUrl": f"{request.url_root.rstrip('/')}{GITLAB_WEBHOOK_PREFIX}/{repository.id}/webhook",
                    },
                }
            ),
            201,
        )


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
        top_k = max(1, min(int(payload.get("topK") or 10), 50))
        query_artifact_id = payload.get("artifactId")
        query_text = (payload.get("queryText") or "").strip()
        language = (payload.get("language") or "python").strip().lower()
        if query_artifact_id:
            query_artifact = db_session.get(CodeArtifact, int(query_artifact_id))
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
        query = select(ReviewCase).where(ReviewCase.workspace_id == workspace_id)
        if status_filter:
            query = query.where(ReviewCase.status == status_filter)
        cases = db_session.execute(query.order_by(ReviewCase.created_at.desc())).scalars().all()
        serialized = []
        for review_case in cases:
            case_bundle = fetch_case_bundle(db_session, review_case.id)
            serialized.append(serialize_review_case(*case_bundle))
        return jsonify({"success": True, "items": serialized})


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
            if new_status not in ("open", "confirmed", "disputed", "resolved", "dismissed"):
                raise EnterpriseError(400, "Invalid case status.", code="invalid_case_status")
            review_case.status = new_status
        if "severity" in payload:
            new_severity = (payload.get("severity") or review_case.severity).strip().lower()
            if new_severity not in ("critical", "high", "medium", "low", "info", "none"):
                raise EnterpriseError(400, "Invalid case severity.", code="invalid_case_severity")
            review_case.severity = new_severity
        if "assignedToLegacyUserId" in payload:
            assigned_to = payload.get("assignedToLegacyUserId")
            review_case.assigned_to_legacy_user_id = int(assigned_to) if assigned_to else None
        if "resolutionLabel" in payload:
            review_case.resolution_label = (payload.get("resolutionLabel") or "").strip() or None
        if "resolutionNotes" in payload:
            review_case.resolution_notes_encrypted = storage.encrypt_text((payload.get("resolutionNotes") or "").strip() or None)
        if review_case.status in {"resolved", "confirmed_clone", "false_positive", "dismissed"}:
            review_case.resolved_at = utcnow()
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
                confidence_override=float(payload["confidenceOverride"]) if payload.get("confidenceOverride") is not None else None,
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
            rule = PolicyRule(
                policy_set_id=policy_set.id,
                name=(rule_payload.get("name") or "").strip() or "Policy Rule",
                condition_type=(rule_payload.get("conditionType") or "similarity_score").strip(),
                comparator=(rule_payload.get("comparator") or ">=").strip(),
                threshold_value=float(rule_payload.get("thresholdValue") or DEFAULT_WORKSPACE_THRESHOLD),
                clone_types_json=dumps(rule_payload.get("cloneTypes") or []),
                action=(rule_payload.get("action") or "create_case").strip(),
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
            expires_at=utcnow() + dt.timedelta(days=int(payload.get("expiresInDays") or 365)),
        )
        db_session.add(api_credential)
        db_session.flush()
        audit(db_session, actor, "api_key.create", "api_credential", api_credential.id, workspace.id, {"scopes": scopes})
        return jsonify({"success": True, "item": {"id": api_credential.id, "name": api_credential.name, "scopes": scopes, "token": raw_token}}), 201


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
        return jsonify({"data": data})


@api_bp.route(f"{GITHUB_WEBHOOK_PREFIX}/<int:repository_id>/webhook", methods=["POST"])
def github_webhook(repository_id: int):
    payload_bytes = request.get_data(cache=False)
    payload = request.get_json(silent=True) or {}
    with session_scope() as db_session:
        repository = db_session.get(RepositoryConnection, repository_id)
        if not repository:
            raise EnterpriseError(404, "Repository not found.", code="repository_not_found")
        secret_header = (request.headers.get("X-Webhook-Secret") or "").strip()
        if not verify_webhook_secret(repository.webhook_secret_hint, repository.webhook_secret_hash, secret_header):
            raise EnterpriseError(401, "Invalid webhook secret.", code="invalid_webhook_secret")
        github_signature = (request.headers.get("X-Hub-Signature-256") or "").strip()
        if not github_signature:
            raise EnterpriseError(401, "Missing webhook signature", code="missing_webhook_signature")
        if not verify_hmac_signature(secret_header.split(".", 1)[1], payload_bytes, github_signature, "sha256"):
            raise EnterpriseError(401, "Invalid GitHub webhook signature.", code="invalid_github_signature")
        branch_ref = (payload.get("ref") or "").strip()
        branch = branch_ref.split("/")[-1] if branch_ref else repository.default_branch
        commit_sha = (payload.get("after") or "").strip() or None
        actor = {"kind": "webhook", "legacy_user_id": repository.created_by_legacy_user_id, "workspace_id": repository.workspace_id, "scopes": ["scan:create", "scan:read"], "is_admin": False}
        workspace = db_session.get(Workspace, repository.workspace_id)
        if not workspace:
            raise EnterpriseError(404, "Workspace not found", code="workspace_not_found")
        repository.last_webhook_at = utcnow()
        scan_job = create_repository_scan_job(db_session, actor, workspace, repository, "github_webhook", {"branch": branch, "commitSha": commit_sha, "deliveryId": request.headers.get("X-GitHub-Delivery")})
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
        scan_job = create_repository_scan_job(db_session, actor, workspace, repository, "gitlab_webhook", {"branch": branch, "commitSha": commit_sha, "event": request.headers.get("X-Gitlab-Event")})
        audit(db_session, actor, "webhook.gitlab", "scan_job", scan_job.id, workspace.id, {"repositoryId": repository.id, "branch": branch, "commitSha": commit_sha})
        scan_job_id = scan_job.id
    enqueue_scan_job(scan_job_id)
    return jsonify({"success": True, "jobId": scan_job_id}), 202
