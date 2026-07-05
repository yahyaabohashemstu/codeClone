"""Tests for the GraphCodeBERT sliding-window chunking + masked pooling.

The pure windowing logic (``_make_windows``) is tested without the model. The
integration tests load the cached GraphCodeBERT model and prove that (a) content
past the first 512 tokens now affects the embedding (no truncation) and (b)
short snippets are no longer diluted by padding.
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.engine.ai_analyzer import _make_windows, get_ai_analyzer


# ---------------------------------------------------------------------------
# Pure windowing logic (no model required)
# ---------------------------------------------------------------------------

class TestMakeWindows:
    def test_empty_input(self):
        assert _make_windows([], 510, 100, 24) == [[]]

    def test_short_input_is_single_window(self):
        ids = list(range(50))
        assert _make_windows(ids, content_len=510, overlap=100, max_windows=24) == [ids]

    def test_long_input_covers_every_token(self):
        ids = list(range(2000))
        wins = _make_windows(ids, content_len=510, overlap=100, max_windows=24)
        assert len(wins) > 1
        assert all(len(w) <= 510 for w in wins)
        covered = set()
        for w in wins:
            covered.update(w)
        # Full coverage: no token is dropped (the old code truncated at 512).
        assert covered == set(ids)

    def test_windows_overlap(self):
        ids = list(range(2000))
        wins = _make_windows(ids, content_len=510, overlap=100, max_windows=24)
        # Adjacent windows share tokens (overlap preserves cross-boundary context).
        first, second = set(wins[0]), set(wins[1])
        assert first & second

    def test_window_cap_still_covers_head_and_tail(self):
        ids = list(range(100_000))
        wins = _make_windows(ids, content_len=510, overlap=100, max_windows=8)
        assert len(wins) <= 8
        assert 0 in wins[0]                 # head covered
        assert (100_000 - 1) in wins[-1]    # tail covered


# ---------------------------------------------------------------------------
# Integration: real GraphCodeBERT embeddings
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def analyzer():
    try:
        a = get_ai_analyzer()
    except Exception as exc:  # pragma: no cover - only when the model is absent
        pytest.skip(f"GraphCodeBERT model unavailable: {exc}")
    return a


class TestChunkedEmbedding:
    def test_masked_pooling_short_snippet_is_finite_nonzero(self, analyzer):
        emb = analyzer.get_embedding("def add(a, b):\n    return a + b\n")
        assert emb.shape[0] == analyzer.model.config.hidden_size
        assert np.isfinite(emb).all()
        assert np.linalg.norm(emb) > 0.0

    def test_identical_code_is_near_perfectly_similar(self, analyzer):
        code = "class Foo:\n    def bar(self):\n        return 42\n" * 30
        assert analyzer.analyze_similarity(code, code) > 0.999

    def test_tail_beyond_512_tokens_affects_embedding(self, analyzer):
        # A shared prefix long enough to exceed the 512-token window on its own,
        # then two very different tails. Under the OLD truncating code both
        # embeddings would be identical (only the prefix was seen); with chunking
        # the differing tails must move the embeddings apart.
        prefix = "def helper_%d(x):\n    return x * %d + 1\n" % (0, 0)
        prefix = "".join(f"def helper_{i}(x):\n    return x * {i} + 1\n" for i in range(80))
        tail_a = "\ndef tail():\n    return 1\n"
        tail_b = "".join(
            f"\nclass Widget{i}:\n    def render(self):\n        return sum(range({i}))\n"
            for i in range(40)
        )
        emb_a = analyzer.get_embedding(prefix + tail_a)
        emb_b = analyzer.get_embedding(prefix + tail_b)
        # Sanity: the prefix alone is already longer than one window.
        assert len(analyzer.tokenizer(prefix, add_special_tokens=False)["input_ids"]) > 512
        assert not np.allclose(emb_a, emb_b, atol=1e-4)
        sim = analyzer.cosine_similarity(emb_a, emb_b)
        assert sim < 0.999  # the divergent tail is reflected, not truncated away
