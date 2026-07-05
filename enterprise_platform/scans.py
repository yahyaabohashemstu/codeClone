from __future__ import annotations

import datetime as dt
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import current_app
from sqlalchemy import select, update

from enterprise_platform.models import *
from enterprise_platform.utils import *
from enterprise_platform.services import *


def scan_failure_message(exc: Exception) -> str:
    if isinstance(exc, EnterpriseError):
        return exc.message
    return "Repository scan failed."


def claim_scan_job(db_session, scan_job_id: int) -> bool:
    """Atomically transition a job to ``running``.

    Returns ``True`` only for the single caller that wins the transition.  A
    conditional UPDATE is used instead of ``SELECT ... FOR UPDATE SKIP LOCKED``
    because the latter is silently a no-op on SQLite; this guarantees a job is
    never executed twice even when the in-process executor and the standalone
    worker race for the same job.
    """
    result = db_session.execute(
        update(ScanJob)
        .where(ScanJob.id == scan_job_id, ScanJob.status.in_(["queued", "claimed"]))
        .values(status="running", started_at=utcnow())
    )
    return result.rowcount == 1


def run_repository_scan(scan_job_id: int) -> None:
    with storage._app.app_context():
        # Claim the job before any work so it is never executed twice.
        with session_scope() as claim_session:
            if not claim_scan_job(claim_session, scan_job_id):
                return  # already running/completed, or no longer claimable

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
                if branch and (
                    not re.match(r'^[a-zA-Z0-9._/\-]+$', branch)
                    or branch.startswith('-')      # never let a ref be read as a git option
                    or branch.startswith('/')
                    or branch.endswith('/')
                    or '..' in branch
                ):
                    raise EnterpriseError(400, "Invalid branch name.", code="invalid_branch_name")
                if commit_sha and not re.match(r'^[0-9a-fA-F]{4,40}$', commit_sha):
                    raise EnterpriseError(400, "Invalid commit SHA.", code="invalid_commit_sha")
                if local_path:
                    repository_root = Path(normalize_local_repository_path(local_path, require_exists=True))
                elif clone_url:
                    clone_url = normalize_clone_url(clone_url)
                    temp_clone_dir = tempfile.mkdtemp(prefix="enterprise-repo-")
                    # Harden the git transport as defense-in-depth behind
                    # normalize_clone_url: allow only https (blocks ext::/file://
                    # SSRF-to-RCE transports) and disable HTTP redirects (blunts
                    # redirect-based SSRF to internal hosts), so a bypass of the
                    # URL validator alone is not enough to reach internal services.
                    git_hardening = [
                        "-c", "protocol.allow=never",
                        "-c", "protocol.https.allow=always",
                        "-c", "http.followRedirects=false",
                    ]
                    clone_args = ["git", *git_hardening, "clone", "--depth", "1"]
                    if branch:
                        clone_args.extend(["--branch", branch])
                    clone_args.extend(["--no-recurse-submodules", clone_url, temp_clone_dir])
                    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
                    clone_process = subprocess.run(
                        clone_args,
                        capture_output=True,
                        text=True,
                        timeout=REPOSITORY_SCAN_TIMEOUT_SECONDS,
                        check=False,
                        env=env,
                    )
                    if clone_process.returncode != 0 and branch:
                        # Branch not found — retry with the repo's default branch
                        current_app.logger.info(
                            "Branch '%s' not found for repository %s, retrying with default branch.",
                            branch, repository.id,
                        )
                        shutil.rmtree(temp_clone_dir, ignore_errors=True)
                        temp_clone_dir = tempfile.mkdtemp(prefix="enterprise-repo-")
                        fallback_args = ["git", *git_hardening, "clone", "--depth", "1", "--no-recurse-submodules", clone_url, temp_clone_dir]
                        clone_process = subprocess.run(
                            fallback_args,
                            capture_output=True,
                            text=True,
                            timeout=REPOSITORY_SCAN_TIMEOUT_SECONDS,
                            check=False,
                            env=env,
                        )
                        if clone_process.returncode == 0:
                            # Detect the actual branch that was cloned
                            head_result = subprocess.run(
                                ["git", "-C", temp_clone_dir, "rev-parse", "--abbrev-ref", "HEAD"],
                                capture_output=True, text=True, timeout=10, check=False,
                            )
                            if head_result.returncode == 0:
                                branch = head_result.stdout.strip()
                                current_app.logger.info("Cloned with default branch: %s", branch)
                    if clone_process.returncode != 0:
                        stderr = clone_process.stderr.strip() or clone_process.stdout.strip()
                        current_app.logger.warning(
                            "Git clone failed for repository %s: %s",
                            repository.id, stderr,
                        )
                        raise EnterpriseError(502, f"Git clone failed: {stderr[:200]}", code="git_clone_failed")
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
                # Cache decrypted candidate extractions within this scan so a
                # candidate compared against several artifacts is decrypted and
                # reconstructed only once instead of once per comparison.
                candidate_extraction_cache: dict[int, ArtifactExtraction] = {}

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
                        candidate_extraction = candidate_extraction_cache.get(candidate_artifact.id)
                        if candidate_extraction is None:
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
                            candidate_extraction_cache[candidate_artifact.id] = candidate_extraction
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


