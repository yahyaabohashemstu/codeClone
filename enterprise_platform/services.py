from __future__ import annotations

import datetime as dt
import math
from collections import Counter, defaultdict
from typing import Any, Optional

import networkx as nx
import numpy as np
from sqlalchemy import func, select

from enterprise_platform.models import *
from enterprise_platform.utils import *

def serialize_membership(membership: WorkspaceMembership) -> dict[str, Any]:
    return {
        "id": membership.id,
        "workspaceId": membership.workspace_id,
        "legacyUserId": membership.legacy_user_id,
        "role": membership.role,
        "isActive": membership.is_active,
        "createdAt": membership.created_at.isoformat() if membership.created_at else None,
        "lastActiveAt": membership.last_active_at.isoformat() if membership.last_active_at else None,
    }


def serialize_workspace(workspace: Workspace, membership: Optional[WorkspaceMembership] = None) -> dict[str, Any]:
    return {
        "id": workspace.id,
        "organizationId": workspace.organization_id,
        "slug": workspace.slug,
        "name": workspace.name,
        "description": workspace.description,
        "storageRegion": workspace.storage_region,
        "defaultSimilarityThreshold": workspace.default_similarity_threshold,
        "semanticThreshold": workspace.semantic_threshold,
        "createdByLegacyUserId": workspace.created_by_legacy_user_id,
        "createdAt": workspace.created_at.isoformat() if workspace.created_at else None,
        "archivedAt": workspace.archived_at.isoformat() if workspace.archived_at else None,
        "membership": serialize_membership(membership) if membership else None,
    }


def serialize_repository(repository: RepositoryConnection) -> dict[str, Any]:
    return {
        "id": repository.id,
        "workspaceId": repository.workspace_id,
        "provider": repository.provider,
        "externalId": repository.external_id,
        "name": repository.name,
        "defaultBranch": repository.default_branch,
        "declaredRegion": repository.declared_region,
        "createdByLegacyUserId": repository.created_by_legacy_user_id,
        "createdAt": repository.created_at.isoformat() if repository.created_at else None,
        "lastWebhookAt": repository.last_webhook_at.isoformat() if repository.last_webhook_at else None,
    }


def serialize_snapshot(snapshot: RepositorySnapshot) -> dict[str, Any]:
    return {
        "id": snapshot.id,
        "repositoryId": snapshot.repository_id,
        "scanJobId": snapshot.scan_job_id,
        "commitSha": snapshot.commit_sha,
        "branch": snapshot.branch,
        "fileCount": snapshot.file_count,
        "manifest": loads(snapshot.manifest_json, []),
        "status": snapshot.status,
        "scannedAt": snapshot.scanned_at.isoformat() if snapshot.scanned_at else None,
    }


def serialize_scan_job(scan_job: ScanJob, include_error_message: bool = False) -> dict[str, Any]:
    return {
        "id": scan_job.id,
        "workspaceId": scan_job.workspace_id,
        "repositoryId": scan_job.repository_id,
        "snapshotId": scan_job.snapshot_id,
        "triggerType": scan_job.trigger_type,
        "triggerPayload": loads(scan_job.trigger_payload_json, {}),
        "status": scan_job.status,
        "requestedByLegacyUserId": scan_job.requested_by_legacy_user_id,
        "createdAt": scan_job.created_at.isoformat() if scan_job.created_at else None,
        "startedAt": scan_job.started_at.isoformat() if scan_job.started_at else None,
        "completedAt": scan_job.completed_at.isoformat() if scan_job.completed_at else None,
        "errorMessage": scan_job.error_message if include_error_message else ("Scan failed." if scan_job.error_message else None),
        "metrics": loads(scan_job.metrics_json, {}),
    }


def serialize_artifact(artifact: CodeArtifact, include_source: bool = False) -> dict[str, Any]:
    metadata = loads(artifact.metadata_json, {})
    payload = {
        "id": artifact.id,
        "workspaceId": artifact.workspace_id,
        "repositoryId": artifact.repository_id,
        "snapshotId": artifact.snapshot_id,
        "logicalPath": artifact.logical_path,
        "language": artifact.language,
        "languageFamily": artifact.language_family,
        "symbolName": artifact.symbol_name,
        "symbolQualifiedName": artifact.symbol_qualified_name,
        "symbolKind": artifact.symbol_kind,
        "startLine": artifact.start_line,
        "endLine": artifact.end_line,
        "tokenCount": artifact.token_count,
        "normalizedHash": artifact.normalized_hash,
        "rawSha256": artifact.raw_sha256,
        "storageRegion": artifact.storage_region,
        "metadata": metadata,
        "createdAt": artifact.created_at.isoformat() if artifact.created_at else None,
    }
    if include_source:
        payload["canonicalSource"] = storage.decrypt_text(artifact.canonical_source_encrypted)
        payload["rawSource"] = storage.decrypt_text(artifact.raw_source_encrypted)
    return payload


