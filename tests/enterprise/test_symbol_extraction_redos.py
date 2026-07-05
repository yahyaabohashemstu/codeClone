"""Regression guard for the ReDoS fix in the enterprise symbol-extraction
regex (red-team vector 1b). A crafted line in a scanned repo must not freeze
the worker, and real declarations must still be extracted."""
import time
from enterprise_platform.utils import extract_brace_blocks


class TestSymbolExtractionReDoS:
    def test_adversarial_line_returns_fast(self):
        payload = "public " + "a " * 40000 + "a"  # the catastrophic-backtracking input
        t0 = time.perf_counter()
        extract_brace_blocks("evil.java", payload, "java")
        assert time.perf_counter() - t0 < 2.0

    def test_real_java_methods_still_extracted(self):
        src = "public Map<String, Integer> counts(String a) throws IOException {\n}"
        names = [a.symbol_name for a in extract_brace_blocks("Foo.java", src, "java")]
        assert "counts" in names
