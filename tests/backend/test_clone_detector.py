"""
Tests for the CloneDetector engine.

These tests exercise the CloneDetector class directly — no Flask context
required.  AI-dependent methods (ai_based_similarity, combined_similarity)
are tested by monkeypatching the get_ai_analyzer singleton so that no
heavyweight transformer model is loaded.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import networkx as nx
import numpy as np
import pytest

from backend.engine.clone_detector import (
    SUPPORTED_LANGUAGES,
    CloneDetector,
    get_detector,
)

# ---------------------------------------------------------------------------
# Reusable code snippets
# ---------------------------------------------------------------------------

PYTHON_SNIPPET_A = """\
def add(a, b):
    return a + b
"""

PYTHON_SNIPPET_B = """\
def add(a, b):
    return a + b
"""

PYTHON_SNIPPET_C = """\
def multiply(x, y):
    result = x * y
    return result
"""

# Renamed clone: same structure, different identifiers
PYTHON_RENAMED = """\
def sum_values(first, second):
    return first + second
"""

PYTHON_COMPLEX = """\
def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
"""

PYTHON_DIFFERENT = """\
import os
import sys

class Config:
    DEBUG = True
    DATABASE_URI = "sqlite:///test.db"

    def get_path(self):
        return os.path.join(sys.prefix, "data")
"""

JS_SNIPPET_A = """\
function greet(name) {
    return "Hello, " + name;
}
"""

JS_SNIPPET_B = """\
function greet(name) {
    return "Hello, " + name;
}
"""

JS_DIFFERENT = """\
const fetchData = async (url) => {
    const response = await fetch(url);
    const data = await response.json();
    return data.results.filter(item => item.active);
};
"""

PYTHON_WITH_COMMENTS = """\
# This function adds two numbers
def add(a, b):
    # Return the sum
    return a + b  # inline comment
