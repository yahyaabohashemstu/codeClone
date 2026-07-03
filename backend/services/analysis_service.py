"""
Main analysis orchestrator service.

Coordinates the code-clone analysis engine, AI text generation, charting,
caching, persistence, and progress reporting.  This is the primary
business-logic layer that API routes call into.

Dependencies:
  - ``backend.engine.*`` -- pure analysis engine (no Flask)
  - ``backend.extensions`` -- SQLAlchemy ``db``
  - ``backend.models`` -- ``User``, ``Analysis``
  - ``backend.services.progress_service`` -- progress tracking
  - ``backend.services.cache_service`` -- LRU caching
  - ``backend.services.ai_service`` -- Mistral text generation
  - ``backend.engine.similarity`` -- chart and normalization helpers
  - ``backend.utils.serialization`` -- JSON and type-guard helpers
"""

from __future__ import annotations

import base64
import datetime
import json
import logging
import re

import markdown2
import networkx as nx

from backend.engine.clone_detector import (
    SUPPORTED_LANGUAGES,
    CloneDetector,
    get_detector,
)
from backend.engine.code_smell import CodeSmellAnalyzer
from backend.engine.similarity import (
    build_chart_url_from_similarity_items,
    build_similarity_sections,
    clone_pairs_from_items,
    create_similarity_chart,
    ensure_graph_payload,
    graph_payload_has_content,
    normalize_clone_items,
    normalize_similarity_items,
    similarity_pairs_from_items,
)
from backend.extensions import db
from backend.models.analysis import Analysis
from backend.services.ai_service import generate_textual_analysis_ai
from backend.services.cache_service import cache_analysis_context_for_user
from backend.services.progress_service import set_current_user_progress
from backend.utils.serialization import (
    derive_source_label,
    ensure_dict,
    ensure_list,
    json_dumps_compact,
    json_loads_safe,
    normalize_datetime,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SNAPSHOT_SCHEMA_VERSION = 1

# SUPPORTED_LANGUAGES and the (lazy) detector pool are owned by the engine —
# a second copy here used to drift out of sync and doubled per-process memory.
# Both are re-exported via the import above for backwards compatibility.

# Regex for stripping dangerous URL protocols from generated HTML.
_UNSAFE_URL_RE = re.compile(
    r'(href|src)\s*=\s*["\']?\s*(javascript|data|vbscript)\s*:[^"\'>]*["\']?',
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def stringify_report_text(value, fallback: str = "") -> str:
    """Coerce a code-quality report value into a plain string.

    Handles ``None``, ``str``, ``dict`` (with ``error`` / ``message``
    extraction), and ``list`` shapes.
    """
    if value is None:
        return fallback

    if isinstance(value, str):
        return value if value.strip() else fallback

    if isinstance(value, dict):
        preferred_message = (
            value.get("error")
            or value.get("message")
            or value.get("error_message")
        )
        if preferred_message:
            return f"Unable to generate quality report: {preferred_message}"
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except TypeError:
            return str(value)

    if isinstance(value, list):
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except TypeError:
            return str(value)

    return str(value)


def normalize_code_smell_payload(value) -> dict:
    """Ensure *value* is a ``{code1_analysis, code2_analysis}`` dict.

    Both values are coerced to strings via :func:`stringify_report_text`.
    """
    payload = ensure_dict(value, {"code1_analysis": "", "code2_analysis": ""})
    return {
        "code1_analysis": stringify_report_text(payload.get("code1_analysis"), ""),
        "code2_analysis": stringify_report_text(payload.get("code2_analysis"), ""),
    }


def render_analysis_markdown(text: str) -> str:
    """Render Markdown *text* to safe HTML.

    Uses ``markdown2`` with common extras and strips dangerous URL protocols
    that Markdown may generate from link targets.
    """
    if not text:
        return ""

    html = markdown2.markdown(
        text,
        safe_mode="escape",
        extras=[
            "fenced-code-blocks",
            "tables",
            "code-friendly",
            "break-on-newline",
            "cuddled-lists",
        ],
    )
    # Strip dangerous URL protocols.
    html = _UNSAFE_URL_RE.sub(r'\1="#"', html)
    return html


def parse_analysis_metrics(raw_metrics):
    """Parse a JSON metrics string into two metric dictionaries."""
    payload = json_loads_safe(raw_metrics, {})
    if not isinstance(payload, dict):
        return {}, {}

    metrics1 = payload.get("metrics1")
    metrics2 = payload.get("metrics2")
    if isinstance(metrics1, dict) or isinstance(metrics2, dict):
        return ensure_dict(metrics1), ensure_dict(metrics2)

    return payload, {}


# ---------------------------------------------------------------------------
# Core similarity analysis
# ---------------------------------------------------------------------------


def analyze_similarities(
    detector: CloneDetector,
    code1: str,
    code2: str,
    clean_code1: str | None = None,
    clean_code2: str | None = None,
    _bg_user_id: int | None = None,
) -> dict:
    """Run all similarity and clone-detection metrics on a code pair.

    Parameters
    ----------
    detector:
        A language-specific :class:`CloneDetector` instance.
    code1, code2:
        Raw source code strings.
    clean_code1, clean_code2:
        Optionally pre-cleaned (comments/whitespace removed) versions.
    _bg_user_id:
        When running in a background thread, the user ID for progress
        updates.

    Returns
    -------
    dict
        Metric results keyed by their standard names, or an ``{"error": ...}``
        dict on failure.
    """
    set_current_user_progress(
        "Similarity analysis: preprocessing", 5, user_id=_bg_user_id,
    )

    try:
        if clean_code1 is None:
            clean_code1 = detector.remove_comments_and_whitespace(code1)
        if clean_code2 is None:
            clean_code2 = detector.remove_comments_and_whitespace(code2)

        # Progress within this function spans 5–60: the orchestrator
        # (build_analysis_context) continues at 70/80/90/100, keeping the
        # user-visible progress bar monotonic.
        set_current_user_progress(
            "Similarity analysis: computing base similarity scores", 15,
            user_id=_bg_user_id,
        )
        text_sim = detector.text_similarity(code1, code2)
        token_sim = detector.token_similarity(code1, code2)
        token_sim_without_comments = detector.token_similarity(clean_code1, clean_code2)
        token_sim_with_order = detector.token_similarity(code1, code2, with_order=True)
        token_sim_with_order_without_comments = detector.token_similarity(
            clean_code1, clean_code2, with_order=True,
        )
        exact_clone_result = detector.is_exact_clone(code1, code2)
        # renamed_clone_similarity now returns the ordered token-type fingerprint
        # similarity (same as token_sim_with_order) rather than identifier Jaccard.
        # We reuse the already-computed value to avoid a redundant traversal.
        renamed_clone_sim = token_sim_with_order
        # Reuse already-computed component scores / cleaned sources so the
        # clone checks below do not re-parse both snippets from scratch.
        near_miss_clone_result = detector.near_miss_clone_similarity(
            code1, code2,
            _text_sim=text_sim,
            _token_sim=token_sim,
            _token_sim_without_comments=token_sim_without_comments,
        )
        parameterized_clone_result = detector.parameterized_clone_similarity(
            code1, code2, clean1=clean_code1, clean2=clean_code2,
        )
        function_clone_result = detector.function_clone_similarity(
            code1, code2, clean1=clean_code1, clean2=clean_code2,
        )
        non_contiguous_clone_result = detector.non_contiguous_clone_similarity(code1, code2)
        structural_clone_result = detector.structural_clone_similarity(code1, code2)
        reordered_clone_result = detector.reordered_clone_similarity(code1, code2)
        function_reordered_clone_result = detector.function_reordered_clone_similarity(
            code1, code2, clean1=clean_code1, clean2=clean_code2,
        )
        gapped_clone_result = detector.gapped_clone_similarity(code1, code2)
        intertwined_clone_result = detector.intertwined_clone_similarity(code1, code2)

        set_current_user_progress(
            "Similarity analysis: advanced clone metrics", 35,
            user_id=_bg_user_id,
        )
        graph_sim = detector.graph_similarity(code1, code2)

        # AI score must be computed before semantic_clone_result so we can
        # pass it in and avoid a second (expensive) forward pass through
        # UniXcoder.
        set_current_user_progress(
            "Similarity analysis: AI similarity scoring", 45,
            user_id=_bg_user_id,
        )
        # ``None`` means the embedding model is unavailable (degraded deploy):
        # the combined score renormalizes over the remaining signals, the
        # semantic flag is off, and the displayed metric reads 0.
        ai_raw = detector.ai_based_similarity(code1, code2)

        semantic_clone_result = (
            ai_raw is not None
            and detector.semantic_clone_similarity(code1, code2, ai_score=ai_raw)
        )

        set_current_user_progress(
            "Similarity analysis: combining metrics", 55,
            user_id=_bg_user_id,
        )
        # Pass pre-computed values so combined_similarity avoids recomputation.
        combined_similarity = detector.combined_similarity(
            code1, code2,
            _text_sim=text_sim,
            _token_sim=token_sim,
            _graph_sim=graph_sim,
            _renamed_sim=renamed_clone_sim,
            _ai_score=ai_raw,
        )

        set_current_user_progress(
            "Similarity analysis: finished calculations", 60,
            user_id=_bg_user_id,
        )
        return {
            "text_sim": text_sim,
            "token_sim": token_sim,
            "token_sim_without_comments": token_sim_without_comments,
            "token_sim_with_order": token_sim_with_order,
            "token_sim_with_order_without_comments": token_sim_with_order_without_comments,
            "exact_clone_result": exact_clone_result,
            "renamed_clone_sim": renamed_clone_sim,
            "near_miss_clone_result": near_miss_clone_result,
            "parameterized_clone_result": parameterized_clone_result,
            "function_clone_result": function_clone_result,
            "non_contiguous_clone_result": non_contiguous_clone_result,
            "structural_clone_result": structural_clone_result,
            "reordered_clone_result": reordered_clone_result,
            "function_reordered_clone_result": function_reordered_clone_result,
            "gapped_clone_result": gapped_clone_result,
            "intertwined_clone_result": intertwined_clone_result,
            "semantic_clone_result": semantic_clone_result,
            "graph_sim": graph_sim,
            "combined_similarity": combined_similarity,
            "ai_similarity_score": ai_raw if ai_raw is not None else 0.0,
        }
    except Exception as exc:
        logger.error("Error during similarity analysis: %s", exc, exc_info=True)
        return {"error": "An internal error occurred during similarity analysis."}


# ---------------------------------------------------------------------------
# Snapshot management
# ---------------------------------------------------------------------------


def build_analysis_snapshot(context: dict) -> dict:
    """Create a saveable JSON snapshot from a full analysis context.

    The snapshot captures enough data to fully reconstruct the results page
    without re-running the analysis.
    """
    code_smell = normalize_code_smell_payload(context.get("code_smell"))
    return {
        "snapshot_version": SNAPSHOT_SCHEMA_VERSION,
        "language": context.get("language"),
        "code1": context.get("code1") or "",
        "code2": context.get("code2") or "",
        "source_labels": ensure_dict(context.get("source_labels")),
        "similarity_items": normalize_similarity_items(context.get("similarity_items")),
        "clone_items": normalize_clone_items(context.get("clone_items")),
        "chart_url": context.get("chart_url"),
        "graph_json1": ensure_graph_payload(context.get("graph_json1")),
        "graph_json2": ensure_graph_payload(context.get("graph_json2")),
        "metrics1": ensure_dict(context.get("metrics1")),
        "metrics2": ensure_dict(context.get("metrics2")),
        "analysis_text": context.get("analysis_text") or "",
        "analysis_html": context.get("analysis_html") or "",
        "analysis_structured": context.get("analysis_structured"),
        "excel_analysis_results": ensure_list(context.get("excel_analysis_results")),
        "code_smell": code_smell,
        "similarities": None,
    }


def persist_snapshot_to_analysis_record(analysis: Analysis, context: dict) -> None:
    """Update an existing ``Analysis`` row with a fresh snapshot.

    Commits the transaction immediately.
    """
    analysis.metrics = json_dumps_compact({
        "metrics1": ensure_dict(context.get("metrics1")),
        "metrics2": ensure_dict(context.get("metrics2")),
    })
    analysis.analysis_text = context.get("analysis_text") or analysis.analysis_text
    analysis.snapshot_json = json_dumps_compact(build_analysis_snapshot(context))
    db.session.add(analysis)
    db.session.commit()


# ---------------------------------------------------------------------------
# Context restoration from saved analyses
# ---------------------------------------------------------------------------


def build_minimal_saved_analysis_context(
    analysis: Analysis,
    fallback_error: str | None = None,
) -> dict:
    """Build a minimal context dict from a persisted ``Analysis`` row.

    This is used when no snapshot is available or the snapshot lacks graph
    data.  It produces a lightweight view that omits clone-detection and
    graph information.
    """
    metrics1, metrics2 = parse_analysis_metrics(analysis.metrics)
    similarity_items: list[dict] = []
    if analysis.similarity is not None:
        similarity_items.append({
            "name": "Combined Similarity",
            "value": round(float(analysis.similarity), 1),
        })

    description_list1, description_list2 = build_similarity_sections(
        similarity_pairs_from_items(similarity_items),
        [],
    )

    analysis_text = analysis.analysis_text or ""
    context = {
        "language": analysis.language,
        "supported_languages": SUPPORTED_LANGUAGES,
        "code1": analysis.code1,
        "code2": analysis.code2,
        "source_labels": {
            "code1": derive_source_label(analysis.code1, "Source A"),
            "code2": derive_source_label(analysis.code2, "Source B"),
        },
        "description_list1": description_list1,
        "description_list2": description_list2,
        "similarity_items": similarity_items,
        "clone_items": [],
        "chart_url": build_chart_url_from_similarity_items(similarity_items),
        "graph_json1": [],
        "graph_json2": [],
        "metrics1": metrics1,
        "metrics2": metrics2,
        "analysis_text": analysis_text,
        "analysis_html": render_analysis_markdown(analysis_text),
        "analysis_structured": None,
        "excel_analysis_results": [],
        "code_smell": {
            "code1_analysis": (
                "Stored snapshot fallback view. "
                "Run a re-analysis to regenerate the full quality report."
            ),
            "code2_analysis": (
                "Stored snapshot fallback view. "
                "Run a re-analysis to regenerate the full quality report."
            ),
        },
        "similarities": None,
        "error_message": fallback_error,
        "has_results": True,
        "saved_analysis_id": analysis.id,
        "summary": serialize_history_summary(analysis),
    }

    # Cache for the current user if available.
    try:
        from flask_login import current_user
        cache_analysis_context_for_user(getattr(current_user, "id", None), context)
    except (ImportError, RuntimeError):
        pass

    return context


def build_analysis_context_from_snapshot(
    analysis: Analysis,
    snapshot_payload: dict,
) -> dict:
    """Reconstruct a full analysis context from a stored JSON snapshot."""
    similarity_items = normalize_similarity_items(snapshot_payload.get("similarity_items"))
    clone_items = normalize_clone_items(snapshot_payload.get("clone_items"))
    description_list1, description_list2 = build_similarity_sections(
        similarity_pairs_from_items(similarity_items),
        clone_pairs_from_items(clone_items),
    )

    legacy_metrics1, legacy_metrics2 = parse_analysis_metrics(analysis.metrics)
    metrics1 = ensure_dict(snapshot_payload.get("metrics1")) or legacy_metrics1
    metrics2 = ensure_dict(snapshot_payload.get("metrics2")) or legacy_metrics2
    analysis_text = snapshot_payload.get("analysis_text") or analysis.analysis_text or ""
    source_labels = ensure_dict(snapshot_payload.get("source_labels"))
    code_smell = normalize_code_smell_payload(snapshot_payload.get("code_smell"))

    context = {
        "language": snapshot_payload.get("language") or analysis.language,
        "supported_languages": SUPPORTED_LANGUAGES,
        "code1": snapshot_payload.get("code1") or analysis.code1,
        "code2": snapshot_payload.get("code2") or analysis.code2,
        "source_labels": {
            "code1": (
                source_labels.get("code1")
                or derive_source_label(
                    snapshot_payload.get("code1") or analysis.code1, "Source A",
                )
            ),
            "code2": (
                source_labels.get("code2")
                or derive_source_label(
                    snapshot_payload.get("code2") or analysis.code2, "Source B",
                )
            ),
        },
        "description_list1": description_list1,
        "description_list2": description_list2,
        "similarity_items": similarity_items,
        "clone_items": clone_items,
        "chart_url": (
            snapshot_payload.get("chart_url")
            or build_chart_url_from_similarity_items(similarity_items)
        ),
        "graph_json1": ensure_graph_payload(snapshot_payload.get("graph_json1")),
        "graph_json2": ensure_graph_payload(snapshot_payload.get("graph_json2")),
        "metrics1": metrics1,
        "metrics2": metrics2,
        "analysis_text": analysis_text,
        "analysis_html": render_analysis_markdown(analysis_text),
        "analysis_structured": snapshot_payload.get("analysis_structured"),
        "excel_analysis_results": ensure_list(
            snapshot_payload.get("excel_analysis_results")
        ),
        "code_smell": code_smell,
        "similarities": None,
        "error_message": None,
        "has_results": True,
        "saved_analysis_id": analysis.id,
        "summary": serialize_history_summary(analysis),
    }

    try:
        from flask_login import current_user
        cache_analysis_context_for_user(getattr(current_user, "id", None), context)
    except (ImportError, RuntimeError):
        pass

    return context


# ---------------------------------------------------------------------------
# Main analysis pipeline
# ---------------------------------------------------------------------------


def build_analysis_context(
    code1: str,
    code2: str,
    language: str,
    persist_analysis: bool,
    analysis_text_override: str | None = None,
    snapshot_target_analysis: Analysis | None = None,
    _bg_user_id: int | None = None,
) -> dict:
    """Run the full analysis pipeline and return a context dict.

    This is the **main entry-point** called by API routes and background
    tasks.  It orchestrates:

    1. Language validation and input checks.
    2. Comment stripping and similarity analysis.
    3. Code-quality metrics.
    4. Code-smell analysis (Python only).
    5. Chart generation.
    6. Graph data export.
    7. AI text generation.
    8. (Optional) Persistence to the ``Analysis`` table.
    9. Caching.

    Parameters
    ----------
    code1, code2:
        Source code strings to compare.
    language:
        Programming language identifier (must be in ``SUPPORTED_LANGUAGES``).
    persist_analysis:
        Whether to save a new ``Analysis`` row.
    analysis_text_override:
        When provided, skip AI generation and use this text instead (used
        when rebuilding a snapshot from a saved analysis).
    snapshot_target_analysis:
        When provided (and *persist_analysis* is ``False``), the snapshot is
        written to this existing ``Analysis`` row instead of creating a new
        one.
    _bg_user_id:
        User ID for progress tracking in background threads.
    """
    set_current_user_progress("Starting analysis", 0, user_id=_bg_user_id)
    detector = get_detector(language) if language in SUPPORTED_LANGUAGES else None
    if not detector:
        set_current_user_progress("Unsupported language", 0, user_id=_bg_user_id)
        return {
            "language": language,
            "code1": code1,
            "code2": code2,
            "error_message": "Unsupported language selected.",
            "has_results": False,
        }

    if not code1 or not code2:
        return {
            "language": language,
            "code1": code1,
            "code2": code2,
            "error_message": "Please provide both code inputs before running the analysis.",
            "has_results": False,
        }

    # ── Similarity analysis ────────────────────────────────────────────
    try:
        clean_code1 = detector.remove_comments_and_whitespace(code1)
        clean_code2 = detector.remove_comments_and_whitespace(code2)
        similarities = analyze_similarities(
            detector, code1, code2, clean_code1, clean_code2,
            _bg_user_id=_bg_user_id,
        )
    except Exception as exc:
        set_current_user_progress("Error during analysis", 0, user_id=_bg_user_id)
        logger.error("Analysis failed: %s", exc, exc_info=True)
        return {
            "language": language,
            "code1": code1,
            "code2": code2,
            "error_message": "An error occurred during analysis. Please try again.",
            "has_results": False,
        }

    if "error" in similarities:
        return {
            "language": language,
            "code1": code1,
            "code2": code2,
            "error_message": similarities["error"],
            "has_results": False,
        }

    # ── Unpack metrics ─────────────────────────────────────────────────
    text_sim = float(similarities["text_sim"] * 100)
    token_sim = float(similarities["token_sim"] * 100)
    token_sim_without_comments = float(similarities["token_sim_without_comments"] * 100)
    token_sim_with_order = float(similarities["token_sim_with_order"] * 100)
    token_sim_with_order_without_comments = float(
        similarities["token_sim_with_order_without_comments"] * 100
    )
    exact_clone_result = similarities["exact_clone_result"]
    renamed_clone_sim = float(similarities["renamed_clone_sim"] * 100)
    near_miss_clone_result = similarities["near_miss_clone_result"]
    parameterized_clone_result = similarities["parameterized_clone_result"]
    function_clone_result = similarities["function_clone_result"]
    non_contiguous_clone_result = similarities["non_contiguous_clone_result"]
    structural_clone_result = similarities["structural_clone_result"]
    reordered_clone_result = similarities["reordered_clone_result"]
    function_reordered_clone_result = similarities["function_reordered_clone_result"]
    gapped_clone_result = similarities["gapped_clone_result"]
    intertwined_clone_result = similarities["intertwined_clone_result"]
    semantic_clone_result = similarities["semantic_clone_result"]
    graph_sim = similarities["graph_sim"]
    combined_similarity = similarities["combined_similarity"]
    ai_similarity_score = float(similarities["ai_similarity_score"] * 100)

    # ── Code metrics ───────────────────────────────────────────────────
    set_current_user_progress("Computing code metrics", 70, user_id=_bg_user_id)
    metrics1 = detector.get_metrics(code1, language)
    metrics2 = detector.get_metrics(code2, language)

    if language == "python":
        if metrics1.get("cyclomatic_complexity") is not None:
            metrics1["cyclomatic_complexity"] = round(metrics1["cyclomatic_complexity"], 3)
        if metrics1.get("maintainability_index") is not None:
            metrics1["maintainability_index"] = round(metrics1["maintainability_index"], 3)
        if metrics1.get("halstead"):
            for key in metrics1["halstead"]:
                metrics1["halstead"][key] = round(metrics1["halstead"][key], 3)
        if metrics2.get("cyclomatic_complexity") is not None:
            metrics2["cyclomatic_complexity"] = round(metrics2["cyclomatic_complexity"], 3)
        if metrics2.get("maintainability_index") is not None:
            metrics2["maintainability_index"] = round(metrics2["maintainability_index"], 3)
        if metrics2.get("halstead"):
            for key in metrics2["halstead"]:
                metrics2["halstead"][key] = round(metrics2["halstead"][key], 3)

        code_smell = CodeSmellAnalyzer.python_code_smell_analysis(code1, None, code2, None)
    else:
        code_smell = {
            "code1_analysis": "Code smell analysis is currently available for Python only.",
            "code2_analysis": "Code smell analysis is currently available for Python only.",
        }

    code_smell = normalize_code_smell_payload(code_smell)

    # ── Build metric display lists ─────────────────────────────────────
    values_list1 = [
        ["Text Similarity", text_sim],
        ["Token Similarity (ordered)", token_sim_with_order],
        [
            "Token Similarity (ordered, excluding comments and whitespace)",
            token_sim_with_order_without_comments,
        ],
        [
            "Token Similarity (unordered, with comments and whitespace)",
            token_sim,
        ],
        [
            "Token Similarity (unordered, excluding comments and whitespace)",
            token_sim_without_comments,
        ],
        ["Renamed Clone Similarity", renamed_clone_sim],
        ["Graph-Based Similarity", graph_sim * 100],
        ["Combined Similarity", combined_similarity * 100],
        ["AI Similarity", ai_similarity_score],
    ]

    values_list2 = [
        ["Exact Clone", exact_clone_result],
        ["Near Miss Clone", near_miss_clone_result],
        ["Parameterized Clone", parameterized_clone_result],
        ["Function Clone", function_clone_result],
        ["Non-Contiguous Clone", non_contiguous_clone_result],
        ["Structural Clone", structural_clone_result],
        ["Reordered Clone", reordered_clone_result],
        ["Function Reordered Clone", function_reordered_clone_result],
        ["Gapped Clone", gapped_clone_result],
        ["Intertwined Clone", intertwined_clone_result],
        ["Semantic Clone", semantic_clone_result],
    ]

    description_list1, description_list2 = build_similarity_sections(
        values_list1, values_list2,
    )
    buf = create_similarity_chart(values_list1)
    chart_url = base64.b64encode(buf.getvalue()).decode("utf-8")

    # ── Graph data ─────────────────────────────────────────────────────
    set_current_user_progress("Generating code graph data", 80, user_id=_bg_user_id)
    graph_json1 = []
    if code1:
        graph_json1 = nx.cytoscape_data(detector.code_to_graph(code1))["elements"]

    graph_json2 = []
    if code2:
        graph_json2 = nx.cytoscape_data(detector.code_to_graph(code2))["elements"]

    # ── AI text ────────────────────────────────────────────────────────
    set_current_user_progress("Generating AI analysis text", 90, user_id=_bg_user_id)
    analysis_structured = None
    if analysis_text_override is not None:
        analysis_text = analysis_text_override
    else:
        analysis_text, analysis_structured = generate_textual_analysis_ai(
            code1, code2, values_list1 + values_list2,
        )
    analysis_html = render_analysis_markdown(analysis_text)

    # ── Assemble response context ──────────────────────────────────────
    response_context: dict = {
        "language": language,
        "supported_languages": SUPPORTED_LANGUAGES,
        "code1": code1,
        "code2": code2,
        "source_labels": {
            "code1": derive_source_label(code1, "Source A"),
            "code2": derive_source_label(code2, "Source B"),
        },
        "description_list1": description_list1,
        "description_list2": description_list2,
        "similarity_items": [
            {"name": metric_name, "value": metric_value}
            for metric_name, metric_value in values_list1
        ],
        "clone_items": [
            {"name": metric_name, "detected": bool(metric_value)}
            for metric_name, metric_value in values_list2
        ],
        "chart_url": chart_url,
        "graph_json1": graph_json1,
        "graph_json2": graph_json2,
        "metrics1": metrics1,
        "metrics2": metrics2,
        "analysis_text": analysis_text,
        "analysis_html": analysis_html,
        "analysis_structured": analysis_structured,
        "excel_analysis_results": [],
        "code_smell": code_smell,
        "similarities": similarities,
        "error_message": None,
        "has_results": True,
        "saved_analysis_id": None,
    }

    # ── Determine effective user ID ────────────────────────────────────
    _effective_user_id = _bg_user_id
    if _effective_user_id is None:
        try:
            from flask_login import current_user
            if getattr(current_user, "is_authenticated", False):
                _effective_user_id = current_user.id
        except (ImportError, RuntimeError):
            pass

    # ── Persist / snapshot ─────────────────────────────────────────────
    if persist_analysis and _effective_user_id is None:
        # Analysis.user_id is NOT NULL — persisting without an owner would
        # raise IntegrityError.  This can only happen if the function is
        # called outside both a logged-in request and a background task.
        logger.warning("No user resolved for analysis persistence — skipping save.")
        persist_analysis = False

    if persist_analysis:
        snapshot_payload = build_analysis_snapshot(response_context)
        analysis_record = Analysis(
            user_id=_effective_user_id,
            operation="code clone analysis",
            result="successful",
            language=language,
            code1=code1,
            code2=code2,
            metrics=json_dumps_compact({"metrics1": metrics1, "metrics2": metrics2}),
            similarity=round(combined_similarity * 100, 1),
            analysis_text=analysis_text,
            snapshot_json=json_dumps_compact(snapshot_payload),
        )
        db.session.add(analysis_record)
        db.session.commit()
        response_context["saved_analysis_id"] = analysis_record.id
    elif snapshot_target_analysis is not None:
        persist_snapshot_to_analysis_record(snapshot_target_analysis, response_context)
        response_context["saved_analysis_id"] = snapshot_target_analysis.id

    if response_context.get("saved_analysis_id"):
        summary_analysis = db.session.get(
            Analysis, response_context["saved_analysis_id"],
        )
        response_context["summary"] = (
            serialize_history_summary(summary_analysis) if summary_analysis else None
        )
    else:
        response_context["summary"] = None

    if _effective_user_id:
        cache_analysis_context_for_user(_effective_user_id, response_context)

    set_current_user_progress("Analysis complete", 100, user_id=_bg_user_id)

    return response_context


# ---------------------------------------------------------------------------
# Restore / load saved analyses
# ---------------------------------------------------------------------------


def restore_saved_analysis_context(
    analysis: Analysis,
    allow_backfill: bool = True,
) -> dict:
    """Restore a full analysis context from a saved ``Analysis`` row.

    Strategy:
    1. If a snapshot with graph data exists, use it directly.
    2. If *allow_backfill* is ``True`` and the snapshot is incomplete,
       re-run the analysis pipeline to fill in missing data.
    3. Fall back to the minimal context.
    """
    snapshot_payload = json_loads_safe(analysis.snapshot_json, {})
    if snapshot_payload:
        if (
            graph_payload_has_content(snapshot_payload.get("graph_json1"))
            or graph_payload_has_content(snapshot_payload.get("graph_json2"))
            or not allow_backfill
        ):
            return build_analysis_context_from_snapshot(analysis, snapshot_payload)

    if not allow_backfill:
        return build_minimal_saved_analysis_context(analysis)

    rebuilt_context = build_analysis_context(
        analysis.code1,
        analysis.code2,
        analysis.language,
        persist_analysis=False,
        analysis_text_override=analysis.analysis_text,
        snapshot_target_analysis=analysis,
    )
    if rebuilt_context.get("has_results"):
        rebuilt_context["saved_analysis_id"] = analysis.id
        rebuilt_context["summary"] = serialize_history_summary(analysis)
        try:
            from flask_login import current_user
            if getattr(current_user, "is_authenticated", False):
                cache_analysis_context_for_user(current_user.id, rebuilt_context)
        except (ImportError, RuntimeError):
            pass
        return rebuilt_context

    return build_minimal_saved_analysis_context(
        analysis, rebuilt_context.get("error_message"),
    )


def load_saved_analysis_context(analysis_id: int) -> dict:
    """Load and restore a saved analysis by ID for the current user.

    Returns an error context when the analysis is not found or does not
    belong to the authenticated user.
    """
    from flask_login import current_user

    previous_analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id,
    ).first()
    if not previous_analysis:
        return {
            "error_message": "Analysis not found.",
            "has_results": False,
        }

    return restore_saved_analysis_context(previous_analysis)


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------


def serialize_history_summary(analysis: Analysis) -> dict:
    """Convert an ``Analysis`` model instance to a JSON-serializable dict.

    Includes a derived ``severity`` field based on the combined similarity
    score.
    """
    similarity = round(float(analysis.similarity or 0), 1)
    if similarity >= 80:
        severity = "high"
    elif similarity >= 50:
        severity = "moderate"
    else:
        severity = "low"

    created_at = normalize_datetime(analysis.date_created)
    return {
        "id": analysis.id,
        "operation": analysis.operation,
        "result": analysis.result,
        "language": analysis.language,
        "similarity": similarity,
        "severity": severity,
        "dateCreated": created_at.isoformat() if created_at else None,
        "dateDisplay": (
            analysis.date_created.strftime("%Y-%m-%d %H:%M:%S")
            if analysis.date_created
            else ""
        ),
        "sourceA": derive_source_label(analysis.code1, "Source A"),
        "sourceB": derive_source_label(analysis.code2, "Source B"),
    }


def build_history_stats(analyses) -> dict:
    """Compute aggregated statistics across a collection of analyses.

    Parameters
    ----------
    analyses:
        An iterable of ``Analysis`` model instances.

    Returns
    -------
    dict
        Keys: ``totalAnalyses``, ``highSimilarity``, ``languagesUsed``,
        ``last7Days``.
    """
    items = list(analyses)
    now = datetime.datetime.now(datetime.timezone.utc)
    recent_cutoff = now - datetime.timedelta(days=7)

    return {
        "totalAnalyses": len(items),
        "highSimilarity": sum(
            1 for a in items if (a.similarity or 0) >= 80
        ),
        "languagesUsed": len(
            {a.language for a in items if a.language}
        ),
        "last7Days": sum(
            1
            for a in items
            if normalize_datetime(a.date_created)
            and normalize_datetime(a.date_created) >= recent_cutoff
        ),
    }
