from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
from io import BytesIO
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
from collections import Counter, defaultdict
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional

import networkx as nx
import numpy as np
from cryptography.fernet import Fernet, InvalidToken
from flask import Blueprint, current_app, jsonify, request, send_file, session
from flask_login import current_user
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker
from sqlalchemy.sql.schema import Column
from sqlalchemy.sql.sqltypes import String


Base = declarative_base()

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ENTERPRISE_API_PREFIX = "/api/enterprise"
ENTERPRISE_PUBLIC_PREFIX = f"{ENTERPRISE_API_PREFIX}/v1"
ENTERPRISE_GRAPHQL_PATH = f"{ENTERPRISE_API_PREFIX}/graphql"
GITHUB_WEBHOOK_PREFIX = "/api/integrations/github"
GITLAB_WEBHOOK_PREFIX = "/api/integrations/gitlab"
EMBEDDING_DIMENSION = 384
VECTOR_TOP_K = 12
MAX_SOURCE_FILE_BYTES = 512 * 1024
REPOSITORY_SCAN_TIMEOUT_SECONDS = 300
DEFAULT_STORAGE_REGION = "global"
DEFAULT_WORKSPACE_THRESHOLD = 0.78
DEFAULT_SEMANTIC_THRESHOLD = 0.86
DEFAULT_REVIEW_THRESHOLD = 0.68
DEFAULT_RETENTION_DAYS = 365

ROLE_ORDER = {
    "student": 10,
    "reviewer": 20,
    "manager": 30,
    "admin": 40,
    "owner": 50,
}

SUPPORTED_REGIONS = {
    "global",
    "us-east",
    "us-west",
    "eu-west",
    "eu-central",
    "me-central",
    "ap-southeast",
}

SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".cs": "csharp",
    ".go": "go",
    ".php": "php",
    ".rb": "ruby",
    ".rs": "rust",
    ".kt": "kotlin",
    ".swift": "swift",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
}

LANGUAGE_FAMILY = {
    "python": "dynamic",
    "javascript": "dynamic",
    "typescript": "managed",
    "java": "managed",
    "csharp": "managed",
    "go": "compiled",
    "php": "dynamic",
    "ruby": "dynamic",
    "rust": "compiled",
    "kotlin": "managed",
    "swift": "compiled",
    "cpp": "compiled",
    "c": "compiled",
}

IGNORED_DIRECTORIES = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".next",
    ".turbo",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
    "env",
    ".cache",
}

CANONICAL_KEYWORD_MAP = {
    "def": "FUNC",
    "function": "FUNC",
    "fn": "FUNC",
    "func": "FUNC",
    "class": "CLASS",
    "interface": "INTERFACE",
    "struct": "STRUCT",
    "enum": "ENUM",
    "trait": "TRAIT",
    "module": "MODULE",
    "import": "IMPORT",
    "from": "IMPORT",
    "include": "IMPORT",
    "using": "IMPORT",
    "package": "PACKAGE",
    "namespace": "NAMESPACE",
    "if": "IF",
    "else": "ELSE",
    "elif": "ELSEIF",
    "switch": "SWITCH",
    "case": "CASE",
    "match": "MATCH",
    "for": "LOOP",
    "while": "LOOP",
    "foreach": "LOOP",
    "do": "LOOP",
    "break": "BREAK",
    "continue": "CONTINUE",
    "return": "RETURN",
    "yield": "YIELD",
    "await": "AWAIT",
    "async": "ASYNC",
    "try": "TRY",
    "catch": "CATCH",
    "except": "CATCH",
    "finally": "FINALLY",
    "throw": "THROW",
    "raise": "THROW",
    "new": "NEW",
    "this": "SELF",
    "self": "SELF",
    "super": "SUPER",
    "true": "BOOL",
    "false": "BOOL",
    "null": "NULL",
    "none": "NULL",
    "nil": "NULL",
    "let": "VAR",
    "var": "VAR",
    "const": "CONST",
    "public": "VISIBILITY",
    "private": "VISIBILITY",
    "protected": "VISIBILITY",
    "static": "STATIC",
}

PII_PATTERNS = [
    (re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"), "[REDACTED_EMAIL]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    (re.compile(r"(?i)\b(secret|token|password|passwd|api_key)\s*[:=]\s*['\"][^'\"]+['\"]"), r"\1='[REDACTED_SECRET]'"),
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "[REDACTED_CARD]"),
]


