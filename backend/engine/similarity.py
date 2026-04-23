"""
Flask-independent similarity helpers.

Provides chart generation, normalization utilities, and payload helpers for
code-clone analysis results.  Every function is self-contained with no Flask
dependency.
"""

import base64
import html as _html
import io
import json
import logging

logger = logging.getLogger(__name__)

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    matplotlib = None
    plt = None
    logger.warning(
        "matplotlib is not installed; create_similarity_chart will not be available."
    )


# ---------------------------------------------------------------------------
# Chart generation
# ---------------------------------------------------------------------------


def create_similarity_chart(values_list):
    """Create a horizontal bar chart for similarity metrics.

    Parameters
    ----------
    values_list : list[list | tuple]
        Each element is ``[label: str, value: float]`` representing a metric
        name and its similarity ratio.

    Returns
    -------
    io.BytesIO
        In-memory buffer containing the rendered PNG image.

    Raises
    ------
    RuntimeError
        If matplotlib is not installed.
    """
    if plt is None:
        raise RuntimeError(
            "matplotlib is required for chart generation but is not installed. "
            "Install it with: pip install matplotlib"
        )

    labels = [item[0] for item in values_list]
    values = [item[1] for item in values_list]

    fig, ax = plt.subplots(figsize=(10, 6))
    try:
        bars = ax.barh(labels, values, color="purple")
        ax.set_xlabel("Similarity Ratio")
        ax.set_title("Code Similarity Metrics")
        fig.subplots_adjust(left=0.3)

        for label in ax.get_yticklabels():
            label.set_fontsize(10)

        for bar in bars:
            width = bar.get_width()
            ax.text(
                width,
                bar.get_y() + bar.get_height() / 2,
                f"{width:.2f}%",
                ha="left",
                va="center",
            )

        buf = io.BytesIO()
        fig.savefig(buf, format="png")
        buf.seek(0)
        return buf
    finally:
        plt.close(fig)


def build_chart_url_from_similarity_items(similarity_items):
    """Generate a base64-encoded PNG chart URL from similarity item dicts.

    Parameters
    ----------
    similarity_items : list[dict]
        Each dict must have ``name`` (str) and ``value`` (numeric) keys.

    Returns
    -------
    str or None
        Base64-encoded PNG string suitable for an ``<img>`` tag's ``src``
        attribute, or ``None`` when *similarity_items* yields no valid pairs.
    """
    values_list = similarity_pairs_from_items(similarity_items)
    if not values_list:
        return None

    buf = create_similarity_chart(values_list)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def _ensure_list(value):
    """Return *value* unchanged if it is a ``list``, otherwise ``[]``."""
    return value if isinstance(value, list) else []


def _ensure_dict(value, fallback=None):
    """Return *value* unchanged if it is a ``dict``, otherwise *fallback* or ``{}``."""
    if isinstance(value, dict):
        return value
    return {} if fallback is None else fallback


def _json_loads_safe(raw_value, fallback):
    """Parse a JSON string, returning *fallback* on any error."""
    if raw_value in (None, ""):
        return fallback

    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback

    return parsed if isinstance(parsed, type(fallback)) else fallback


def normalize_similarity_items(items):
    """Normalize a list of dicts into ``[{name: str, value: float}, ...]``.

    Non-dict entries, entries without a ``name``, and entries whose ``value``
    cannot be cast to ``float`` are silently dropped.

    Parameters
    ----------
    items : list[dict] or any
        Raw similarity items; non-list values are treated as empty.

    Returns
    -------
    list[dict]
        Cleaned list with ``name`` (str) and ``value`` (float) keys.
    """
    normalized = []
    for item in _ensure_list(items):
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        value = item.get("value")
        if not name:
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue
        normalized.append({"name": str(name), "value": numeric_value})
    return normalized


def normalize_clone_items(items):
    """Normalize a list of dicts into ``[{name: str, detected: bool}, ...]``.

    Non-dict entries and entries without a ``name`` are silently dropped.

    Parameters
    ----------
    items : list[dict] or any
        Raw clone-detection items; non-list values are treated as empty.

    Returns
    -------
    list[dict]
        Cleaned list with ``name`` (str) and ``detected`` (bool) keys.
    """
    normalized = []
    for item in _ensure_list(items):
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not name:
            continue
        normalized.append({"name": str(name), "detected": bool(item.get("detected"))})
    return normalized


def similarity_pairs_from_items(items):
    """Convert normalized similarity items to ``[[name, value], ...]`` pairs.

    Parameters
    ----------
    items : list[dict] or any
        Raw or pre-normalized similarity items.

    Returns
    -------
    list[list]
        Each inner list is ``[name: str, value: float]``.
    """
    return [[item["name"], item["value"]] for item in normalize_similarity_items(items)]


def clone_pairs_from_items(items):
    """Convert normalized clone items to ``[[name, detected], ...]`` pairs.

    Parameters
    ----------
    items : list[dict] or any
        Raw or pre-normalized clone-detection items.

    Returns
    -------
    list[list]
        Each inner list is ``[name: str, detected: bool]``.
    """
    return [
        [item["name"], item["detected"]] for item in normalize_clone_items(items)
    ]