def serialize_similarity_match(match: SimilarityMatch, artifacts: dict[int, CodeArtifact]) -> dict[str, Any]:
    evidence = loads(match.evidence_json, {})
    return {
        "id": match.id,
        "workspaceId": match.workspace_id,
        "snapshotId": match.snapshot_id,
        "artifactA": serialize_artifact(artifacts[match.artifact_a_id]),
        "artifactB": serialize_artifact(artifacts[match.artifact_b_id]),
        "similarityScore": round(match.similarity_score * 100, 2),
        "structuralScore": round(match.structural_score * 100, 2),
        "semanticScore": round(match.semantic_score * 100, 2),
        "tokenScore": round(match.token_score * 100, 2),
        "cloneType": match.clone_type,
        "isCrossLanguage": match.is_cross_language,
        "evidence": evidence,
        "createdAt": match.created_at.isoformat() if match.created_at else None,
    }


def serialize_review_case(review_case: ReviewCase, match: SimilarityMatch, artifacts: dict[int, CodeArtifact], evidence_rows: list[ReviewEvidence]) -> dict[str, Any]:
    return {
        "id": review_case.id,
        "workspaceId": review_case.workspace_id,
        "repositoryId": review_case.repository_id,
        "snapshotId": review_case.snapshot_id,
        "match": serialize_similarity_match(match, artifacts),
        "policyRuleId": review_case.policy_rule_id,
        "status": review_case.status,
        "severity": review_case.severity,
        "cloneType": review_case.clone_type,
        "confidenceScore": round(review_case.confidence_score * 100, 2),
        "assignedToLegacyUserId": review_case.assigned_to_legacy_user_id,
        "createdByLegacyUserId": review_case.created_by_legacy_user_id,
        "resolutionLabel": review_case.resolution_label,
        "resolutionNotes": storage.decrypt_text(review_case.resolution_notes_encrypted) if review_case.resolution_notes_encrypted else None,
        "reviewerFeedback": review_case.reviewer_feedback,
        "evidence": [
            {
                "id": row.id,
                "artifactId": row.artifact_id,
                "evidenceType": row.evidence_type,
                "title": row.title,
                "payload": loads(row.payload_json, {}),
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in evidence_rows
        ],
        "createdAt": review_case.created_at.isoformat() if review_case.created_at else None,
        "updatedAt": review_case.updated_at.isoformat() if review_case.updated_at else None,
        "resolvedAt": review_case.resolved_at.isoformat() if review_case.resolved_at else None,
    }


def ensure_default_policy_set(db_session, workspace: Workspace, actor_legacy_user_id: Optional[int]) -> PolicySet:
    existing = db_session.execute(
        select(PolicySet).where(PolicySet.workspace_id == workspace.id, PolicySet.is_active.is_(True))
    ).scalar_one_or_none()
    if existing:
        return existing
    policy_set = PolicySet(
        workspace_id=workspace.id,
        name="Default Enterprise Policy",
        is_active=True,
        created_by_legacy_user_id=actor_legacy_user_id,
        created_at=utcnow(),
    )
    db_session.add(policy_set)
    db_session.flush()
    db_session.add_all(
        [
            PolicyRule(
                policy_set_id=policy_set.id,
                name="Escalate High Similarity",
                condition_type="similarity_score",
                comparator=">=",
                threshold_value=workspace.default_similarity_threshold,
                clone_types_json=dumps([]),
                action="create_case",
                severity="high",
                enabled=True,
                created_at=utcnow(),
            ),
            PolicyRule(
                policy_set_id=policy_set.id,
                name="Escalate Cross Language Semantic Clone",
                condition_type="semantic_score",
                comparator=">=",
                threshold_value=workspace.semantic_threshold,
                clone_types_json=dumps(["type_4_cross_language_semantic", "semantic_clone"]),
                action="create_case",
                severity="critical",
                enabled=True,
                created_at=utcnow(),
            ),
        ]
    )
    return policy_set


def ensure_default_compliance_profile(db_session, workspace: Workspace) -> ComplianceProfile:
    profile = db_session.execute(select(ComplianceProfile).where(ComplianceProfile.workspace_id == workspace.id)).scalar_one_or_none()
    if profile:
        return profile
    profile = ComplianceProfile(
        workspace_id=workspace.id,
        storage_region=workspace.storage_region,
        encryption_required=True,
        pii_redaction_enabled=True,
        retention_days=DEFAULT_RETENTION_DAYS,
        legal_hold=False,
        cross_region_transfer_enabled=False,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db_session.add(profile)
    db_session.flush()
    return profile


def ensure_threshold_profile(db_session, workspace_id: int, language_family: str = "generic", clone_type: str = "generic") -> ThresholdProfile:
    profile = db_session.execute(
        select(ThresholdProfile).where(
            ThresholdProfile.workspace_id == workspace_id,
            ThresholdProfile.language_family == language_family,
            ThresholdProfile.clone_type == clone_type,
        )
    ).scalar_one_or_none()
    if profile:
        return profile
    profile = ThresholdProfile(
        workspace_id=workspace_id,
        language_family=language_family,
        clone_type=clone_type,
        decision_threshold=DEFAULT_WORKSPACE_THRESHOLD,
        review_threshold=DEFAULT_REVIEW_THRESHOLD,
        false_positive_rate=0.0,
        false_negative_rate=0.0,
        sample_size=0,
        updated_at=utcnow(),
    )
    db_session.add(profile)
    db_session.flush()
    return profile


def compare_by_comparator(actual_value: float, comparator: str, threshold_value: float) -> bool:
    if comparator == ">=":
        return actual_value >= threshold_value
    if comparator == ">":
        return actual_value > threshold_value
    if comparator == "<=":
        return actual_value <= threshold_value
    if comparator == "<":
        return actual_value < threshold_value
    if comparator == "==":
        return math.isclose(actual_value, threshold_value, rel_tol=1e-9, abs_tol=1e-9)
    raise EnterpriseError(400, "Unsupported policy comparator.", code="unsupported_policy_comparator")


def build_similarity_evidence(artifact_a: CodeArtifact, artifact_b: CodeArtifact, similarity_bundle: dict[str, Any]) -> dict[str, Any]:
    canonical_a = similarity_bundle["canonical_a"].split()
    canonical_b = similarity_bundle["canonical_b"].split()
    shared_tokens = list((Counter(canonical_a) & Counter(canonical_b)).keys())[:16]
    return {
        "location": {
            "artifactA": {"path": artifact_a.logical_path, "startLine": artifact_a.start_line, "endLine": artifact_a.end_line},
            "artifactB": {"path": artifact_b.logical_path, "startLine": artifact_b.start_line, "endLine": artifact_b.end_line},
        },
        "summary": {
            "semanticScore": round(similarity_bundle["semantic_score"] * 100, 2),
            "tokenScore": round(similarity_bundle["token_score"] * 100, 2),
            "structuralScore": round(similarity_bundle["structural_score"] * 100, 2),
            "similarityScore": round(similarity_bundle["similarity_score"] * 100, 2),
            "cloneType": similarity_bundle["clone_type"],
            "isCrossLanguage": similarity_bundle["is_cross_language"],
        },
        "sharedTokens": shared_tokens,
    }


def create_review_case_for_match(
    db_session,
    actor_legacy_user_id: Optional[int],
    workspace: Workspace,
    match: SimilarityMatch,
    artifact_a: CodeArtifact,
    artifact_b: CodeArtifact,
    policy_rule: PolicyRule,
    similarity_bundle: dict[str, Any],
) -> ReviewCase:
    existing_case = db_session.execute(select(ReviewCase).where(ReviewCase.match_id == match.id)).scalar_one_or_none()
    if existing_case:
        return existing_case
    review_case = ReviewCase(
        workspace_id=workspace.id,
        repository_id=artifact_a.repository_id,
        snapshot_id=match.snapshot_id,
        match_id=match.id,
        policy_rule_id=policy_rule.id,
        status="open",
        severity=policy_rule.severity,
        clone_type=match.clone_type,
        confidence_score=match.similarity_score,
        assigned_to_legacy_user_id=None,
        created_by_legacy_user_id=actor_legacy_user_id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db_session.add(review_case)
    db_session.flush()
    db_session.add_all(
        [
            ReviewEvidence(
                case_id=review_case.id,
                artifact_id=artifact_a.id,
                evidence_type="source_location",
                title="Primary evidence",
                payload_json=dumps(
                    {
                        "path": artifact_a.logical_path,
                        "symbol": artifact_a.symbol_name,
                        "startLine": artifact_a.start_line,
                        "endLine": artifact_a.end_line,
                        "excerpt": storage.decrypt_text(artifact_a.raw_source_encrypted)[:600],
                    }
                ),
                created_at=utcnow(),
            ),
            ReviewEvidence(
                case_id=review_case.id,
                artifact_id=artifact_b.id,
                evidence_type="comparison_target",
                title="Matched evidence",
                payload_json=dumps(
                    {
                        "path": artifact_b.logical_path,
                        "symbol": artifact_b.symbol_name,
                        "startLine": artifact_b.start_line,
                        "endLine": artifact_b.end_line,
                        "excerpt": storage.decrypt_text(artifact_b.raw_source_encrypted)[:600],
                    }
                ),
                created_at=utcnow(),
            ),
            ReviewEvidence(
                case_id=review_case.id,
                artifact_id=None,
                evidence_type="similarity_summary",
                title="Similarity summary",
                payload_json=dumps(build_similarity_evidence(artifact_a, artifact_b, similarity_bundle)),
                created_at=utcnow(),
            ),
        ]
    )
    return review_case


def evaluate_policies_for_match(
    db_session,
    actor_legacy_user_id: Optional[int],
    workspace: Workspace,
    scan_job: ScanJob,
    match: SimilarityMatch,
    artifact_a: CodeArtifact,
    artifact_b: CodeArtifact,
    similarity_bundle: dict[str, Any],
) -> list[ReviewCase]:
    cases: list[ReviewCase] = []
    policy_sets = db_session.execute(select(PolicySet).where(PolicySet.workspace_id == workspace.id, PolicySet.is_active.is_(True))).scalars().all()
    if not policy_sets:
        policy_sets = [ensure_default_policy_set(db_session, workspace, actor_legacy_user_id)]
    for policy_set in policy_sets:
        rules = db_session.execute(select(PolicyRule).where(PolicyRule.policy_set_id == policy_set.id, PolicyRule.enabled.is_(True))).scalars().all()
        for rule in rules:
            clone_types = loads(rule.clone_types_json, [])
            if clone_types and match.clone_type not in clone_types:
                db_session.add(
                    PolicyExecution(
                        workspace_id=workspace.id,
                        scan_job_id=scan_job.id,
                        case_id=None,
                        rule_id=rule.id,
                        outcome="skipped_clone_type",
                        triggered=False,
                        details_json=dumps({"cloneType": match.clone_type}),
                        created_at=utcnow(),
                    )
                )
                continue
            metric_value = {
                "similarity_score": match.similarity_score,
                "semantic_score": match.semantic_score,
                "token_score": match.token_score,
                "structural_score": match.structural_score,
            }.get(rule.condition_type)
            if metric_value is None:
                db_session.add(
                    PolicyExecution(
                        workspace_id=workspace.id,
                        scan_job_id=scan_job.id,
                        case_id=None,
                        rule_id=rule.id,
                        outcome="unsupported_metric",
                        triggered=False,
                        details_json=dumps({"conditionType": rule.condition_type}),
                        created_at=utcnow(),
                    )
                )
                continue
            triggered = compare_by_comparator(metric_value, rule.comparator, rule.threshold_value)
            created_case_id = None
            if triggered and rule.action == "create_case":
                created_case = create_review_case_for_match(
                    db_session,
                    actor_legacy_user_id,
                    workspace,
                    match,
                    artifact_a,
                    artifact_b,
                    rule,
                    similarity_bundle,
                )
                created_case_id = created_case.id
                cases.append(created_case)
            db_session.add(
                PolicyExecution(
                    workspace_id=workspace.id,
                    scan_job_id=scan_job.id,
                    case_id=created_case_id,
                    rule_id=rule.id,
                    outcome="triggered" if triggered else "not_triggered",
                    triggered=triggered,
                    details_json=dumps({"metric": metric_value, "threshold": rule.threshold_value}),
                    created_at=utcnow(),
                )
            )
    return cases


def determine_effective_thresholds(db_session, workspace_id: int, language_family: str, clone_type: str) -> ThresholdProfile:
    specific = db_session.execute(
        select(ThresholdProfile).where(
            ThresholdProfile.workspace_id == workspace_id,
            ThresholdProfile.language_family == language_family,
            ThresholdProfile.clone_type == clone_type,
        )
    ).scalar_one_or_none()
    if specific:
        return specific
    family_only = db_session.execute(
        select(ThresholdProfile).where(
            ThresholdProfile.workspace_id == workspace_id,
            ThresholdProfile.language_family == language_family,
            ThresholdProfile.clone_type == "generic",
        )
    ).scalar_one_or_none()
    if family_only:
        return family_only
    return ensure_threshold_profile(db_session, workspace_id, "generic", "generic")


def materialize_artifact(
    db_session,
    workspace: Workspace,
    repository: RepositoryConnection,
    snapshot: RepositorySnapshot,
    compliance_profile: ComplianceProfile,
    extraction: ArtifactExtraction,
) -> tuple[CodeArtifact, dict[str, Any]]:
    canonical_source, tokens = canonicalize_source(extraction.source_text, extraction.language)
    vector = feature_hash_vector(tokens)
    sanitized_raw = sanitize_for_storage(extraction.source_text, compliance_profile.pii_redaction_enabled)
    sanitized_canonical = sanitize_for_storage(canonical_source, compliance_profile.pii_redaction_enabled)
    artifact = CodeArtifact(
        workspace_id=workspace.id,
        repository_id=repository.id,
        snapshot_id=snapshot.id,
        logical_path=extraction.logical_path,
        language=extraction.language,
        language_family=LANGUAGE_FAMILY.get(extraction.language, "generic"),
        symbol_name=extraction.symbol_name,
        symbol_qualified_name=extraction.symbol_qualified_name,
        symbol_kind=extraction.symbol_kind,
        start_line=extraction.start_line,
        end_line=extraction.end_line,
        token_count=len(tokens),
        normalized_hash=sha256_hex(sanitized_canonical),
        raw_sha256=sha256_hex(sanitized_raw),
        storage_region=compliance_profile.storage_region,
        canonical_source_encrypted=storage.encrypt_text(sanitized_canonical),
        raw_source_encrypted=storage.encrypt_text(sanitized_raw),
        embedding_vector=serialize_vector(vector),
        embedding_dim=EMBEDDING_DIMENSION,
        metadata_json=dumps({"logicalPath": extraction.logical_path, "symbolKind": extraction.symbol_kind, "tokenPreview": tokens[:20]}),
        created_at=utcnow(),
    )
    db_session.add(artifact)
    db_session.flush()
    return artifact, {
        "canonical_source": sanitized_canonical,
        "tokens": tokens,
        "vector": vector,
        "extraction": extraction,
    }


def workspace_search_candidates(db_session, workspace_id: int, query_vector: np.ndarray, top_k: int, exclude_artifact_id: Optional[int] = None) -> list[int]:
    index = storage.get_workspace_index(db_session, workspace_id)
    if index.vectors.shape[0] == 0:
        return []
    query = np.asarray(query_vector, dtype=np.float32)
    norm = np.linalg.norm(query)
    if norm > 0:
        query = query / norm
    scores = np.dot(index.vectors, query)
    ordered = np.argsort(scores)[::-1]
    artifact_ids: list[int] = []
    for candidate_idx in ordered:
        artifact_id = index.artifact_ids[int(candidate_idx)]
        if exclude_artifact_id and artifact_id == exclude_artifact_id:
            continue
        artifact_ids.append(int(artifact_id))
        if len(artifact_ids) >= top_k:
            break
    return artifact_ids


def pair_key(a_id: int, b_id: int) -> tuple[int, int]:
    return (a_id, b_id) if a_id < b_id else (b_id, a_id)



def build_workspace_analytics(db_session, workspace_id: int) -> dict[str, Any]:
    artifacts = db_session.execute(select(CodeArtifact).where(CodeArtifact.workspace_id == workspace_id)).scalars().all()
    matches = db_session.execute(select(SimilarityMatch).where(SimilarityMatch.workspace_id == workspace_id)).scalars().all()
    repositories = db_session.execute(select(RepositoryConnection).where(RepositoryConnection.workspace_id == workspace_id)).scalars().all()
    artifacts_by_id = {artifact.id: artifact for artifact in artifacts}

    similarity_spread = {"0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0}
    for match in matches:
        score = match.similarity_score * 100
        if score < 25:
            similarity_spread["0-25"] += 1
        elif score < 50:
            similarity_spread["25-50"] += 1
        elif score < 75:
            similarity_spread["50-75"] += 1
        else:
            similarity_spread["75-100"] += 1

    graph = nx.Graph()
    for artifact in artifacts:
        graph.add_node(artifact.id, repository_id=artifact.repository_id, path=artifact.logical_path)
    for match in matches:
        graph.add_edge(match.artifact_a_id, match.artifact_b_id, weight=match.similarity_score)
    clusters = []
    for cluster_nodes in nx.connected_components(graph):
        if len(cluster_nodes) < 2:
            continue
        cluster_matches = [
            {"artifactAId": a_id, "artifactBId": b_id, "weight": round(graph[a_id][b_id]["weight"] * 100, 2)}
            for a_id, b_id in graph.subgraph(cluster_nodes).edges()
        ]
        clusters.append(
            {
                "size": len(cluster_nodes),
                "artifactIds": list(cluster_nodes),
                "paths": [artifacts_by_id[node_id].logical_path for node_id in cluster_nodes if node_id in artifacts_by_id],
                "links": cluster_matches,
            }
        )

    repository_heatmap: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    repo_name_by_id = {repo.id: repo.name for repo in repositories}
    for match in matches:
        artifact_a = artifacts_by_id.get(match.artifact_a_id)
        artifact_b = artifacts_by_id.get(match.artifact_b_id)
        if not artifact_a or not artifact_b:
            continue
        repo_a = repo_name_by_id.get(artifact_a.repository_id, f"repo-{artifact_a.repository_id}")
        repo_b = repo_name_by_id.get(artifact_b.repository_id, f"repo-{artifact_b.repository_id}")
        repository_heatmap[repo_a][repo_b].append(match.similarity_score)
        repository_heatmap[repo_b][repo_a].append(match.similarity_score)

    heatmap_matrix = []
    repository_names = sorted(repo_name_by_id.values())
    for row_repo in repository_names:
        heatmap_row = []
        for column_repo in repository_names:
            scores = repository_heatmap[row_repo][column_repo]
            heatmap_row.append(round((sum(scores) / len(scores)) * 100, 2) if scores else 0.0)
        heatmap_matrix.append({"repository": row_repo, "scores": heatmap_row})

    clone_type_counts = Counter(match.clone_type for match in matches)
    return {
        "artifacts": len(artifacts),
        "matches": len(matches),
        "repositories": len(repositories),
        "clusters": clusters,
        "heatmap": {"repositories": repository_names, "matrix": heatmap_matrix},
        "similaritySpread": [{"bucket": bucket, "count": count} for bucket, count in similarity_spread.items()],
        "cloneTypes": [{"cloneType": clone_type, "count": count} for clone_type, count in clone_type_counts.most_common()],
    }


def recalibrate_thresholds(db_session, workspace_id: int) -> None:
    feedback_rows = db_session.execute(
        select(FeedbackEvent, ReviewCase, SimilarityMatch).join(ReviewCase, ReviewCase.id == FeedbackEvent.case_id).join(SimilarityMatch, SimilarityMatch.id == ReviewCase.match_id).where(FeedbackEvent.workspace_id == workspace_id)
    ).all()
    grouped: dict[tuple[str, str], list[tuple[str, float]]] = defaultdict(list)
    for feedback, review_case, similarity_match in feedback_rows:
        artifact_a = db_session.get(CodeArtifact, similarity_match.artifact_a_id)
        language_family = artifact_a.language_family if artifact_a else "generic"
        grouped[(language_family, review_case.clone_type)].append((feedback.label, similarity_match.similarity_score))
    for (language_family, clone_type), values in grouped.items():
        confirmed = [score for label, score in values if label in {"confirmed_clone", "confirmed_plagiarism"}]
        false_positive = [score for label, score in values if label in {"false_positive", "benign_similarity"}]
        profile = ensure_threshold_profile(db_session, workspace_id, language_family, clone_type)
        sample_size = len(values)
        if confirmed:
            decision_threshold = max(0.35, min(0.99, float(np.percentile(confirmed, 40))))
        else:
            decision_threshold = profile.decision_threshold
        if false_positive:
            review_threshold = max(0.20, min(decision_threshold, float(np.percentile(false_positive, 90))))
        else:
            review_threshold = min(decision_threshold, profile.review_threshold)
        profile.decision_threshold = decision_threshold
        profile.review_threshold = min(review_threshold, decision_threshold)
        profile.false_positive_rate = (len(false_positive) / sample_size) if sample_size else 0.0
        profile.false_negative_rate = 0.0
        profile.sample_size = sample_size
        profile.updated_at = utcnow()


def fetch_case_bundle(db_session, case_id: int) -> tuple[ReviewCase, SimilarityMatch, dict[int, CodeArtifact], list[ReviewEvidence]]:
    review_case = db_session.get(ReviewCase, case_id)
    if not review_case:
        raise EnterpriseError(404, "Review case not found.", code="case_not_found")
    match = db_session.get(SimilarityMatch, review_case.match_id)
    if not match:
        raise EnterpriseError(404, "Similarity match not found for this case.", code="match_not_found")
    artifact_rows = db_session.execute(select(CodeArtifact).where(CodeArtifact.id.in_([match.artifact_a_id, match.artifact_b_id]))).scalars().all()
    evidence_rows = db_session.execute(select(ReviewEvidence).where(ReviewEvidence.case_id == case_id)).scalars().all()
    artifacts = {artifact.id: artifact for artifact in artifact_rows}
    return review_case, match, artifacts, evidence_rows


def build_review_case_report_payload(
    db_session,
    review_case: ReviewCase,
    match: SimilarityMatch,
    artifacts: dict[int, CodeArtifact],
    evidence_rows: list[ReviewEvidence],
) -> dict[str, Any]:
    artifact_a = artifacts.get(match.artifact_a_id)
    artifact_b = artifacts.get(match.artifact_b_id)
    if not artifact_a or not artifact_b:
        raise EnterpriseError(500, "Review case is missing one or more comparison artifacts.", code="case_artifact_missing")
    workspace = db_session.get(Workspace, review_case.workspace_id)
    repository = db_session.get(RepositoryConnection, review_case.repository_id) if review_case.repository_id else None
    snapshot = db_session.get(RepositorySnapshot, review_case.snapshot_id) if review_case.snapshot_id else None
    policy_rule = db_session.get(PolicyRule, review_case.policy_rule_id) if review_case.policy_rule_id else None
    audit_rows = db_session.execute(
        select(AuditLog)
        .where(AuditLog.workspace_id == review_case.workspace_id)
        .order_by(AuditLog.created_at.desc())
        .limit(25)
    ).scalars().all()
    serialized_case = serialize_review_case(review_case, match, artifacts, evidence_rows)
    serialized_case["match"]["artifactA"] = serialize_artifact(artifact_a, include_source=True)
    serialized_case["match"]["artifactB"] = serialize_artifact(artifact_b, include_source=True)
    return {
        "generatedAt": utcnow().isoformat(),
        "workspace": {
            "id": workspace.id if workspace else None,
            "name": workspace.name if workspace else None,
            "slug": workspace.slug if workspace else None,
            "organizationId": workspace.organization_id if workspace else None,
            "storageRegion": workspace.storage_region if workspace else None,
        },
        "repository": serialize_repository(repository) if repository else None,
        "snapshot": serialize_snapshot(snapshot) if snapshot else None,
        "policyRule": {
            "id": policy_rule.id,
            "name": policy_rule.name,
            "conditionType": policy_rule.condition_type,
            "comparator": policy_rule.comparator,
            "thresholdValue": policy_rule.threshold_value,
            "action": policy_rule.action,
            "severity": policy_rule.severity,
        }
        if policy_rule
        else None,
        "case": serialized_case,
        "auditTrail": [
            {
                "id": row.id,
                "action": row.action,
                "entityType": row.entity_type,
                "entityId": row.entity_id,
                "actorLegacyUserId": row.actor_legacy_user_id,
                "actorType": row.actor_type,
                "requestId": row.request_id,
                "metadata": loads(row.metadata_json, {}),
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in audit_rows
        ],
    }
