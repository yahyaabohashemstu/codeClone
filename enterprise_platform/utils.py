from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
from collections import Counter
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import numpy as np
from flask import request, session
from flask_login import current_user
from sqlalchemy import select

from enterprise_platform.models import *

def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def loads(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default
    return parsed if isinstance(parsed, type(default)) else default


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return cleaned or secrets.token_hex(4)


def path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_provider(value: str) -> str:
    provider = (value or "").strip().lower()
    if provider not in {"github", "gitlab", "local"}:
        raise EnterpriseError(400, "Unsupported repository provider.", code="unsupported_provider")
    return provider


def ensure_region_supported(region: Optional[str]) -> str:
    normalized = (region or DEFAULT_STORAGE_REGION).strip().lower()
    if normalized not in SUPPORTED_REGIONS:
        raise EnterpriseError(400, "Unsupported storage region.", code="unsupported_region")
    return normalized


def request_request_id() -> str:
    return (request.headers.get("X-Request-Id") or request.headers.get("X-Correlation-Id") or secrets.token_hex(12)).strip()


def sanitize_for_storage(text: str, pii_redaction_enabled: bool) -> str:
    result = text
    if pii_redaction_enabled:
        for pattern, replacement in PII_PATTERNS:
            result = pattern.sub(replacement, result)
    return result


def serialize_vector(vector: np.ndarray) -> str:
    array = np.asarray(vector, dtype=np.float32)
    return base64.b64encode(array.tobytes()).decode("ascii")


def deserialize_vector(payload: str, dim: int) -> np.ndarray:
    raw = base64.b64decode(payload.encode("ascii"))
    vector = np.frombuffer(raw, dtype=np.float32)
    if vector.size != dim:
        raise EnterpriseError(500, "Stored vector dimension mismatch.", code="invalid_vector_payload")
    return vector


def cosine_similarity(vector_a: np.ndarray, vector_b: np.ndarray) -> float:
    if vector_a.size == 0 or vector_b.size == 0:
        return 0.0
    denominator = float(np.linalg.norm(vector_a) * np.linalg.norm(vector_b))
    if denominator <= 0:
        return 0.0
    return float(np.clip(np.dot(vector_a, vector_b) / denominator, -1.0, 1.0))


def strip_comments(source: str, language: str) -> str:
    text = source
    if language == "python":
        text = re.sub(r"(?m)#.*$", "", text)
        text = re.sub(r"(?s)\"\"\".*?\"\"\"", " STRBLOCK ", text)
        text = re.sub(r"(?s)'''.*?'''", " STRBLOCK ", text)
    else:
        text = re.sub(r"(?s)/\*.*?\*/", " ", text)
        text = re.sub(r"(?m)//.*$", "", text)
    return text


def normalize_identifier(token: str) -> str:
    lowered = token.lower()
    if lowered in CANONICAL_KEYWORD_MAP:
        return CANONICAL_KEYWORD_MAP[lowered]
    if token.isdigit():
        return "NUM"
    if re.fullmatch(r"[A-Z_][A-Z0-9_]*", token):
        return "CONST_ID"
    if re.fullmatch(r"[a-z_][a-z0-9_]*", token):
        return "ID"
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token):
        return "MIXED_ID"
    return token


def canonicalize_source(source: str, language: str) -> tuple[str, list[str]]:
    stripped = strip_comments(source, language)
    stripped = re.sub(r"(?s)(\"([^\"\\\\]|\\\\.)*\"|'([^'\\\\]|\\\\.)*')", " STR ", stripped)
    stripped = re.sub(r"\b\d+(?:\.\d+)?\b", " NUM ", stripped)
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|=>|->|::|&&|\|\||[{}()\[\];,.:+\-*/%<>=]", stripped)
    normalized = [normalize_identifier(token) for token in tokens]
    return " ".join(normalized), normalized


def feature_hash_vector(tokens: list[str], dim: int = EMBEDDING_DIMENSION) -> np.ndarray:
    vector = np.zeros(dim, dtype=np.float32)
    if not tokens:
        return vector
    features: list[str] = []
    features.extend(tokens)
    for width in (2, 3, 4):
        if len(tokens) >= width:
            features.extend(" ".join(tokens[index : index + width]) for index in range(0, len(tokens) - width + 1))
    token_counts = Counter(features)
    for feature, count in token_counts.items():
        digest = hashlib.sha1(feature.encode("utf-8")).digest()
        position = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[position] += float(count) * sign
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector /= norm
    return vector