def parse_analysis_metrics(raw_metrics_str):
    """Parse a JSON metrics string into two metric dictionaries.

    The expected JSON structure is either:

    * ``{"metrics1": {...}, "metrics2": {...}}`` -- each value is returned
      directly.
    * A flat ``dict`` -- returned as ``(dict, {})``.

    Parameters
    ----------
    raw_metrics_str : str or None
        JSON-encoded metrics string.

    Returns
    -------
    tuple[dict, dict]
        ``(metrics1, metrics2)``; empty dicts when parsing fails.
    """
    payload = _json_loads_safe(raw_metrics_str, {})
    if not isinstance(payload, dict):
        return {}, {}

    metrics1 = payload.get("metrics1")
    metrics2 = payload.get("metrics2")
    if isinstance(metrics1, dict) or isinstance(metrics2, dict):
        return _ensure_dict(metrics1), _ensure_dict(metrics2)

    return payload, {}


# ---------------------------------------------------------------------------
# HTML section builders
# ---------------------------------------------------------------------------


def build_similarity_sections(values_list1, values_list2):
    """Build HTML description-list fragments for similarity and clone results.

    Parameters
    ----------
    values_list1 : list[list | tuple]
        Similarity metrics as ``[[name, numeric_value], ...]``.
    values_list2 : list[list | tuple]
        Clone-detection results as ``[[name, bool_value], ...]``.

    Returns
    -------
    tuple[str, str]
        ``(description_list1_html, description_list2_html)`` ready for
        embedding in a template.
    """
    description_list1 = ""
    description_list2 = ""

    for metric_name, metric_value in values_list1:
        safe_name = _html.escape(str(metric_name))
        safe_pct = f"{metric_value:.2f}"
        if metric_value < 40:
            color_class = "color1"
        elif metric_value < 50:
            color_class = "color2"
        elif metric_value < 60:
            color_class = "color3"
        elif metric_value < 70:
            color_class = "color4"
        elif metric_value < 80:
            color_class = "color5"
        elif metric_value < 90:
            color_class = "color6"
        else:
            color_class = "color7"

        description_list1 += f'''
                <div class="result-item">
                    <div class="result-label">{safe_name}:</div>
                    <div class="circle-container {color_class}" data-percentage="{safe_pct}">
                        <svg>
                            <circle class="circle-bg" cx="50" cy="50" r="45"></circle>
                            <circle class="circle hover-effect" cx="50" cy="50" r="45"></circle>
                        </svg>
                        <div class="circle-text">{safe_pct}%</div>
                    </div>
                </div>
                '''

    for metric_name, metric_value in values_list2:
        safe_metric_name = _html.escape(str(metric_name))
        safe_metric_value = _html.escape(str(metric_value))
        status_class = "true" if metric_value is True else "false"
        description_list2 += f'''
            <div class="result-item">
                <div class="result-label">{safe_metric_name}:</div>
                <div class="toggle-container {status_class}">
                    <div class="toggle-switch"></div>
                    <div class="toggle-status">{safe_metric_value}</div>
                </div>
            </div>
            '''

    return description_list1, description_list2


# ---------------------------------------------------------------------------
# Graph payload helpers
# ---------------------------------------------------------------------------


def ensure_graph_payload(data):
    """Normalize a graph payload into ``{"nodes": [...], "edges": [...]}``.

    Accepts several common shapes:

    * A ``list`` -- returned as-is (legacy Cytoscape elements array).
    * ``{"nodes": [...], "edges": [...]}`` -- validated and returned.
    * ``{"elements": {"nodes": [...], "edges": [...]}}`` -- unwrapped.

    Everything else yields an empty ``{"nodes": [], "edges": []}`` stub.

    Parameters
    ----------
    data : any
        Raw graph JSON from the analysis backend.

    Returns
    -------
    list or dict
        Normalized graph structure.
    """
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        nodes = data.get("nodes")
        edges = data.get("edges")
        if isinstance(nodes, list) and isinstance(edges, list):
            return {
                "nodes": nodes,
                "edges": edges,
            }

        elements = data.get("elements")
        if isinstance(elements, dict):
            nested_nodes = elements.get("nodes")
            nested_edges = elements.get("edges")
            if isinstance(nested_nodes, list) and isinstance(nested_edges, list):
                return {
                    "nodes": nested_nodes,
                    "edges": nested_edges,
                }

    return {
        "nodes": [],
        "edges": [],
    }


def graph_payload_has_content(data):
    """Check whether a graph payload contains any real nodes or edges.

    Parameters
    ----------
    data : any
        Raw or normalized graph payload.

    Returns
    -------
    bool
        ``True`` when the graph has at least one node or edge.
    """
    graph_payload = ensure_graph_payload(data)
    if isinstance(graph_payload, list):
        return len(graph_payload) > 0

    return bool(graph_payload.get("nodes")) or bool(graph_payload.get("edges"))