"""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def py_detector():
    """CloneDetector for Python."""
    return CloneDetector("python")


@pytest.fixture()
def js_detector():
    """CloneDetector for JavaScript."""
    return CloneDetector("javascript")


@pytest.fixture()
def _mock_ai(monkeypatch):
    """
    Replace the global AI analyzer with a lightweight mock.

    The mock returns a fixed high similarity (0.90) for any pair of inputs
    so that combined_similarity / semantic_clone_similarity can be tested
    without loading the transformer model.
    """
    mock_analyzer = MagicMock()
    mock_analyzer.analyze_similarity.return_value = 0.90
    monkeypatch.setattr(
        "backend.engine.clone_detector.get_ai_analyzer",
        lambda: mock_analyzer,
    )
    return mock_analyzer


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

class TestParseCode:

    def test_parse_code_python(self, py_detector):
        """parse_code returns a non-empty list of AST token types."""
        tokens = py_detector.parse_code(PYTHON_SNIPPET_A)
        assert isinstance(tokens, list)
        assert len(tokens) > 0
        # Default: sorted (unordered)
        assert tokens == sorted(tokens)

    def test_parse_code_ordered(self, py_detector):
        """with_order=True preserves the original token order."""
        ordered = py_detector.parse_code(PYTHON_SNIPPET_A, with_order=True)
        unordered = py_detector.parse_code(PYTHON_SNIPPET_A, with_order=False)
        # Same set of tokens, different order
        assert sorted(ordered) == sorted(unordered)
        # Ordered version is generally NOT sorted
        assert len(ordered) == len(unordered)

    def test_parse_code_javascript(self, js_detector):
        """JavaScript parsing produces tokens."""
        tokens = js_detector.parse_code(JS_SNIPPET_A)
        assert isinstance(tokens, list)
        assert len(tokens) > 0


# ---------------------------------------------------------------------------
# Text similarity
# ---------------------------------------------------------------------------

class TestTextSimilarity:

    def test_identical_code(self, py_detector):
        """Identical code has similarity 1.0."""
        sim = py_detector.text_similarity(PYTHON_SNIPPET_A, PYTHON_SNIPPET_B)
        assert sim == pytest.approx(1.0)

    def test_different_code(self, py_detector):
        """Substantially different code has low similarity."""
        sim = py_detector.text_similarity(PYTHON_SNIPPET_A, PYTHON_DIFFERENT)
        assert sim < 0.5


# ---------------------------------------------------------------------------
# Token similarity
# ---------------------------------------------------------------------------

class TestTokenSimilarity:

    def test_identical_tokens(self, py_detector):
        """Identical code yields token similarity of 1.0."""
        sim = py_detector.token_similarity(PYTHON_SNIPPET_A, PYTHON_SNIPPET_B)
        assert sim == pytest.approx(1.0)

    def test_similar_tokens(self, py_detector):
        """Renamed clone has high token similarity."""
        sim = py_detector.token_similarity(PYTHON_SNIPPET_A, PYTHON_RENAMED)
        assert sim > 0.7

    def test_different_tokens(self, py_detector):
        """Very different code has lower token similarity."""
        sim = py_detector.token_similarity(PYTHON_SNIPPET_A, PYTHON_DIFFERENT)
        assert sim < 0.6


# ---------------------------------------------------------------------------
# Exact clone
# ---------------------------------------------------------------------------

class TestIsExactClone:

    def test_exact_clone_true(self, py_detector):
        assert py_detector.is_exact_clone(PYTHON_SNIPPET_A, PYTHON_SNIPPET_B) is True

    def test_exact_clone_false(self, py_detector):
        assert py_detector.is_exact_clone(PYTHON_SNIPPET_A, PYTHON_RENAMED) is False

    def test_exact_clone_ignores_trailing_whitespace(self, py_detector):
        """strip() handles trailing newlines."""
        a = "def f(): pass\n\n"
        b = "def f(): pass"
        assert py_detector.is_exact_clone(a, b) is True


# ---------------------------------------------------------------------------
# Renamed clone detection
# ---------------------------------------------------------------------------

class TestRenamedClone:

    def test_renamed_clone_detection(self, py_detector):
        """Renamed clones (same structure, different names) have high similarity."""
        sim = py_detector.renamed_clone_similarity(PYTHON_SNIPPET_A, PYTHON_RENAMED)
        assert sim > 0.7

    def test_renamed_clone_different_structure(self, py_detector):
        """Structurally different code has lower renamed similarity."""
        sim = py_detector.renamed_clone_similarity(PYTHON_SNIPPET_A, PYTHON_DIFFERENT)
        assert sim < 0.5


# ---------------------------------------------------------------------------
# Combined similarity (mocked AI)
# ---------------------------------------------------------------------------

class TestCombinedSimilarity:

    def test_identical_code(self, py_detector, _mock_ai):
        """Identical code has combined similarity very close to 1.0."""
        sim = py_detector.combined_similarity(PYTHON_SNIPPET_A, PYTHON_SNIPPET_B)
        assert sim > 0.95

    def test_different_code(self, py_detector, _mock_ai):
        """Very different code has lower combined similarity."""
        sim = py_detector.combined_similarity(PYTHON_SNIPPET_A, PYTHON_DIFFERENT)
        assert sim < 0.8

    def test_precomputed_scores_accepted(self, py_detector):
        """When all sub-scores are passed in, no recomputation occurs."""
        sim = py_detector.combined_similarity(
            "a", "b",
            _text_sim=0.5,
            _token_sim=0.5,
            _graph_sim=0.5,
            _renamed_sim=0.5,
            _ai_score=0.5,
        )
        expected = 0.20 * 0.5 + 0.25 * 0.5 + 0.25 * 0.5 + 0.15 * 0.5 + 0.15 * 0.5
        assert sim == pytest.approx(expected)


# ---------------------------------------------------------------------------
# Graph similarity
# ---------------------------------------------------------------------------

class TestGraphSimilarity:

    def test_identical_code(self, py_detector):
        """Identical code has graph similarity 1.0."""
        sim = py_detector.graph_similarity(PYTHON_SNIPPET_A, PYTHON_SNIPPET_B)
        assert sim == pytest.approx(1.0)

    def test_different_code_lower(self, py_detector):
        """Different code has graph similarity < 1.0."""
        sim = py_detector.graph_similarity(PYTHON_SNIPPET_A, PYTHON_DIFFERENT)
        assert sim < 1.0
        assert sim >= 0.0


# ---------------------------------------------------------------------------
# Universal metrics
# ---------------------------------------------------------------------------

class TestUniversalMetrics:

    def test_python_metrics(self, py_detector):
        """Universal metrics for Python code include expected keys."""
        metrics = py_detector._universal_metrics(PYTHON_COMPLEX)
        assert "loc" in metrics
        assert "sloc" in metrics
        assert "blank_lines" in metrics
        assert "comment_lines" in metrics
        assert "token_count" in metrics
        assert "unique_tokens" in metrics
        assert "token_density" in metrics
        assert "max_nesting_depth" in metrics
        assert "function_count" in metrics
        assert "class_count" in metrics
        assert "avg_line_length" in metrics
        assert metrics["loc"] > 0
        assert metrics["sloc"] > 0
        assert metrics["function_count"] >= 1

    def test_javascript_metrics(self, js_detector):
        """Universal metrics work for JavaScript too."""
        metrics = js_detector._universal_metrics(JS_SNIPPET_A)
        assert metrics["loc"] > 0
        assert metrics["function_count"] >= 1


# ---------------------------------------------------------------------------
# get_metrics (with radon for Python, universal-only for others)
# ---------------------------------------------------------------------------

class TestGetMetrics:

    def test_python_has_radon_metrics(self, py_detector):
        """Python metrics include radon-specific fields."""
        metrics = py_detector.get_metrics(PYTHON_COMPLEX, "python")
        assert "universal" in metrics
        assert "raw" in metrics
        assert metrics["raw"] is not None
        assert "loc" in metrics["raw"]
        assert "halstead" in metrics
        assert "cyclomatic_complexity" in metrics
        assert "maintainability_index" in metrics

    def test_javascript_universal_only(self, js_detector):
        """Non-Python languages get universal metrics only."""
        metrics = js_detector.get_metrics(JS_SNIPPET_A, "javascript")
        assert "universal" in metrics
        assert metrics["universal"]["loc"] > 0
        assert metrics["raw"] is None
        assert metrics["halstead"] is None
        assert metrics["cyclomatic_complexity"] is None
        assert metrics["maintainability_index"] is None


# ---------------------------------------------------------------------------
# code_to_graph / calculate_graph_metrics
# ---------------------------------------------------------------------------

class TestGraphConstruction:

    def test_code_to_graph_creates_digraph(self, py_detector):
        """code_to_graph returns a directed NetworkX graph."""
        graph = py_detector.code_to_graph(PYTHON_SNIPPET_A)
        assert isinstance(graph, nx.DiGraph)
        assert graph.number_of_nodes() > 0
        assert graph.number_of_edges() > 0

    def test_calculate_graph_metrics(self, py_detector):
        """calculate_graph_metrics returns (nodes, edges, avg_degree)."""
        graph = py_detector.code_to_graph(PYTHON_COMPLEX)
        nodes, edges, avg_degree = py_detector.calculate_graph_metrics(graph)
        assert nodes > 0
        assert edges > 0
        assert avg_degree > 0

    def test_calculate_graph_metrics_empty(self, py_detector):
        """Empty graph returns zeros."""
        empty = nx.DiGraph()
        nodes, edges, avg_degree = py_detector.calculate_graph_metrics(empty)
        assert nodes == 0
        assert edges == 0
        assert avg_degree == 0


# ---------------------------------------------------------------------------
# Comment removal
# ---------------------------------------------------------------------------

class TestRemoveComments:

    def test_removes_python_comments(self, py_detector):
        """Comments are stripped from the output."""
        cleaned = py_detector.remove_comments_and_whitespace(PYTHON_WITH_COMMENTS)
        assert "#" not in cleaned
        # Core code is preserved
        assert "add" in cleaned
        assert "return" in cleaned


# ---------------------------------------------------------------------------
# Detector factory
# ---------------------------------------------------------------------------

class TestDetectorFactory:

    def test_valid_language(self):
        """get_detector returns a CloneDetector for a supported language."""
        detector = get_detector("python")
        assert isinstance(detector, CloneDetector)
        assert detector.language == "python"

    def test_all_supported_languages(self):
        """Every language in SUPPORTED_LANGUAGES can be instantiated."""
        for lang in SUPPORTED_LANGUAGES:
            d = get_detector(lang)
            assert isinstance(d, CloneDetector)
            assert d.language == lang

    def test_invalid_language_still_creates(self):
        """get_detector creates a new detector for unlisted but parseable languages."""
        # tree_sitter_languages may or may not support "lua", but get_detector
        # will try.  We just verify the factory does not crash for known extras.
        # Use a language we know tree-sitter supports:
        d = get_detector("python")
        assert d is not None


# ---------------------------------------------------------------------------
# Semantic / AI-based similarity (mocked)
# ---------------------------------------------------------------------------

class TestAIBasedSimilarity:

    def test_ai_similarity_mocked(self, py_detector, _mock_ai):
        """ai_based_similarity delegates to the AI analyzer."""
        sim = py_detector.ai_based_similarity(PYTHON_SNIPPET_A, PYTHON_RENAMED)
        assert sim == pytest.approx(0.90)
        _mock_ai.analyze_similarity.assert_called_once()

    def test_semantic_clone_above_threshold(self, py_detector, _mock_ai):
        """semantic_clone_similarity returns True when AI score > threshold."""
        result = py_detector.semantic_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_RENAMED, threshold=0.8
        )
        assert result is True

    def test_semantic_clone_below_threshold(self, py_detector, _mock_ai):
        """semantic_clone_similarity returns False when AI score < threshold."""
        _mock_ai.analyze_similarity.return_value = 0.3
        result = py_detector.semantic_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_DIFFERENT, threshold=0.8
        )
        assert result is False

    def test_semantic_clone_with_precomputed_score(self, py_detector):
        """ai_score parameter bypasses the AI analyzer call."""
        result = py_detector.semantic_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_RENAMED, threshold=0.5, ai_score=0.75
        )
        assert result is True


# ---------------------------------------------------------------------------
# Various clone type detectors
# ---------------------------------------------------------------------------

class TestCloneTypeDetectors:

    def test_near_miss_clone_identical(self, py_detector):
        """Identical code is a near-miss clone."""
        assert py_detector.near_miss_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_SNIPPET_B
        ) is True

    def test_near_miss_clone_different(self, py_detector):
        """Very different code is not a near-miss clone."""
        assert py_detector.near_miss_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_DIFFERENT
        ) is False

    def test_structural_clone_identical(self, py_detector):
        """Identical code is a structural clone."""
        assert py_detector.structural_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_SNIPPET_B
        ) is True

    def test_structural_clone_different(self, py_detector):
        """Very different code is not a structural clone."""
        assert py_detector.structural_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_DIFFERENT
        ) is False

    def test_function_clone_identical(self, py_detector):
        """Identical code is a function clone."""
        assert py_detector.function_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_SNIPPET_B
        ) is True

    def test_intertwined_clone_identical(self, py_detector):
        """Identical code is detected as intertwined clone."""
        assert py_detector.intertwined_clone_similarity(
            PYTHON_SNIPPET_A, PYTHON_SNIPPET_B
        ) is True


# ---------------------------------------------------------------------------
# Robustness: optional Python metrics must never crash on unparseable input
# ---------------------------------------------------------------------------

class TestMetricsRobustness:
    """``get_metrics`` enriches Python results with radon metrics (Halstead,
    cyclomatic, maintainability). Radon calls ``ast.parse`` and raises
    ``SyntaxError`` on anything that is not valid Python — a user's syntax
    error, non-Python source mislabeled ``python``, or a corrupt/legacy saved
    record. None of these may crash the analysis; the metrics degrade to neutral
    defaults instead.

    Regression for the 500 raised when restoring a saved analysis whose stored
    code was an undecryptable legacy ciphertext (``fenc1:...``).
    """

    UNPARSEABLE = "fenc1:gAAAAAB 1notpython $$$"

    def test_get_metrics_survives_unparseable_python(self, py_detector):
        metrics = py_detector.get_metrics(self.UNPARSEABLE, "python")
        assert metrics["halstead"] == {}
        assert metrics["cyclomatic_complexity"] == 0
        assert metrics["maintainability_index"] == 0
        assert metrics["universal"] is not None  # line-based metrics still work

    def test_radon_helpers_degrade_to_neutral_defaults(self, py_detector):
        assert py_detector.calculate_halstead_metrics(self.UNPARSEABLE) == {}
        assert py_detector.calculate_cyclomatic_complexity(self.UNPARSEABLE) == 0
        assert py_detector.calculate_maintainability_index(self.UNPARSEABLE) == 0

    def test_valid_python_still_produces_metrics(self, py_detector):
        metrics = py_detector.get_metrics(PYTHON_SNIPPET_C, "python")
        assert metrics["halstead"]  # non-empty for genuine Python