class EnterpriseError(Exception):
    def __init__(self, status_code: int, message: str, code: str = "enterprise_error", details: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details or {}


class Organization(Base):
    __tablename__ = "enterprise_organization"
    id = Column(Integer, primary_key=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    storage_region = Column(String(32), nullable=False, default=DEFAULT_STORAGE_REGION)
    encrypted_settings = Column(Text, nullable=True)
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class Workspace(Base):
    __tablename__ = "enterprise_workspace"
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("enterprise_organization.id"), nullable=False, index=True)
    slug = Column(String(80), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    storage_region = Column(String(32), nullable=False, default=DEFAULT_STORAGE_REGION)
    default_similarity_threshold = Column(Float, nullable=False, default=DEFAULT_WORKSPACE_THRESHOLD)
    semantic_threshold = Column(Float, nullable=False, default=DEFAULT_SEMANTIC_THRESHOLD)
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    archived_at = Column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_enterprise_workspace_org_slug"),)


class WorkspaceMembership(Base):
    __tablename__ = "enterprise_workspace_membership"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    legacy_user_id = Column(Integer, nullable=False, index=True)
    role = Column(String(24), nullable=False, default="student")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("workspace_id", "legacy_user_id", name="uq_workspace_user"),)


class ApiCredential(Base):
    __tablename__ = "enterprise_api_credential"
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("enterprise_organization.id"), nullable=True, index=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    token_prefix = Column(String(24), nullable=False, unique=True, index=True)
    token_hash = Column(String(128), nullable=False, unique=True)
    scopes_json = Column(Text, nullable=False, default="[]")
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class RepositoryConnection(Base):
    __tablename__ = "enterprise_repository_connection"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    provider = Column(String(24), nullable=False, index=True)
    external_id = Column(String(255), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    default_branch = Column(String(128), nullable=True)
    clone_url_encrypted = Column(Text, nullable=True)
    local_path_encrypted = Column(Text, nullable=True)
    declared_region = Column(String(32), nullable=False, default=DEFAULT_STORAGE_REGION)
    webhook_secret_hash = Column(String(128), nullable=True)
    webhook_secret_hint = Column(String(24), nullable=True)
    last_webhook_at = Column(DateTime(timezone=True), nullable=True)
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    __table_args__ = (UniqueConstraint("workspace_id", "provider", "name", name="uq_workspace_repository"),)


class ScanJob(Base):
    __tablename__ = "enterprise_scan_job"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    repository_id = Column(Integer, ForeignKey("enterprise_repository_connection.id"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("enterprise_repository_snapshot.id"), nullable=True, index=True)
    trigger_type = Column(String(32), nullable=False, default="manual")
    trigger_payload_json = Column(Text, nullable=False, default="{}")
    status = Column(String(24), nullable=False, default="queued", index=True)
    requested_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    metrics_json = Column(Text, nullable=True)


class RepositorySnapshot(Base):
    __tablename__ = "enterprise_repository_snapshot"
    id = Column(Integer, primary_key=True)
    repository_id = Column(Integer, ForeignKey("enterprise_repository_connection.id"), nullable=False, index=True)
    scan_job_id = Column(Integer, ForeignKey("enterprise_scan_job.id"), nullable=True, index=True)
    commit_sha = Column(String(128), nullable=True, index=True)
    branch = Column(String(128), nullable=True)
    root_path = Column(Text, nullable=True)
    file_count = Column(Integer, nullable=False, default=0)
    manifest_json = Column(Text, nullable=False, default="[]")
    status = Column(String(24), nullable=False, default="pending", index=True)
    scanned_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class CodeArtifact(Base):
    __tablename__ = "enterprise_code_artifact"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    repository_id = Column(Integer, ForeignKey("enterprise_repository_connection.id"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("enterprise_repository_snapshot.id"), nullable=False, index=True)
    logical_path = Column(Text, nullable=False)
    language = Column(String(32), nullable=False, index=True)
    language_family = Column(String(32), nullable=False, index=True)
    symbol_name = Column(String(255), nullable=True, index=True)
    symbol_qualified_name = Column(String(512), nullable=True)
    symbol_kind = Column(String(32), nullable=False, default="file")
    start_line = Column(Integer, nullable=False, default=1)
    end_line = Column(Integer, nullable=False, default=1)
    token_count = Column(Integer, nullable=False, default=0)
    normalized_hash = Column(String(64), nullable=False, index=True)
    raw_sha256 = Column(String(64), nullable=False, index=True)
    storage_region = Column(String(32), nullable=False, default=DEFAULT_STORAGE_REGION)
    canonical_source_encrypted = Column(Text, nullable=False)
    raw_source_encrypted = Column(Text, nullable=False)
    embedding_vector = Column(Text, nullable=False)
    embedding_dim = Column(Integer, nullable=False, default=EMBEDDING_DIMENSION)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    __table_args__ = (
        Index("ix_artifact_workspace_snapshot_path", "workspace_id", "snapshot_id", "logical_path"),
        Index("ix_artifact_repo_symbol", "repository_id", "symbol_name"),
    )


class SimilarityMatch(Base):
    __tablename__ = "enterprise_similarity_match"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("enterprise_repository_snapshot.id"), nullable=False, index=True)
    artifact_a_id = Column(Integer, ForeignKey("enterprise_code_artifact.id"), nullable=False, index=True)
    artifact_b_id = Column(Integer, ForeignKey("enterprise_code_artifact.id"), nullable=False, index=True)
    similarity_score = Column(Float, nullable=False, index=True)
    structural_score = Column(Float, nullable=False)
    semantic_score = Column(Float, nullable=False)
    token_score = Column(Float, nullable=False)
    clone_type = Column(String(64), nullable=False, index=True)
    is_cross_language = Column(Boolean, nullable=False, default=False)
    evidence_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    __table_args__ = (UniqueConstraint("artifact_a_id", "artifact_b_id", name="uq_similarity_pair"),)


class PolicySet(Base):
    __tablename__ = "enterprise_policy_set"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class PolicyRule(Base):
    __tablename__ = "enterprise_policy_rule"
    id = Column(Integer, primary_key=True)
    policy_set_id = Column(Integer, ForeignKey("enterprise_policy_set.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    condition_type = Column(String(64), nullable=False)
    comparator = Column(String(16), nullable=False, default=">=")
    threshold_value = Column(Float, nullable=False)
    clone_types_json = Column(Text, nullable=False, default="[]")
    action = Column(String(64), nullable=False, default="create_case")
    severity = Column(String(16), nullable=False, default="medium")
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class ReviewCase(Base):
    __tablename__ = "enterprise_review_case"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    repository_id = Column(Integer, ForeignKey("enterprise_repository_connection.id"), nullable=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("enterprise_repository_snapshot.id"), nullable=True, index=True)
    match_id = Column(Integer, ForeignKey("enterprise_similarity_match.id"), nullable=False, unique=True, index=True)
    policy_rule_id = Column(Integer, ForeignKey("enterprise_policy_rule.id"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="open", index=True)
    severity = Column(String(16), nullable=False, default="medium", index=True)
    clone_type = Column(String(64), nullable=False, index=True)
    confidence_score = Column(Float, nullable=False, index=True)
    assigned_to_legacy_user_id = Column(Integer, nullable=True, index=True)
    created_by_legacy_user_id = Column(Integer, nullable=True, index=True)
    resolution_label = Column(String(64), nullable=True, index=True)
    resolution_notes_encrypted = Column(Text, nullable=True)
    reviewer_feedback = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class ReviewEvidence(Base):
    __tablename__ = "enterprise_review_evidence"
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey("enterprise_review_case.id"), nullable=False, index=True)
    artifact_id = Column(Integer, ForeignKey("enterprise_code_artifact.id"), nullable=True, index=True)
    evidence_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    payload_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class PolicyExecution(Base):
    __tablename__ = "enterprise_policy_execution"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    scan_job_id = Column(Integer, ForeignKey("enterprise_scan_job.id"), nullable=False, index=True)
    case_id = Column(Integer, ForeignKey("enterprise_review_case.id"), nullable=True, index=True)
    rule_id = Column(Integer, ForeignKey("enterprise_policy_rule.id"), nullable=False, index=True)
    outcome = Column(String(32), nullable=False)
    triggered = Column(Boolean, nullable=False, default=False, index=True)
    details_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class FeedbackEvent(Base):
    __tablename__ = "enterprise_feedback_event"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    case_id = Column(Integer, ForeignKey("enterprise_review_case.id"), nullable=False, index=True)
    legacy_user_id = Column(Integer, nullable=False, index=True)
    label = Column(String(64), nullable=False, index=True)
    confidence_override = Column(Float, nullable=True)
    notes_encrypted = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class ThresholdProfile(Base):
    __tablename__ = "enterprise_threshold_profile"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, index=True)
    language_family = Column(String(32), nullable=False, default="generic")
    clone_type = Column(String(64), nullable=False, default="generic")
    decision_threshold = Column(Float, nullable=False, default=DEFAULT_WORKSPACE_THRESHOLD)
    review_threshold = Column(Float, nullable=False, default=DEFAULT_REVIEW_THRESHOLD)
    false_positive_rate = Column(Float, nullable=False, default=0.0)
    false_negative_rate = Column(Float, nullable=False, default=0.0)
    sample_size = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    __table_args__ = (UniqueConstraint("workspace_id", "language_family", "clone_type", name="uq_threshold_profile"),)


class ComplianceProfile(Base):
    __tablename__ = "enterprise_compliance_profile"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=False, unique=True, index=True)
    storage_region = Column(String(32), nullable=False, default=DEFAULT_STORAGE_REGION)
    encryption_required = Column(Boolean, nullable=False, default=True)
    pii_redaction_enabled = Column(Boolean, nullable=False, default=True)
    retention_days = Column(Integer, nullable=False, default=DEFAULT_RETENTION_DAYS)
    legal_hold = Column(Boolean, nullable=False, default=False)
    cross_region_transfer_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class AuditLog(Base):
    __tablename__ = "enterprise_audit_log"
    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, ForeignKey("enterprise_workspace.id"), nullable=True, index=True)
    actor_legacy_user_id = Column(Integer, nullable=True, index=True)
    actor_type = Column(String(32), nullable=False, default="user")
    action = Column(String(128), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(64), nullable=True, index=True)
    request_id = Column(String(64), nullable=True, index=True)
    ip_hash = Column(String(64), nullable=True)
    user_agent_hash = Column(String(64), nullable=True)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: dt.datetime.now(dt.timezone.utc))


class ArtifactExtraction:
    def __init__(
        self,
        logical_path: str,
        language: str,
        symbol_kind: str,
        source_text: str,
        start_line: int,
        end_line: int,
        symbol_name: Optional[str] = None,
        symbol_qualified_name: Optional[str] = None,
    ) -> None:
        self.logical_path = logical_path
        self.language = language
        self.symbol_kind = symbol_kind
        self.source_text = source_text
        self.start_line = start_line
        self.end_line = end_line
        self.symbol_name = symbol_name
        self.symbol_qualified_name = symbol_qualified_name


class WorkspaceVectorIndex:
    def __init__(self, artifact_ids: list[int], repository_ids: list[int], snapshot_ids: list[int], language_families: list[str], vectors: np.ndarray, version_marker: tuple[int, int]) -> None:
        self.artifact_ids = artifact_ids
        self.repository_ids = repository_ids
        self.snapshot_ids = snapshot_ids
        self.language_families = language_families
        self.vectors = vectors
        self.version_marker = version_marker


class EnterpriseStorage:
    def __init__(self) -> None:
        self._init_lock = threading.Lock()
        self._engine = None
        self._session_factory = None
        self._encryption_service: Optional[Fernet] = None
        self._app = None
        self._index_cache: dict[int, WorkspaceVectorIndex] = {}
        self._index_lock = threading.Lock()

    def configure(self, app) -> None:
        if self._engine is not None:
            return
        with self._init_lock:
            if self._engine is not None:
                return
            database_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
            if not database_uri:
                raise RuntimeError("SQLALCHEMY_DATABASE_URI is required for enterprise platform.")
            connect_args = {"check_same_thread": False} if database_uri.startswith("sqlite") else {}
            self._engine = create_engine(database_uri, future=True, pool_pre_ping=True, connect_args=connect_args)
            self._session_factory = scoped_session(
                sessionmaker(bind=self._engine, autocommit=False, autoflush=False, expire_on_commit=False, future=True)
            )
            self._app = app
            self._encryption_service = Fernet(self._derive_fernet_key(app))
            # Keep legacy key for backward-compatible decryption of old data
            legacy_key = self._derive_legacy_fernet_key(app)
            self._legacy_encryption_service = Fernet(legacy_key) if legacy_key else None
            Base.metadata.create_all(self._engine)

    def _derive_fernet_key(self, app) -> bytes:
        raw_key = os.environ.get("ENTERPRISE_DATA_KEY") or app.config.get("SECRET_KEY")
        if not raw_key:
            raise RuntimeError(
                "Enterprise encryption key is not configured. "
                "Set the ENTERPRISE_DATA_KEY environment variable or ensure "
                "SECRET_KEY is present in the Flask app configuration."
            )
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
        from cryptography.hazmat.primitives import hashes
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"codeclone-enterprise-v1",
            info=b"fernet-encryption-key",
        )
        derived = hkdf.derive(raw_key.encode("utf-8"))
        return base64.urlsafe_b64encode(derived)

    def _derive_legacy_fernet_key(self, app) -> bytes:
        """Derive the old SHA-256-only key for backward compatibility."""
        raw_key = os.environ.get("ENTERPRISE_DATA_KEY") or app.config.get("SECRET_KEY")
        if not raw_key:
            return b""
        digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    def session(self):
        if self._session_factory is None:
            raise RuntimeError("Enterprise storage is not configured.")
        return self._session_factory()

    def remove(self) -> None:
        if self._session_factory is not None:
            self._session_factory.remove()

    def encrypt_text(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return self._encryption_service.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt_text(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        raw = value.encode("utf-8")
        # Try current key first
        try:
            return self._encryption_service.decrypt(raw).decode("utf-8")
        except InvalidToken:
            pass
        # Fall back to legacy key for data encrypted before HKDF migration
        if self._legacy_encryption_service is not None:
            try:
                return self._legacy_encryption_service.decrypt(raw).decode("utf-8")
            except InvalidToken:
                pass
        raise EnterpriseError(500, "Encrypted enterprise payload cannot be decrypted.", code="invalid_encryption_payload")

    def invalidate_workspace_index(self, workspace_id: int) -> None:
        with self._index_lock:
            self._index_cache.pop(workspace_id, None)

    def get_workspace_index(self, db_session, workspace_id: int) -> WorkspaceVectorIndex:
        from enterprise_platform.utils import deserialize_vector

        version_marker = db_session.execute(
            select(func.coalesce(func.max(CodeArtifact.id), 0), func.count(CodeArtifact.id)).where(CodeArtifact.workspace_id == workspace_id)
        ).one()
        marker = (int(version_marker[0] or 0), int(version_marker[1] or 0))
        with self._index_lock:
            cached = self._index_cache.get(workspace_id)
            if cached and cached.version_marker == marker:
                return cached
        rows = db_session.execute(
            select(
                CodeArtifact.id,
                CodeArtifact.repository_id,
                CodeArtifact.snapshot_id,
                CodeArtifact.language_family,
                CodeArtifact.embedding_vector,
                CodeArtifact.embedding_dim,
            ).where(CodeArtifact.workspace_id == workspace_id)
        ).all()
        artifact_ids: list[int] = []
        repository_ids: list[int] = []
        snapshot_ids: list[int] = []
        language_families: list[str] = []
        vectors: list[np.ndarray] = []
        for row in rows:
            artifact_ids.append(int(row.id))
            repository_ids.append(int(row.repository_id))
            snapshot_ids.append(int(row.snapshot_id))
            language_families.append(row.language_family)
            vectors.append(deserialize_vector(row.embedding_vector, int(row.embedding_dim)))
        matrix = np.vstack(vectors).astype(np.float32) if vectors else np.zeros((0, EMBEDDING_DIMENSION), dtype=np.float32)
        index = WorkspaceVectorIndex(artifact_ids, repository_ids, snapshot_ids, language_families, matrix, marker)
        with self._index_lock:
            self._index_cache[workspace_id] = index
        return index


storage = EnterpriseStorage()
scan_executor = None
scan_executor_lock = threading.Lock()


def get_scan_executor():
    global scan_executor
    if scan_executor is not None:
        return scan_executor
    with scan_executor_lock:
        if scan_executor is None:
            from concurrent.futures import ThreadPoolExecutor

            scan_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="enterprise-scan")
    return scan_executor
