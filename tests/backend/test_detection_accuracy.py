"""Detection-accuracy regression gate.

Pins the headline numbers measured by ``evaluation/run_eval.py`` against the
labeled dataset in ``evaluation/dataset`` so that engine or threshold changes
cannot silently degrade accuracy.  UniXcoder is stubbed (score 0.0) to
keep CI fast — the pinned pairwise assertions therefore cover the non-AI
signals only; run the full harness manually for the AI-inclusive numbers.

Dataset and methodology: evaluation/README.md.
Measured evidence: evaluation/results/report.md.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = REPO_ROOT / "evaluation" / "dataset"
RESULTS_DIR = REPO_ROOT / "evaluation" / "results"

# Calibrated production operating points (see enterprise_platform/models.py).
ENTERPRISE_DECISION_THRESHOLD = 0.91
ENTERPRISE_REVIEW_THRESHOLD = 0.88


def load_pairs() -> list[dict]:
    manifest = json.loads((DATASET_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest["pairs"]


def read_sources(pair: dict) -> tuple[str, str]:
    return (
        (DATASET_DIR / pair["file_a"]).read_text(encoding="utf-8"),
        (DATASET_DIR / pair["file_b"]).read_text(encoding="utf-8"),
    )


# ---------------------------------------------------------------------------
# Enterprise engine (pure numpy — no ML model, fast)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def enterprise_records():
    from enterprise_platform.models import ArtifactExtraction
    from enterprise_platform.utils import compute_similarity_bundle

    records = []
    for pair in load_pairs():
        if "enterprise" not in pair["engines"]:
            continue
        code_a, code_b = read_sources(pair)
        extraction_a = ArtifactExtraction(
            pair["file_a"], pair["language_a"], "file", code_a,
            1, max(1, len(code_a.splitlines())), Path(pair["file_a"]).name, pair["file_a"],
        )
        extraction_b = ArtifactExtraction(
            pair["file_b"], pair["language_b"], "file", code_b,
            1, max(1, len(code_b.splitlines())), Path(pair["file_b"]).name, pair["file_b"],
        )
        bundle = compute_similarity_bundle(extraction_a, extraction_b)
        records.append({**pair, "score": bundle["similarity_score"], "clone_type": bundle["clone_type"]})
    return records


class TestEnterpriseAccuracy:

    def test_zero_false_positives_at_decision_threshold(self, enterprise_records):
        """No negative pair may reach the case-opening threshold (was 70% FPR
        before calibration)."""
        offenders = [r["id"] for r in enterprise_records
                     if not r["is_clone"] and r["score"] >= ENTERPRISE_DECISION_THRESHOLD]
        assert offenders == []

    def test_full_recall_on_t1_t2_t3_at_decision_threshold(self, enterprise_records):
        """Every Type-1/2/3 clone must clear the decision threshold."""
        missed = [r["id"] for r in enterprise_records
                  if r["category"] in ("t1", "t2", "t3")
                  and r["score"] < ENTERPRISE_DECISION_THRESHOLD]
        assert missed == []

    def test_review_threshold_false_positive_rate_bounded(self, enterprise_records):
        """The match-persistence gate may not regress past ~12% FPR (measured
        2/17 negatives at 0.88; was 17/17 at the old 0.68)."""
        negatives = [r for r in enterprise_records if not r["is_clone"]]
        false_positives = [r for r in negatives if r["score"] >= ENTERPRISE_REVIEW_THRESHOLD]
        assert len(false_positives) <= 2, [r["id"] for r in false_positives]

    def test_negatives_never_labeled_as_clone_type(self, enterprise_records):
        """classify_clone must label every negative 'suspicious_similarity'
        (before calibration 5/7 hard negatives were labeled semantic_clone)."""
        mislabeled = [(r["id"], r["clone_type"]) for r in enterprise_records
                      if not r["is_clone"] and r["clone_type"] != "suspicious_similarity"]
        assert mislabeled == []

    def test_t1_t2_labeled_as_concrete_clone_types(self, enterprise_records):
        """T1/T2 pairs must receive a concrete clone-type label, never the
        low-confidence fallback."""
        weak = [(r["id"], r["clone_type"]) for r in enterprise_records
                if r["category"] in ("t1", "t2")
                and r["clone_type"] not in ("type_1_exact", "type_2_renamed", "type_3_structural")]
        assert weak == []


# ---------------------------------------------------------------------------
# Pairwise engine (AI stubbed to 0.0 — non-AI signals only)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def pairwise_records():
    import backend.engine.clone_detector as clone_detector_module
    from backend.engine.clone_detector import get_detector
    from backend.services.analysis_service import analyze_similarities

    class _StubAnalyzer:
        def analyze_similarity(self, code1, code2):
            return 0.0

    original = clone_detector_module.get_ai_analyzer
    clone_detector_module.get_ai_analyzer = lambda: _StubAnalyzer()
    try:
        records = []
        for pair in load_pairs():
            if "pairwise" not in pair["engines"]:
                continue
            code_a, code_b = read_sources(pair)
            detector = get_detector(pair["language_a"])
            result = analyze_similarities(detector, code_a, code_b)
            assert "error" not in result, f"{pair['id']}: {result.get('error')}"
            records.append({**pair, "result": result})
        return records
    finally:
        clone_detector_module.get_ai_analyzer = original


class TestPairwiseAccuracy:

    def test_exact_flag_fires_on_all_t1_and_only_t1(self, pairwise_records):
        """Type-1 clones (comment/whitespace-only changes) must all raise the
        exact-clone flag (0/11 before the comment-stripped comparison); the
        flag must never fire on renamed copies or negatives."""
        missed = [r["id"] for r in pairwise_records
                  if r["category"] == "t1" and not r["result"]["exact_clone_result"]]
        spurious = [r["id"] for r in pairwise_records
                    if r["category"] != "t1" and r["result"]["exact_clone_result"]]
        assert missed == []
        assert spurious == []

    def test_semantic_flag_never_fires_with_stubbed_ai(self, pairwise_records):
        """With the AI score stubbed to 0.0 the semantic flag must stay off —
        guards against the threshold direction being inverted."""
        fired = [r["id"] for r in pairwise_records if r["result"]["semantic_clone_result"]]
        assert fired == []

    def test_non_ai_combined_separates_t1_t2_from_negatives(self, pairwise_records):
        """Even without the AI signal (0.85 of the weight remains), every
        T1/T2 clone must outscore every negative pair."""
        clone_scores = [r["result"]["combined_similarity"] for r in pairwise_records
                        if r["category"] in ("t1", "t2")]
        negative_scores = [r["result"]["combined_similarity"] for r in pairwise_records
                           if not r["is_clone"]]
        assert min(clone_scores) > max(negative_scores)

    def test_all_clone_flags_quiet_on_negatives(self, pairwise_records):
        """After per-flag calibration (evaluation/: driver thresholds raised so
        each flag clears the highest negative value), EVERY pairwise clone flag
        must fire on 0 negatives on the dataset. Before calibration several fired
        on 40-82% of unrelated pairs — the flags are now trustworthy 'detected'
        indicators, not noise."""
        flags = [
            "exact_clone_result", "near_miss_clone_result", "parameterized_clone_result",
            "function_clone_result", "non_contiguous_clone_result", "structural_clone_result",
            "reordered_clone_result", "function_reordered_clone_result",
            "gapped_clone_result", "intertwined_clone_result", "semantic_clone_result",
        ]
        offenders = {
            flag: [r["id"] for r in pairwise_records if not r["is_clone"] and r["result"][flag]]
            for flag in flags
        }
        offenders = {f: ids for f, ids in offenders.items() if ids}
        assert offenders == {}, f"flags firing on negatives: {offenders}"

    def test_calibrated_flags_still_catch_clones(self, pairwise_records):
        """Calibration must not gut recall: each recalibrated flag should still
        fire on a majority of the exact/near-miss (t1/t2) positives."""
        t1t2 = [r for r in pairwise_records if r["category"] in ("t1", "t2")]
        for flag in ("function_clone_result", "reordered_clone_result", "structural_clone_result"):
            hit = sum(1 for r in t1t2 if r["result"][flag])
            assert hit >= len(t1t2) * 0.5, f"{flag}: only {hit}/{len(t1t2)}"

    def test_java_comment_stripping_works(self):
        """Java comments use line_comment/block_comment grammar nodes; the
        stripped token text of commented vs uncommented Java must be equal
        (it never was before the node-type fix)."""
        from backend.engine.clone_detector import get_detector

        detector = get_detector("java")
        plain = "class A { int x = 1; }"
        commented = "// header\nclass A { /* note */ int x = 1; }"
        assert (
            detector.remove_comments_and_whitespace(plain)
            == detector.remove_comments_and_whitespace(commented)
        )


# ---------------------------------------------------------------------------
# Held-out (train/test-split) generalization evidence — AI-inclusive, recorded
# ---------------------------------------------------------------------------

class TestHoldoutEvidence:
    """Pins the recorded held-out generalization from the last AI-enabled
    ``python evaluation/run_eval.py``: the operating threshold is chosen on a
    deterministic stratified TRAIN split and measured on a disjoint TEST split.
    Reads the committed ``metrics.json`` so CI needs no model load, while still
    guarding that the recalibration evidence exists and clears the bar
    (precision 1.0, zero false positives, recall >= 0.8 on unseen pairs)."""

    @pytest.fixture(scope="class")
    def metrics(self):
        path = RESULTS_DIR / "metrics.json"
        if not path.exists():
            pytest.skip("evaluation/results/metrics.json not generated")
        return json.loads(path.read_text(encoding="utf-8"))

    def _holdout(self, metrics, engine):
        engines = metrics.get("engines", {})
        if engine not in engines or "holdout" not in engines[engine]:
            pytest.skip(f"{engine} holdout not present in metrics.json")
        return engines[engine]["holdout"]

    def test_pairwise_holdout_generalizes_zero_fp(self, metrics):
        holdout = self._holdout(metrics, "pairwise")
        test = holdout["test_at_threshold"]
        assert holdout["train_pairs"] > holdout["test_pairs"]  # a real split
        assert holdout["test_pairs"] >= 10
        assert test["fp"] == 0 and test["precision"] == 1.0, test
        assert test["recall"] >= 0.8, test

    def test_enterprise_holdout_generalizes_zero_fp(self, metrics):
        holdout = self._holdout(metrics, "enterprise")
        test = holdout["test_at_threshold"]
        assert test["fp"] == 0 and test["precision"] == 1.0, test
        assert test["recall"] >= 0.8, test
