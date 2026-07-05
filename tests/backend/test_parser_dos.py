"""Regression guards for the parser DoS fixes (red-team vector 1):
deep-nesting RecursionError, fuzzy O(n*m) blow-up, unbounded graph."""
import time
from backend.engine.clone_detector import get_detector, _MAX_GRAPH_NODES


class TestParserDoS:
    def _deep(self):
        return "x = " + "(" * 50000 + "1" + ")" * 50000  # 50k nesting, ~100KB

    def test_deeply_nested_input_does_not_raise_recursionerror(self):
        d = get_detector("python")
        payload = self._deep()
        # Iterative traversals: none of these may raise RecursionError.
        assert isinstance(d.parse_code(payload), list)
        assert isinstance(d.parse_code(payload, with_order=True), list)
        d.remove_comments_and_whitespace(payload)
        assert d.code_to_graph(payload).number_of_nodes() > 0
        d._universal_metrics(payload)

    def test_graph_node_count_is_bounded(self):
        d = get_detector("python")
        assert d.code_to_graph(self._deep()).number_of_nodes() <= _MAX_GRAPH_NODES

    def test_fuzzy_comparators_are_bounded_time(self):
        d = get_detector("python")
        big = "a = " + "+".join(["1"] * 100000)  # ~400KB
        t0 = time.perf_counter()
        d.text_similarity(big, big)
        d.token_similarity(big, big)
        d.renamed_clone_similarity(big, big)
        assert time.perf_counter() - t0 < 3.0