def token_overlap_score(tokens_a: list[str], tokens_b: list[str]) -> float:
    if not tokens_a or not tokens_b:
        return 0.0
    counts_a = Counter(tokens_a)
    counts_b = Counter(tokens_b)
    overlap = sum(min(counts_a[token], counts_b[token]) for token in set(counts_a) | set(counts_b))
    denominator = len(tokens_a) + len(tokens_b)
    return (2.0 * overlap) / denominator if denominator else 0.0


def structural_score(extraction_a: ArtifactExtraction, extraction_b: ArtifactExtraction, tokens_a: list[str], tokens_b: list[str]) -> float:
    kind_score = 1.0 if extraction_a.symbol_kind == extraction_b.symbol_kind else 0.55
    length_ratio = min(len(tokens_a), len(tokens_b)) / max(len(tokens_a), len(tokens_b)) if tokens_a and tokens_b else 0.0
    span_a = max(1, extraction_a.end_line - extraction_a.start_line + 1)
    span_b = max(1, extraction_b.end_line - extraction_b.start_line + 1)
    span_ratio = min(span_a, span_b) / max(span_a, span_b)
    return float((0.45 * kind_score) + (0.35 * length_ratio) + (0.20 * span_ratio))


def classify_clone(raw_hash_equal: bool, canonical_hash_equal: bool, is_cross_language: bool, overall: float, token_score_value: float, semantic_score_value: float) -> str:
    if raw_hash_equal:
        return "type_1_exact"
    if canonical_hash_equal and not is_cross_language:
        return "type_2_renamed"
    if is_cross_language and semantic_score_value >= 0.92:
        return "type_4_cross_language_semantic"
    if token_score_value >= 0.88:
        return "type_3_structural"
    if overall >= 0.84:
        return "semantic_clone"
    return "suspicious_similarity"


def compute_similarity_bundle(extraction_a: ArtifactExtraction, extraction_b: ArtifactExtraction) -> dict[str, Any]:
    canonical_a, tokens_a = canonicalize_source(extraction_a.source_text, extraction_a.language)
    canonical_b, tokens_b = canonicalize_source(extraction_b.source_text, extraction_b.language)
    vector_a = feature_hash_vector(tokens_a)
    vector_b = feature_hash_vector(tokens_b)
    semantic = max(0.0, cosine_similarity(vector_a, vector_b))
    token_score_value = token_overlap_score(tokens_a, tokens_b)
    structure = structural_score(extraction_a, extraction_b, tokens_a, tokens_b)
    is_cross_language = LANGUAGE_FAMILY.get(extraction_a.language, "generic") != LANGUAGE_FAMILY.get(extraction_b.language, "generic") and extraction_a.language != extraction_b.language
    overall = (0.55 * semantic) + (0.25 * token_score_value) + (0.20 * structure)
    raw_hash_equal = sha256_hex(extraction_a.source_text) == sha256_hex(extraction_b.source_text)
    canonical_hash_equal = sha256_hex(canonical_a) == sha256_hex(canonical_b)
    return {
        "canonical_a": canonical_a,
        "canonical_b": canonical_b,
        "tokens_a": tokens_a,
        "tokens_b": tokens_b,
        "vector_a": vector_a,
        "vector_b": vector_b,
        "semantic_score": semantic,
        "token_score": token_score_value,
        "structural_score": structure,
        "similarity_score": overall,
        "is_cross_language": is_cross_language,
        "clone_type": classify_clone(raw_hash_equal, canonical_hash_equal, is_cross_language, overall, token_score_value, semantic),
        "raw_hash_equal": raw_hash_equal,
        "canonical_hash_equal": canonical_hash_equal,
    }


def detect_language(file_path: Path) -> Optional[str]:
    return SUPPORTED_EXTENSIONS.get(file_path.suffix.lower())


