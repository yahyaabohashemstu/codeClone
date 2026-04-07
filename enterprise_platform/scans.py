from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import current_app
from sqlalchemy import select

from enterprise_platform.models import *
from enterprise_platform.utils import *
from enterprise_platform.services import *


def scan_failure_message(exc: Exception) -> str:
    if isinstance(exc, EnterpriseError):
        return exc.message
    return "Repository scan failed."


def run_repository_scan(scan_job_id: int) -> None:
    with storage._app.app_context():
        with session_scope() as db_session:
            scan_job = db_session.get(ScanJob, scan_job_id)
            if not scan_job:
                return
            repository = db_session.get(RepositoryConnection, scan_job.repository_id)
            workspace = db_session.get(Workspace, scan_job.workspace_id)
            if not repository or not workspace:
                scan_job.status = "failed"
                scan_job.error_message = "Workspace or repository no longer exists."
                scan_job.completed_at = utcnow()
                return
            compliance_profile = ensure_default_compliance_profile(db_session, workspace)
            scan_job.status = "running"
            scan_job.started_at = utcnow()
            trigger_payload = loads(scan_job.trigger_payload_json, {})
            temp_clone_dir: Optional[str] = None
            try:
                if repository.declared_region != workspace.storage_region and not compliance_profile.cross_region_transfer_enabled:
                    raise EnterpriseError(409, "Cross-region repository scans are blocked by compliance policy.", code="cross_region_blocked")
                repository_root = None
                local_path = storage.decrypt_text(repository.local_path_encrypted) if repository.local_path_encrypted else None
                clone_url = storage.decrypt_text(repository.clone_url_encrypted) if repository.clone_url_encrypted else None
                branch = trigger_payload.get("branch") or repository.default_branch or "main"
                commit_sha = trigger_payload.get("commitSha")
                if branch and not re.match(r'^[a-zA-Z0-9._/\-]+$', branch):
                    raise EnterpriseError(400, "Invalid branch name.", code="invalid_branch_name")
                if commit_sha and not re.match(r'^[0-9a-fA-F]{4,40}$', commit_sha):
                    raise EnterpriseError(400, "Invalid commit SHA.", code="invalid_commit_sha")
                if local_path:
                    repository_root = Path(normalize_local_repository_path(local_path, require_exists=True))
                elif clone_url:
                    clone_url = normalize_clone_url(clone_url)
                    temp_clone_dir = tempfile.mkdtemp(prefix="enterprise-repo-")
                    clone_args = ["git", "clone", "--depth", "1"]
                    if branch:
                        clone_args.extend(["--branch", branch])
                    clone_args.extend([clone_url, temp_clone_dir])
                    clone_process = subprocess.run(
                        clone_args,
                        capture_output=True,
                        text=True,
                        timeout=REPOSITORY_SCAN_TIMEOUT_SECONDS,
                        check=False,
                    )
                    if clone_process.returncode != 0:
                        current_app.logger.warning(
                            "Git clone failed for repository %s: %s",
                            repository.id,
                            clone_process.stderr.strip() or clone_process.stdout.strip(),
                        )
                        raise EnterpriseError(502, "Git clone failed.", code="git_clone_failed")
                    repository_root = Path(temp_clone_dir)
                    if commit_sha:
                        checkout_process = subprocess.run(
                            ["git", "-C", temp_clone_dir, "checkout", commit_sha],
                            capture_output=True,
                            text=True,
                            timeout=REPOSITORY_SCAN_TIMEOUT_SECONDS,
                            check=False,
                        )
                        if checkout_process.returncode != 0:
                            current_app.logger.warning(
                                "Git checkout failed for repository %s: %s",
                                repository.id,
                                checkout_process.stderr.strip() or checkout_process.stdout.strip(),
                            )
                            raise EnterpriseError(502, "Git checkout failed.", code="git_checkout_failed")
                else:
                    raise EnterpriseError(400, "Repository has neither local_path nor clone_url configured.", code="repository_location_missing")

                snapshot = RepositorySnapshot(
                    repository_id=repository.id,
                    scan_job_id=scan_job.id,
                    commit_sha=commit_sha,
                    branch=branch,
                    root_path=str(repository_root),
                    file_count=0,
                    manifest_json="[]",
                    status="processing",
                    scanned_at=utcnow(),
                )
                db_session.add(snapshot)
                db_session.flush()
                scan_job.snapshot_id = snapshot.id
                files = read_supported_repository_files(repository_root)
                snapshot.file_count = len(files)
                snapshot.manifest_json = dumps([{"path": logical_path, "language": language, "bytes": len(source.encode("utf-8", errors="ignore"))} for logical_path, language, source in files])
                db_session.flush()

                new_artifacts: list[tuple[CodeArtifact, dict[str, Any]]] = []
                for logical_path, language, source in files:
                    for extraction in extract_artifacts(logical_path, language, source):
                        artifact, computed = materialize_artifact(db_session, workspace, repository, snapshot, compliance_profile, extraction)
                        new_artifacts.append((artifact, computed))
                storage.invalidate_workspace_index(workspace.id)

                created_matches = 0
                created_cases = 0
                seen_pairs: set[tuple[int, int]] = set()
                artifact_by_id: dict[int, CodeArtifact] = {artifact.id: artifact for artifact, _ in new_artifacts}

                for artifact, computed in new_artifacts:
                    candidate_ids = workspace_search_candidates(db_session, workspace.id, computed["vector"], VECTOR_TOP_K, exclude_artifact_id=artifact.id)
                    for candidate_id in candidate_ids:
                        candidate_artifact = artifact_by_id.get(candidate_id) or db_session.get(CodeArtifact, candidate_id)
                        if not candidate_artifact:
                            continue
                        pair = pair_key(artifact.id, candidate_artifact.id)
                        if pair in seen_pairs:
                            continue
                        seen_pairs.add(pair)
                        candidate_source = storage.decrypt_text(candidate_artifact.raw_source_encrypted)
                        candidate_extraction = ArtifactExtraction(
                            logical_path=candidate_artifact.logical_path,
                            language=candidate_artifact.language,
                            symbol_kind=candidate_artifact.symbol_kind,
                            source_text=candidate_source,
                            start_line=candidate_artifact.start_line,
                            end_line=candidate_artifact.end_line,
                            symbol_name=candidate_artifact.symbol_name,
                            symbol_qualified_name=candidate_artifact.symbol_qualified_name,
                        )
                        similarity_bundle = compute_similarity_bundle(computed["extraction"], candidate_extraction)
                        threshold_profile = determine_effective_thresholds(db_session, workspace.id, artifact.language_family, similarity_bundle["clone_type"])
                        if similarity_bundle["similarity_score"] < threshold_profile.review_threshold:
                            continue
                        artifact_a_id, artifact_b_id = pair
                        existing_match = db_session.execute(
                            select(SimilarityMatch).where(SimilarityMatch.artifact_a_id == artifact_a_id, SimilarityMatch.artifact_b_id == artifact_b_id)
                        ).scalar_one_or_none()
                        if existing_match:
                            continue
                        evidence = build_similarity_evidence(
                            artifact if artifact.id == artifact_a_id else candidate_artifact,
                            candidate_artifact if candidate_artifact.id == artifact_b_id else artifact,
                            similarity_bundle,
                        )
                        match = SimilarityMatch(
                            workspace_id=workspace.id,
                            snapshot_id=snapshot.id,
                            artifact_a_id=artifact_a_id,
                            artifact_b_id=artifact_b_id,
                            similarity_score=similarity_bundle["similarity_score"],
                            structural_score=similarity_bundle["structural_score"],
                            semantic_score=similarity_bundle["semantic_score"],
                            token_score=similarity_bundle["token_score"],
                            clone_type=similarity_bundle["clone_type"],
                            is_cross_language=similarity_bundle["is_cross_language"],
                            evidence_json=dumps(evidence),
                            created_at=utcnow(),
                        )
                        db_session.add(match)
                        db_session.flush()
                        created_matches += 1
                        cases = evaluate_policies_for_match(
                            db_session,
                            scan_job.requested_by_legacy_user_id,
                            workspace,
                            scan_job,
                            match,
                            db_session.get(CodeArtifact, match.artifact_a_id),
                            db_session.get(CodeArtifact, match.artifact_b_id),
                            similarity_bundle,
                        )
                        created_cases += len(cases)

                snapshot.status = "completed"
                scan_job.status = "completed"
                scan_job.completed_at = utcnow()
                scan_job.metrics_json = dumps(
                    {
                        "filesScanned": len(files),
                        "artifactsCreated": len(new_artifacts),
                        "matchesCreated": created_matches,
                        "casesCreated": created_cases,
                    }
                )
                storage.invalidate_workspace_index(workspace.id)
            except Exception as exc:
                scan_job.status = "failed"
                scan_job.completed_at = utcnow()
                scan_job.error_message = scan_failure_message(exc)
                current_app.logger.exception("Enterprise repository scan failed", exc_info=exc)
            finally:
                if temp_clone_dir and os.path.isdir(temp_clone_dir):
                    shutil.rmtree(temp_clone_dir, ignore_errors=True)


def enqueue_scan_job(scan_job_id: int) -> None:
    get_scan_executor().submit(run_repository_scan, scan_job_id)


def create_repository_scan_job(db_session, actor: dict[str, Any], workspace: Workspace, repository: RepositoryConnection, trigger_type: str, trigger_payload: dict[str, Any]) -> ScanJob:
    scan_job = ScanJob(
        workspace_id=workspace.id,
        repository_id=repository.id,
        trigger_type=trigger_type,
        trigger_payload_json=dumps(trigger_payload),
        status="queued",
        requested_by_legacy_user_id=actor.get("legacy_user_id"),
        created_at=utcnow(),
    )
    db_session.add(scan_job)
    db_session.flush()
    return scan_job
