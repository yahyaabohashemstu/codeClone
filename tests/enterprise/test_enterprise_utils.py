"""
Tests for pure utility functions in enterprise_platform.utils.

These tests exercise functions that require no Flask application context
and no database connection.  They validate the core algorithmic building
blocks of the enterprise platform: canonicalization, hashing, scoring,
classification, and artifact extraction.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path, PurePosixPath

import numpy as np
import pytest

from enterprise_platform.models import ArtifactExtraction, EnterpriseError
from enterprise_platform.utils import (
    canonicalize_source,
    classify_clone,
    compute_similarity_bundle,
    cosine_similarity,
    extract_artifacts,
    feature_hash_vector,
    normalize_provider,
    path_is_within,
    slugify,
    structural_score,
    token_overlap_score,
    utcnow,
)

# ---------------------------------------------------------------------------
# Shared test snippets
# ---------------------------------------------------------------------------

PYTHON_ADD = "def add(a, b):\n    return a + b"
PYTHON_ADD_RENAMED = "def sum_values(x, y):\n    return x + y"

JS_ADD = "function add(a, b) {\n    return a + b;\n}"

PYTHON_MULTI = (
    "def foo(x):\n"
    "    return x * 2\n"
    "\n"
    "def bar(y):\n"
    "    return y + 1\n"
)

JS_MULTI = (
    "function foo(x) {\n"
    "    return x * 2;\n"
    "}\n"
    "\n"
    "function bar(y) {\n"
    "    return y + 1;\n"
    "}\n"
)


# =========================================================================
# utcnow
# =========================================================================


class TestUtcnow:
    """Tests for the utcnow() helper."""

    def test_utcnow_returns_aware_datetime(self):
        """utcnow must return a timezone-aware datetime (tzinfo is not None)."""
        now = utcnow()
        assert isinstance(now, dt.datetime)
        assert now.tzinfo is not None

    def test_utcnow_is_utc(self):
        """utcnow must have its timezone set to UTC."""
        now = utcnow()
        assert now.tzinfo == dt.timezone.utc
        assert now.utcoffset() == dt.timedelta(0)


# =========================================================================
# slugify
# =========================================================================


class TestSlugify:
    """Tests for the slugify() normalizer."""

    def test_slugify_basic(self):
        """Simple ASCII text should be lowercased and whitespace replaced by hyphens."""
        result = slugify("Hello World")
        assert result == "hello-world"

    def test_slugify_special_chars(self):
        """Non-alphanumeric characters should be collapsed into single hyphens."""
        result = slugify("foo@bar#baz!!!")
        assert result == "foo-bar-baz"

    def test_slugify_empty_string(self):
        """An empty string should produce a random hex fallback (length 8)."""
        result = slugify("")
        assert isinstance(result, str)
        assert len(result) == 8  # secrets.token_hex(4) => 8 hex chars

    def test_slugify_unicode(self):
        """Unicode characters outside ASCII are stripped; remaining fragments joined by hyphens."""
        result = slugify("cafe\u0301 latte\u00fc")
        # The accented chars (non a-zA-Z0-9) become hyphens; remaining ASCII survives.
        assert "caf" in result
        assert "latte" in result
        # Must be lowercase and contain only [a-z0-9-]
        assert all(ch in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in result)


# =========================================================================
# canonicalize_source
# =========================================================================


class TestCanonicalizeSource:
    """Tests for source-code canonicalization."""

    def test_canonicalize_source_python(self):
        """Canonicalizing a simple Python function produces normalized keyword tokens."""
        canonical, tokens = canonicalize_source(PYTHON_ADD, "python")
        assert isinstance(canonical, str)
        assert isinstance(tokens, list)
        assert len(tokens) > 0
        # 'def' maps to FUNC, 'return' maps to RETURN
        assert "FUNC" in tokens
        assert "RETURN" in tokens
        # Identifiers are normalized
        assert "ID" in tokens

    def test_canonicalize_source_javascript(self):
        """Canonicalizing a simple JS function produces normalized keyword tokens."""
        canonical, tokens = canonicalize_source(JS_ADD, "javascript")
        assert isinstance(canonical, str)
        assert len(tokens) > 0
        assert "FUNC" in tokens
        assert "RETURN" in tokens

    def test_canonicalize_source_strips_comments(self):
        """Comments should be removed before tokenization."""
        python_with_comment = "# This is a comment\ndef add(a, b):\n    return a + b"
        canonical, tokens = canonicalize_source(python_with_comment, "python")
        # The comment text should not appear in any token
        assert "comment" not in canonical.lower()
        assert "FUNC" in tokens

    def test_canonicalize_source_normalizes_strings(self):
        """String literals should be replaced by a normalized placeholder token.

        The canonicalizer substitutes string literals with 'STR', which the
        identifier normalizer then maps to 'CONST_ID' (all-caps constant
        pattern).  The important invariant is that the original literal
        content is erased from the canonical form.
        """
        source = 'x = "hello world"\ny = \'goodbye\''
        canonical, tokens = canonicalize_source(source, "python")
        # Literal content must be erased
        assert "hello" not in canonical
        assert "goodbye" not in canonical
        # The substitution produces CONST_ID tokens where strings were
        assert "CONST_ID" in tokens


# =========================================================================
# feature_hash_vector
# =========================================================================


class TestFeatureHashVector:
    """Tests for the feature-hashing embedding function."""

    def test_feature_hash_vector_dimension(self):
        """Output must be a 384-dimensional numpy float32 array."""
        _, tokens = canonicalize_source(PYTHON_ADD, "python")
        vector = feature_hash_vector(tokens)
        assert isinstance(vector, np.ndarray)
        assert vector.shape == (384,)
        assert vector.dtype == np.float32

    def test_feature_hash_vector_normalized(self):
        """Non-zero output must have L2 norm approximately equal to 1.0."""
        _, tokens = canonicalize_source(PYTHON_ADD, "python")
        vector = feature_hash_vector(tokens)
        norm = float(np.linalg.norm(vector))
        np.testing.assert_allclose(norm, 1.0, atol=1e-5)

    def test_feature_hash_vector_deterministic(self):
        """Identical input tokens must produce identical output vectors."""
        _, tokens = canonicalize_source(PYTHON_ADD, "python")
        v1 = feature_hash_vector(tokens)
        v2 = feature_hash_vector(tokens)
        np.testing.assert_array_equal(v1, v2)

    def test_feature_hash_vector_different_inputs(self):
        """Substantially different token lists must produce different vectors."""
        _, tokens_a = canonicalize_source(PYTHON_ADD, "python")
        _, tokens_b = canonicalize_source(
            "class Foo:\n    def __init__(self):\n        self.x = 0\n    def run(self):\n        for i in range(10):\n            self.x += i",
            "python",
        )
        v_a = feature_hash_vector(tokens_a)
        v_b = feature_hash_vector(tokens_b)
        # Vectors should NOT be identical
        assert not np.array_equal(v_a, v_b)

    def test_feature_hash_vector_empty_tokens(self):
        """An empty token list should produce the zero vector."""
        vector = feature_hash_vector([])
        assert vector.shape == (384,)
        np.testing.assert_array_equal(vector, np.zeros(384, dtype=np.float32))


# =========================================================================
# token_overlap_score
# =========================================================================


class TestTokenOverlapScore:
    """Tests for the Dice-coefficient-style token overlap metric."""

    def test_token_overlap_score_identical(self):
        """Identical token lists must score exactly 1.0."""
        tokens = ["FUNC", "ID", "RETURN", "ID"]
        score = token_overlap_score(tokens, tokens)
        assert score == pytest.approx(1.0)

    def test_token_overlap_score_disjoint(self):
        """Completely disjoint token lists must score 0.0."""
        score = token_overlap_score(["FUNC", "RETURN"], ["CLASS", "LOOP"])
        assert score == pytest.approx(0.0)

    def test_token_overlap_score_partial(self):
        """Partial overlap must produce a score strictly between 0 and 1."""
        tokens_a = ["FUNC", "ID", "RETURN", "ID"]
        tokens_b = ["FUNC", "ID", "LOOP", "BREAK"]
        score = token_overlap_score(tokens_a, tokens_b)
        assert 0.0 < score < 1.0

    def test_token_overlap_score_empty(self):
        """An empty list in either position should score 0.0."""
        assert token_overlap_score([], ["FUNC"]) == pytest.approx(0.0)
        assert token_overlap_score(["FUNC"], []) == pytest.approx(0.0)


# =========================================================================
# structural_score
# =========================================================================


class TestStructuralScore:
    """Tests for the weighted structural similarity metric."""

    @pytest.fixture()
    def _python_func_extraction(self):
        """Return an ArtifactExtraction for a small Python function."""
        return ArtifactExtraction(
            logical_path="a.py",
            language="python",
            symbol_kind="function",
            source_text=PYTHON_ADD,
            start_line=1,
            end_line=2,
        )

    @pytest.fixture()
    def _python_class_extraction(self):
        """Return an ArtifactExtraction for a Python class."""
        return ArtifactExtraction(
            logical_path="b.py",
            language="python",
            symbol_kind="class",
            source_text="class Foo:\n    pass",
            start_line=1,
            end_line=2,
        )

    def test_structural_score_same_kind(self, _python_func_extraction):
        """Two artifacts of the same symbol_kind should produce a higher score."""
        _, tokens_a = canonicalize_source(PYTHON_ADD, "python")
        _, tokens_b = canonicalize_source(PYTHON_ADD_RENAMED, "python")
        score = structural_score(
            _python_func_extraction,
            _python_func_extraction,
            tokens_a,
            tokens_b,
        )
        # kind_score = 1.0, so the result benefits from the full 0.45 weight
        assert score > 0.7

    def test_structural_score_different_kind(
        self, _python_func_extraction, _python_class_extraction
    ):
        """Artifacts of different symbol_kind should produce a lower score."""
        _, tokens_a = canonicalize_source(PYTHON_ADD, "python")
        _, tokens_b = canonicalize_source("class Foo:\n    pass", "python")
        score = structural_score(
            _python_func_extraction,
            _python_class_extraction,
            tokens_a,
            tokens_b,
        )
        # kind_score = 0.55 for mismatched kinds
        assert score < 0.85


# =========================================================================
# classify_clone
# =========================================================================


class TestClassifyClone:
    """Tests for the clone-type classifier."""

    def test_classify_clone_exact(self):
        """Identical raw hashes must classify as type_1_exact."""
        result = classify_clone(
            raw_hash_equal=True,
            canonical_hash_equal=True,
            is_cross_language=False,
            overall=1.0,
            token_score_value=1.0,
            semantic_score_value=1.0,
        )
        assert result == "type_1_exact"

    def test_classify_clone_renamed(self):
        """Same canonical hash, different raw hash, same language => type_2_renamed."""
        result = classify_clone(
            raw_hash_equal=False,
            canonical_hash_equal=True,
            is_cross_language=False,
            overall=0.95,
            token_score_value=0.92,
            semantic_score_value=0.95,
        )
        assert result == "type_2_renamed"

    def test_classify_clone_low_similarity(self):
        """Low scores with no hash match must classify as suspicious_similarity."""
        result = classify_clone(
            raw_hash_equal=False,
            canonical_hash_equal=False,
            is_cross_language=False,
            overall=0.5,
            token_score_value=0.3,
            semantic_score_value=0.4,
        )
        assert result == "suspicious_similarity"

    def test_classify_clone_structural(self):
        """High token overlap without hash match => type_3_structural."""
        result = classify_clone(
            raw_hash_equal=False,
            canonical_hash_equal=False,
            is_cross_language=False,
            overall=0.90,
            token_score_value=0.90,
            semantic_score_value=0.85,
        )
        assert result == "type_3_structural"

    def test_classify_clone_cross_language_semantic(self):
        """Cross-language with high semantic score => type_4_cross_language_semantic."""
        result = classify_clone(
            raw_hash_equal=False,
            canonical_hash_equal=False,
            is_cross_language=True,
            overall=0.90,
            token_score_value=0.60,
            semantic_score_value=0.95,
        )
        assert result == "type_4_cross_language_semantic"

    def test_classify_clone_semantic(self):
        """High overall score but moderate token score => semantic_clone."""
        result = classify_clone(
            raw_hash_equal=False,
            canonical_hash_equal=False,
            is_cross_language=False,
            overall=0.86,
            token_score_value=0.70,
            semantic_score_value=0.80,
        )
        assert result == "semantic_clone"


# =========================================================================
# compute_similarity_bundle
# =========================================================================


class TestComputeSimilarityBundle:
    """Tests for the composite similarity-computation pipeline."""

    def test_compute_similarity_bundle_identical_code(self):
        """Identical Python functions must yield very high similarity and type_1_exact."""
        ext_a = ArtifactExtraction("a.py", "python", "function", PYTHON_ADD, 1, 2, "add", "a.py:add")
        ext_b = ArtifactExtraction("b.py", "python", "function", PYTHON_ADD, 1, 2, "add", "b.py:add")
        bundle = compute_similarity_bundle(ext_a, ext_b)

        assert isinstance(bundle, dict)
        assert bundle["raw_hash_equal"] is True
        assert bundle["canonical_hash_equal"] is True
        assert bundle["clone_type"] == "type_1_exact"
        assert bundle["similarity_score"] == pytest.approx(1.0, abs=0.05)
        assert bundle["semantic_score"] == pytest.approx(1.0, abs=0.01)
        assert bundle["token_score"] == pytest.approx(1.0, abs=0.01)
        assert bundle["is_cross_language"] is False
        # Vectors should be present and valid
        assert isinstance(bundle["vector_a"], np.ndarray)
        assert isinstance(bundle["vector_b"], np.ndarray)

    def test_compute_similarity_bundle_different_code(self):
        """Very different functions must yield a low overall similarity score."""
        code_a = "def add(a, b):\n    return a + b"
        code_b = (
            "class DatabaseManager:\n"
            "    def __init__(self, host, port, db):\n"
            "        self.host = host\n"
            "        self.port = port\n"
            "        self.db = db\n"
            "    def connect(self):\n"
            "        pass\n"
            "    def disconnect(self):\n"
            "        pass\n"
        )
        ext_a = ArtifactExtraction("a.py", "python", "function", code_a, 1, 2, "add", "a.py:add")
        ext_b = ArtifactExtraction("b.py", "python", "class", code_b, 1, 9, "DatabaseManager", "b.py:DatabaseManager")
        bundle = compute_similarity_bundle(ext_a, ext_b)

        assert bundle["raw_hash_equal"] is False
        assert bundle["canonical_hash_equal"] is False
        assert bundle["similarity_score"] < 0.7
        assert bundle["clone_type"] in {"suspicious_similarity", "semantic_clone"}


# =========================================================================
# extract_artifacts
# =========================================================================


class TestExtractArtifacts:
    """Tests for the multi-language artifact extractor."""

    def test_extract_artifacts_python(self):
        """Extracting from a Python file should find individual functions."""
        artifacts = extract_artifacts("test.py", "python", PYTHON_MULTI)
        assert len(artifacts) == 2
        names = [a.symbol_name for a in artifacts]
        assert "foo" in names
        assert "bar" in names
        for art in artifacts:
            assert art.language == "python"
            assert art.symbol_kind == "function"
            assert art.logical_path == "test.py"
            assert art.start_line >= 1
            assert art.end_line >= art.start_line

    def test_extract_artifacts_javascript(self):
        """Extracting from a JS file should find individual functions."""
        artifacts = extract_artifacts("test.js", "javascript", JS_MULTI)
        assert len(artifacts) == 2
        names = [a.symbol_name for a in artifacts]
        assert "foo" in names
        assert "bar" in names
        for art in artifacts:
            assert art.language == "javascript"
            assert art.symbol_kind == "function"
            assert art.logical_path == "test.js"

    def test_extract_artifacts_empty(self):
        """An empty source file should return a single file-level artifact."""
        artifacts = extract_artifacts("empty.py", "python", "")
        # Python extractor falls back to a whole-file artifact when nothing is found
        assert len(artifacts) == 1
        assert artifacts[0].symbol_kind == "file"

    def test_extract_artifacts_python_class(self):
        """A Python class should be extracted with symbol_kind='class'."""
        source = "class Calculator:\n    def add(self, a, b):\n        return a + b\n"
        artifacts = extract_artifacts("calc.py", "python", source)
        kinds = {a.symbol_kind for a in artifacts}
        assert "class" in kinds

    def test_extract_artifacts_js_arrow_function(self):
        """Arrow functions assigned to const should be extracted."""
        source = "const multiply = (a, b) => {\n    return a * b;\n}\n"
        artifacts = extract_artifacts("math.js", "javascript", source)
        names = [a.symbol_name for a in artifacts]
        assert "multiply" in names


# =========================================================================
# cosine_similarity
# =========================================================================


class TestCosineSimilarity:
    """Tests for the cosine similarity helper."""

    def test_cosine_similarity_identical(self):
        """Identical (non-zero) vectors must score exactly 1.0."""
        v = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        score = cosine_similarity(v, v)
        assert score == pytest.approx(1.0, abs=1e-6)

    def test_cosine_similarity_orthogonal(self):
        """Orthogonal vectors must score 0.0."""
        v_a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        v_b = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        score = cosine_similarity(v_a, v_b)
        assert score == pytest.approx(0.0, abs=1e-6)

    def test_cosine_similarity_opposite(self):
        """Anti-parallel vectors must score -1.0."""
        v = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        score = cosine_similarity(v, -v)
        assert score == pytest.approx(-1.0, abs=1e-6)

    def test_cosine_similarity_empty(self):
        """Empty vectors must return 0.0 without error."""
        v_empty = np.array([], dtype=np.float32)
        v = np.array([1.0, 2.0], dtype=np.float32)
        assert cosine_similarity(v_empty, v) == 0.0
        assert cosine_similarity(v, v_empty) == 0.0

    def test_cosine_similarity_zero_vector(self):
        """A zero vector against any vector must return 0.0."""
        v_zero = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        v = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        assert cosine_similarity(v_zero, v) == 0.0


# =========================================================================
# normalize_provider
# =========================================================================


class TestNormalizeProvider:
    """Tests for the repository-provider normalizer."""

    @pytest.mark.parametrize("raw,expected", [
        ("github", "github"),
        ("GitHub", "github"),
        ("  GITHUB  ", "github"),
        ("gitlab", "gitlab"),
        ("GitLab", "gitlab"),
        ("local", "local"),
        ("LOCAL", "local"),
    ])
    def test_normalize_provider_valid(self, raw: str, expected: str):
        """Valid provider strings (case-insensitive, trimmed) should normalize correctly."""
        assert normalize_provider(raw) == expected

    @pytest.mark.parametrize("bad_value", [
        "bitbucket",
        "svn",
        "",
        "   ",
    ])
    def test_normalize_provider_invalid(self, bad_value: str):
        """Unsupported providers must raise EnterpriseError with status 400."""
        with pytest.raises(EnterpriseError) as exc_info:
            normalize_provider(bad_value)
        assert exc_info.value.status_code == 400
        assert exc_info.value.code == "unsupported_provider"


# =========================================================================
# path_is_within
# =========================================================================


class TestPathIsWithin:
    """Tests for the path containment check."""

    def test_path_is_within_true(self):
        """A child path must be recognized as within its parent."""
        root = Path("/projects/repo")
        child = Path("/projects/repo/src/main.py")
        assert path_is_within(child, root) is True

    def test_path_is_within_false(self):
        """A path outside the root must be rejected."""
        root = Path("/projects/repo")
        outside = Path("/other/directory/file.py")
        assert path_is_within(outside, root) is False

    def test_path_is_within_same_path(self):
        """A path that equals the root is within itself."""
        p = Path("/projects/repo")
        assert path_is_within(p, p) is True

    def test_path_is_within_sibling(self):
        """A sibling directory must not be within the root."""
        root = Path("/projects/repo")
        sibling = Path("/projects/other-repo/file.py")
        assert path_is_within(sibling, root) is False