def extract_python_blocks(logical_path: str, source: str) -> list[ArtifactExtraction]:
    lines = source.splitlines()
    artifacts: list[ArtifactExtraction] = []
    headers: list[tuple[int, int, str, str]] = []
    for index, line in enumerate(lines):
        match = re.match(r"^(\s*)(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", line)
        if not match:
            continue
        indent = len(match.group(1).replace("\t", "    "))
        kind = "function" if match.group(2) == "def" else "class"
        headers.append((index, indent, kind, match.group(3)))
    for position, (start_index, indent, kind, symbol_name) in enumerate(headers):
        end_index = len(lines)
        for next_start, next_indent, _, _ in headers[position + 1 :]:
            if next_indent <= indent:
                end_index = next_start
                break
        block_text = "\n".join(lines[start_index:end_index]).strip("\n")
        if block_text.strip():
            artifacts.append(
                ArtifactExtraction(
                    logical_path=logical_path,
                    language="python",
                    symbol_kind=kind,
                    source_text=block_text,
                    start_line=start_index + 1,
                    end_line=max(start_index + 1, end_index),
                    symbol_name=symbol_name,
                    symbol_qualified_name=f"{logical_path}:{symbol_name}",
                )
            )
    if not artifacts:
        artifacts.append(ArtifactExtraction(logical_path, "python", "file", source, 1, max(1, len(lines)), Path(logical_path).name, logical_path))
    return artifacts


def extract_brace_blocks(logical_path: str, source: str, language: str) -> list[ArtifactExtraction]:
    lines = source.splitlines()
    artifacts: list[ArtifactExtraction] = []
    patterns = [
        re.compile(r"^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)"),
        re.compile(r"^\s*(?:public|private|protected|static|\s)*\s*(?:async\s+)?(?:[A-Za-z_<>\[\],?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{"),
        re.compile(r"^\s*(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{"),
    ]
    index = 0
    while index < len(lines):
        line = lines[index]
        symbol_name = None
        symbol_kind = "function"
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                symbol_name = match.group(1)
                if "class" in line:
                    symbol_kind = "class"
                elif "interface" in line:
                    symbol_kind = "interface"
                elif "enum" in line:
                    symbol_kind = "enum"
                break
        if not symbol_name:
            index += 1
            continue
        brace_balance = line.count("{") - line.count("}")
        end_index = index + 1
        while end_index < len(lines) and brace_balance > 0:
            brace_balance += lines[end_index].count("{") - lines[end_index].count("}")
            end_index += 1
        block_text = "\n".join(lines[index:end_index]).strip("\n")
        if block_text:
            artifacts.append(
                ArtifactExtraction(
                    logical_path=logical_path,
                    language=language,
                    symbol_kind=symbol_kind,
                    source_text=block_text,
                    start_line=index + 1,
                    end_line=max(index + 1, end_index),
                    symbol_name=symbol_name,
                    symbol_qualified_name=f"{logical_path}:{symbol_name}",
                )
            )
        index = max(end_index, index + 1)
    if not artifacts:
        artifacts.append(ArtifactExtraction(logical_path, language, "file", source, 1, max(1, len(lines)), Path(logical_path).name, logical_path))
    return artifacts


def extract_artifacts(logical_path: str, language: str, source: str) -> list[ArtifactExtraction]:
    if language == "python":
        return extract_python_blocks(logical_path, source)
    return extract_brace_blocks(logical_path, source, language)


def read_supported_repository_files(root_path: Path) -> list[tuple[str, str, str]]:
    files: list[tuple[str, str, str]] = []
    for directory, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [
            name
            for name in dirnames
            if name not in IGNORED_DIRECTORIES and not (Path(directory) / name).is_symlink()
        ]
        for filename in filenames:
            candidate = Path(directory) / filename
            if candidate.is_symlink():
                continue
            language = detect_language(candidate)
            if not language:
                continue
            try:
                size_bytes = candidate.stat().st_size
            except OSError:
                continue
            if size_bytes <= 0 or size_bytes > MAX_SOURCE_FILE_BYTES:
                continue
            try:
                source = candidate.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                try:
                    source = candidate.read_text(encoding="utf-8-sig")
                except UnicodeDecodeError:
                    try:
                        source = candidate.read_text(encoding="latin-1")
                    except OSError:
                        continue
            except OSError:
                continue
            relative_path = candidate.relative_to(root_path).as_posix()
            files.append((relative_path, language, source))
    return files