def requeue_stale_scan_jobs(stale_after_seconds: int | None = None) -> int:
    """Requeue jobs stuck in ``running``/``claimed`` and re-dispatch them.

    In-process mode previously had NO recovery path: a process crash mid-scan
    left the job ``running`` forever (only ``enterprise_worker.py`` reclaimed
    stale jobs).  This sweep runs opportunistically whenever a new scan is
    enqueued in-process.  The window must comfortably exceed the longest
    legitimate scan — requeuing a job that is still executing elsewhere would
    double-run it (``claim_scan_job`` cannot protect a forcibly reset row).

    Returns the number of jobs requeued (and re-submitted to the executor).
    """
    if stale_after_seconds is None:
        try:
            stale_after_seconds = int(os.environ.get("ENTERPRISE_SCAN_RECLAIM_SECONDS", "1800"))
        except ValueError:
            stale_after_seconds = 1800
    stale_after_seconds = max(60, stale_after_seconds)
    cutoff = utcnow() - dt.timedelta(seconds=stale_after_seconds)

    requeued_ids: list[int] = []
    with session_scope() as db_session:
        stale_ids = db_session.execute(
            select(ScanJob.id).where(
                ScanJob.status.in_(["running", "claimed"]),
                ScanJob.started_at.isnot(None),
                ScanJob.started_at < cutoff,
            )
        ).scalars().all()
        for job_id in stale_ids:
            result = db_session.execute(
                update(ScanJob)
                .where(ScanJob.id == job_id, ScanJob.status.in_(["running", "claimed"]))
                .values(
                    status="queued",
                    started_at=None,
                    error_message=(
                        f"Requeued after exceeding the {stale_after_seconds}s stale "
                        "window (process likely crashed mid-scan)."
                    ),
                )
            )
            if result.rowcount == 1:
                requeued_ids.append(job_id)

    for job_id in requeued_ids:
        get_scan_executor().submit(run_repository_scan, job_id)
    return len(requeued_ids)


def enqueue_scan_job(scan_job_id: int) -> None:
    """Dispatch a scan job for execution.

    By default the job runs in-process via the thread-pool executor, so a
    standalone worker is not required.  When a dedicated worker is deployed
    (``ENTERPRISE_USE_WORKER=1``), the job is left ``queued`` for the worker to
    claim instead of also running it in-process.  Either way,
    ``run_repository_scan`` claims the job atomically, so it is never run twice.
    """
    if os.environ.get("ENTERPRISE_USE_WORKER", "").strip().lower() in ("1", "true", "yes"):
        return
    # Opportunistic recovery: sweep jobs orphaned by a previous crash so they
    # do not sit in 'running' forever (the standalone worker does this in its
    # poll loop; in-process mode has no loop, so piggyback on enqueues).
    try:
        requeue_stale_scan_jobs()
    except Exception:
        current_app.logger.exception("Stale scan-job sweep failed; continuing with enqueue.")
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