def verify_hmac_signature(secret: str, payload: bytes, signature_header: str, algorithm: str) -> bool:
    if not secret or not signature_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), payload, getattr(hashlib, algorithm)).hexdigest()
    provided = signature_header.strip()
    if "=" in provided:
        _, provided = provided.split("=", 1)
    return hmac.compare_digest(expected, provided)


def ensure_enterprise_csrf_for_session_auth() -> None:
    if request.method not in UNSAFE_METHODS:
        return
    sent_token = (request.headers.get("X-CSRF-Token") or "").strip() or (request.form.get("csrf_token") or "").strip()
    expected_token = (session.get("_csrf_token") or "").strip()
    if not sent_token or not expected_token or not hmac.compare_digest(sent_token, expected_token):
        raise EnterpriseError(400, "Invalid CSRF token.", code="invalid_csrf")


def api_key_from_request() -> Optional[str]:
    bearer = (request.headers.get("Authorization") or "").strip()
    if bearer.lower().startswith("bearer "):
        return bearer.split(" ", 1)[1].strip()
    return (request.headers.get("X-API-Key") or "").strip() or None


def parse_api_key(raw_token: str) -> tuple[str, str]:
    if not raw_token.startswith("epk_"):
        raise EnterpriseError(401, "Invalid API key format.", code="invalid_api_key")
    pieces = raw_token.split("_", 2)
    if len(pieces) != 3 or not pieces[1] or not pieces[2]:
        raise EnterpriseError(401, "Invalid API key format.", code="invalid_api_key")
    return pieces[1], pieces[2]


def resolve_actor(db_session, require_authenticated: bool = True) -> dict[str, Any]:
    raw_api_key = api_key_from_request()
    if raw_api_key:
        prefix, secret = parse_api_key(raw_api_key)
        credential = db_session.execute(
            select(ApiCredential).where(ApiCredential.token_prefix == prefix, ApiCredential.revoked_at.is_(None))
        ).scalar_one_or_none()
        if not credential:
            raise EnterpriseError(401, "Invalid API key.", code="invalid_api_key")
        if credential.expires_at and credential.expires_at <= utcnow():
            raise EnterpriseError(401, "Expired API key.", code="expired_api_key")
        calculated_hash = sha256_hex(f"{prefix}:{secret}")
        if not hmac.compare_digest(credential.token_hash, calculated_hash):
            raise EnterpriseError(401, "Invalid API key.", code="invalid_api_key")
        return {
            "kind": "api_key",
            "legacy_user_id": credential.created_by_legacy_user_id,
            "workspace_id": credential.workspace_id,
            "organization_id": credential.organization_id,
            "scopes": loads(credential.scopes_json, []),
            "is_admin": False,
        }
    if getattr(current_user, "is_authenticated", False):
        ensure_enterprise_csrf_for_session_auth()
        return {
            "kind": "user",
            "legacy_user_id": int(current_user.id),
            "workspace_id": None,
            "organization_id": None,
            "scopes": ["*"],
            "is_admin": bool(getattr(current_user, "is_admin", False)),
        }
    if require_authenticated:
        raise EnterpriseError(401, "Authentication required.", code="authentication_required")
    return {"kind": "anonymous", "legacy_user_id": None, "workspace_id": None, "organization_id": None, "scopes": [], "is_admin": False}


def actor_has_scope(actor: dict[str, Any], scope: str) -> bool:
    scopes = actor.get("scopes", [])
    if "*" in scopes:
        return True
    return scope in scopes


def require_enterprise_admin(actor: dict[str, Any], message: str = "Admin access required.") -> None:
    if actor.get("is_admin"):
        return
    raise EnterpriseError(403, message, code="admin_access_required")


def actor_workspace_role(db_session, workspace_id: int, actor: dict[str, Any]) -> Optional[str]:
    if actor.get("is_admin"):
        return "owner"
    if actor.get("kind") == "api_key":
        if actor_has_scope(actor, f"workspace:{workspace_id}:write"):
            return "admin"
        if actor_has_scope(actor, f"workspace:{workspace_id}:read"):
            return "student"
        return None
    membership = load_workspace_membership(db_session, workspace_id, actor.get("legacy_user_id"))
    return membership.role if membership else None


def can_view_workspace_operational_details(db_session, workspace_id: int, actor: dict[str, Any]) -> bool:
    role = actor_workspace_role(db_session, workspace_id, actor)
    return ROLE_ORDER.get(role or "", 0) >= ROLE_ORDER["reviewer"]


def configured_local_repository_roots() -> list[Path]:
    raw_value = (os.environ.get("ENTERPRISE_LOCAL_REPOSITORY_ROOTS") or "").strip()
    if not raw_value:
        return []
    roots: list[Path] = []
    for value in raw_value.split(os.pathsep):
        cleaned = value.strip()
        if cleaned:
            roots.append(Path(cleaned).expanduser().resolve(strict=False))
    return roots


def normalize_local_repository_path(raw_path: str, require_exists: bool = True) -> str:
    cleaned = (raw_path or "").strip()
    if not cleaned:
        raise EnterpriseError(400, "Local repository path is required.", code="repository_path_required")
    allowed_roots = configured_local_repository_roots()
    if not allowed_roots:
        raise EnterpriseError(
            403,
            "Local repository paths are disabled. Configure ENTERPRISE_LOCAL_REPOSITORY_ROOTS to allow trusted roots.",
            code="local_repositories_disabled",
        )
    try:
        resolved_path = Path(cleaned).expanduser().resolve(strict=require_exists)
    except FileNotFoundError as exc:
        raise EnterpriseError(404, "Configured local repository path does not exist.", code="repository_path_not_found") from exc
    except OSError as exc:
        raise EnterpriseError(400, "Invalid local repository path.", code="repository_path_invalid") from exc
    if require_exists and not resolved_path.is_dir():
        raise EnterpriseError(400, "Configured local repository path must be a directory.", code="repository_path_not_directory")
    for root_path in allowed_roots:
        if path_is_within(resolved_path, root_path):
            return str(resolved_path)
    raise EnterpriseError(
        403,
        "Local repository path is outside the configured ENTERPRISE_LOCAL_REPOSITORY_ROOTS allowlist.",
        code="repository_path_not_allowed",
    )


def configured_allowed_git_hosts() -> set[str]:
    raw_value = (os.environ.get("ENTERPRISE_ALLOWED_GIT_HOSTS") or "").strip()
    if not raw_value:
        return set()
    return {item.strip().lower() for item in raw_value.split(",") if item.strip()}


def _clone_host_resolves_publicly(hostname: str) -> None:
    try:
        results = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise EnterpriseError(400, "Clone URL hostname could not be resolved.", code="clone_url_unresolvable") from exc
    ip_values = {result[4][0] for result in results if len(result) >= 5 and result[4]}
    if not ip_values:
        raise EnterpriseError(400, "Clone URL hostname could not be resolved.", code="clone_url_unresolvable")
    for ip_value in ip_values:
        ip_address = ipaddress.ip_address(ip_value)
        if not ip_address.is_global:
            raise EnterpriseError(
                403,
                "Clone URL must resolve to a public host. Configure ENTERPRISE_ALLOWED_GIT_HOSTS only for explicitly trusted Git servers.",
                code="clone_url_private_host",
            )


def normalize_clone_url(raw_url: str) -> str:
    cleaned = (raw_url or "").strip()
    if not cleaned:
        raise EnterpriseError(400, "Clone URL is required.", code="clone_url_required")
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() != "https":
        raise EnterpriseError(400, "Clone URL must use HTTPS.", code="clone_url_scheme_not_allowed")
    if parsed.username or parsed.password:
        raise EnterpriseError(400, "Clone URL must not embed credentials.", code="clone_url_embeds_credentials")
    if parsed.query or parsed.fragment:
        raise EnterpriseError(400, "Clone URL must not include query parameters or fragments.", code="clone_url_invalid")
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise EnterpriseError(400, "Clone URL must include a hostname.", code="clone_url_missing_host")
    allowed_hosts = configured_allowed_git_hosts()
    if allowed_hosts:
        if hostname not in allowed_hosts:
            raise EnterpriseError(403, "Clone URL host is not allowlisted.", code="clone_url_host_not_allowed")
    else:
        _clone_host_resolves_publicly(hostname)
    return cleaned


def load_workspace_membership(db_session, workspace_id: int, legacy_user_id: Optional[int]) -> Optional[WorkspaceMembership]:
    if not legacy_user_id:
        return None
    return db_session.execute(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.legacy_user_id == legacy_user_id,
            WorkspaceMembership.is_active.is_(True),
        )
    ).scalar_one_or_none()


def require_workspace_access(db_session, workspace_id: int, actor: dict[str, Any], minimum_role: str = "student") -> Workspace:
    workspace = db_session.get(Workspace, workspace_id)
    if not workspace or workspace.archived_at is not None:
        raise EnterpriseError(404, "Workspace not found.", code="workspace_not_found")
    if actor.get("is_admin"):
        return workspace
    if actor["kind"] == "api_key":
        scoped_workspace = actor.get("workspace_id")
        if scoped_workspace and int(scoped_workspace) != int(workspace_id):
            raise EnterpriseError(403, "API key is not scoped to this workspace.", code="workspace_scope_violation")
        if minimum_role in {"reviewer", "manager", "admin", "owner"} and not actor_has_scope(actor, f"workspace:{workspace_id}:write"):
            raise EnterpriseError(403, "API key lacks write access for this workspace.", code="missing_scope")
        if minimum_role == "student" and not (actor_has_scope(actor, f"workspace:{workspace_id}:read") or actor_has_scope(actor, f"workspace:{workspace_id}:write")):
            raise EnterpriseError(403, "API key lacks read access for this workspace.", code="missing_scope")
        return workspace
    membership = load_workspace_membership(db_session, workspace_id, actor.get("legacy_user_id"))
    if not membership:
        raise EnterpriseError(403, "You do not belong to this workspace.", code="workspace_membership_required")
    if ROLE_ORDER.get(membership.role, 0) < ROLE_ORDER.get(minimum_role, 0):
        raise EnterpriseError(403, "Insufficient workspace permissions.", code="insufficient_role")
    membership.last_active_at = utcnow()
    return workspace


def issue_api_key(prefix_length: int = 8) -> tuple[str, str, str]:
    prefix = secrets.token_hex(prefix_length // 2)
    secret = secrets.token_urlsafe(32)
    token = f"epk_{prefix}_{secret}"
    token_hash = sha256_hex(f"{prefix}:{secret}")
    return prefix, token_hash, token


def issue_webhook_secret() -> tuple[str, str, str]:
    hint = secrets.token_hex(4)
    secret = secrets.token_urlsafe(32)
    secret_hash = sha256_hex(f"{hint}:{secret}")
    return hint, secret_hash, f"{hint}.{secret}"


def verify_webhook_secret(stored_hint: Optional[str], stored_hash: Optional[str], provided_secret: str) -> bool:
    if not stored_hint or not stored_hash or not provided_secret:
        return False
    calculated = sha256_hex(f"{stored_hint}:{provided_secret}")
    return hmac.compare_digest(calculated, stored_hash)


def audit(db_session, actor: dict[str, Any], action: str, entity_type: str, entity_id: Any, workspace_id: Optional[int], metadata: Optional[dict[str, Any]] = None) -> None:
    ip_value = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    user_agent = request.headers.get("User-Agent", "")
    db_session.add(
        AuditLog(
            workspace_id=workspace_id,
            actor_legacy_user_id=actor.get("legacy_user_id"),
            actor_type=actor.get("kind", "system"),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            request_id=request_request_id(),
            ip_hash=sha256_hex(ip_value) if ip_value else None,
            user_agent_hash=sha256_hex(user_agent) if user_agent else None,
            metadata_json=dumps(metadata or {}),
            created_at=utcnow(),
        )
    )


@contextmanager
def session_scope():
    db_session = storage.session()
    try:
        yield db_session
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise
    finally:
        db_session.close()


def require_json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise EnterpriseError(400, "JSON request body is required.", code="invalid_json_body")
    return payload
