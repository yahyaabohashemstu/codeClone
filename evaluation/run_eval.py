"""Detection-accuracy evaluation harness for Clone Lens.

Runs both detection stacks over the labeled dataset in ``dataset/manifest.json``
and reports precision/recall/F1, a full threshold sweep, per-category recall,
and per-clone-flag fire rates.  This is the evidence base for calibrating the
production thresholds.

Engines measured
----------------
* ``pairwise``    -- backend.services.analysis_service.analyze_similarities
  (the interactive /api/v1/analysis and CI /api/v1/ci/check path), including
  the UniXcoder semantic score unless ``--no-ai`` is given.
* ``enterprise``  -- enterprise_platform.utils.compute_similarity_bundle
  (the repository-scan path).  File-level comparison: each dataset file is
  wrapped in a single file-kind ArtifactExtraction, mirroring the extractor's
  whole-file fallback.  Scan-time block extraction is NOT exercised here.

Usage (from the repo root):
    python evaluation/run_eval.py                 # both engines, AI enabled
    python evaluation/run_eval.py --no-ai         # skip UniXcoder (fast)
    python evaluation/run_eval.py --engine enterprise

Outputs ``evaluation/results/metrics.json`` and ``evaluation/results/report.md``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
RESULTS_DIR = Path(__file__).resolve().parent / "results"

# Production operating points to audit (score scale 0..1).  The enterprise
# values reflect the calibration applied in enterprise_platform/models.py
# (previously 0.68 / 0.78 — see results/report.md for the pre-calibration FPR).
PAIRWISE_DEFAULT_THRESHOLD = 0.80   # CI gate default & history "high" bucket
ENTERPRISE_REVIEW_THRESHOLD = 0.88  # SimilarityMatch persistence gate
ENTERPRISE_DECISION_THRESHOLD = 0.91  # default policy-rule / workspace threshold

PAIRWISE_FLAG_KEYS = [
    "exact_clone_result", "near_miss_clone_result", "parameterized_clone_result",
    "function_clone_result", "non_contiguous_clone_result", "structural_clone_result",
    "reordered_clone_result", "function_reordered_clone_result",
    "gapped_clone_result", "intertwined_clone_result", "semantic_clone_result",
]

POSITIVE_CATEGORIES = ("t1", "t2", "t3", "t4", "xlang")

# Continuous metrics captured for per-flag threshold calibration.
_RAW_METRIC_KEYS = (
    "text_sim", "token_sim", "token_sim_without_comments",
    "token_sim_with_order", "token_sim_with_order_without_comments",
    "renamed_clone_sim", "graph_sim",
)

# Each noisy boolean flag and the continuous metric it thresholds on, so we can
# recommend a threshold that separates positives from negatives on the dataset.
_FLAG_DRIVERS = {
    "function_clone_result": "token_sim_without_comments",       # unordered, comment-free
    "structural_clone_result": "token_sim_with_order",           # ordered
    "reordered_clone_result": "token_sim",                       # unordered
    "parameterized_clone_result": "token_sim_with_order_without_comments",
    "function_reordered_clone_result": "token_sim_without_comments",
}


def flag_calibration(records: list[dict]) -> dict:
    """For each flag with a known continuous driver, report the pos/neg spread of
    that driver and a recommended threshold = just above the highest negative
    (eliminates false positives while keeping as many positives as possible)."""
    out = {}
    pos = [r for r in records if r["is_clone"]]
    neg = [r for r in records if not r["is_clone"]]
    for flag, metric in _FLAG_DRIVERS.items():
        pos_vals = [r["raw"][metric] for r in pos if metric in r.get("raw", {})]
        neg_vals = [r["raw"][metric] for r in neg if metric in r.get("raw", {})]
        if not pos_vals or not neg_vals:
            continue
        neg_max = max(neg_vals)
        recommended = round(min(0.99, neg_max + 0.01), 3)
        kept = sum(1 for v in pos_vals if v > recommended)
        out[flag] = {
            "metric": metric,
            "neg_min": round(min(neg_vals), 3), "neg_max": round(neg_max, 3),
            "pos_min": round(min(pos_vals), 3), "pos_max": round(max(pos_vals), 3),
            "recommended_threshold": recommended,
            "positives_kept_at_recommended": f"{kept}/{len(pos_vals)}",
        }
    return out


def load_manifest() -> list[dict]:
    manifest = json.loads((DATASET_DIR / "manifest.json").read_text(encoding="utf-8"))
    return manifest["pairs"]


def read_pair_sources(pair: dict) -> tuple[str, str]:
    code_a = (DATASET_DIR / pair["file_a"]).read_text(encoding="utf-8")
    code_b = (DATASET_DIR / pair["file_b"]).read_text(encoding="utf-8")
    return code_a, code_b


# ---------------------------------------------------------------------------
# Engine runners
# ---------------------------------------------------------------------------

def install_ai_stub() -> None:
    """Replace UniXcoder with a zero-scoring stub (for --no-ai runs)."""
    import backend.engine.clone_detector as clone_detector_module

    class _StubAnalyzer:
        def analyze_similarity(self, code1, code2):
            return 0.0

    clone_detector_module.get_ai_analyzer = lambda: _StubAnalyzer()


def run_pairwise(pairs: list[dict]) -> list[dict]:
    from backend.engine.clone_detector import get_detector
    from backend.services.analysis_service import analyze_similarities

    records = []
    for index, pair in enumerate(pairs, 1):
        code_a, code_b = read_pair_sources(pair)
        detector = get_detector(pair["language_a"])
        started = time.perf_counter()
        result = analyze_similarities(detector, code_a, code_b)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        if "error" in result:
            print(f"  [{index}/{len(pairs)}] {pair['id']}: ERROR {result['error']}")
            continue
        record = {
            "id": pair["id"],
            "category": pair["category"],
            "is_clone": pair["is_clone"],
            "score": float(result["combined_similarity"]),
            "sub_scores": {
                "text": float(result["text_sim"]),
                "token_unordered": float(result["token_sim"]),
                "token_ordered_renamed": float(result["renamed_clone_sim"]),
                "graph": float(result["graph_sim"]),
                "ai": float(result["ai_similarity_score"]),
            },
            # Continuous drivers behind the boolean flags, for calibration.
            "raw": {k: float(result[k]) for k in _RAW_METRIC_KEYS if k in result},
            "flags": {key: bool(result[key]) for key in PAIRWISE_FLAG_KEYS},
            "elapsed_ms": elapsed_ms,
        }
        records.append(record)
        print(f"  [{index}/{len(pairs)}] {pair['id']}: combined={record['score']:.3f} "
              f"ai={record['sub_scores']['ai']:.3f} ({elapsed_ms} ms)")
    return records


def run_enterprise(pairs: list[dict]) -> list[dict]:
    from enterprise_platform.models import ArtifactExtraction
    from enterprise_platform.utils import compute_similarity_bundle

    def file_extraction(rel_path: str, language: str, source: str) -> ArtifactExtraction:
        line_count = max(1, len(source.splitlines()))
        name = Path(rel_path).name
        return ArtifactExtraction(rel_path, language, "file", source, 1, line_count, name, rel_path)

    records = []
    for pair in pairs:
        code_a, code_b = read_pair_sources(pair)
        extraction_a = file_extraction(pair["file_a"], pair["language_a"], code_a)
        extraction_b = file_extraction(pair["file_b"], pair["language_b"], code_b)
        bundle = compute_similarity_bundle(extraction_a, extraction_b)
        records.append({
            "id": pair["id"],
            "category": pair["category"],
            "is_clone": pair["is_clone"],
            "score": float(bundle["similarity_score"]),
            "sub_scores": {
                "semantic": float(bundle["semantic_score"]),
                "token": float(bundle["token_score"]),
                "structural": float(bundle["structural_score"]),
            },
            "clone_type": bundle["clone_type"],
            "raw_hash_equal": bool(bundle["raw_hash_equal"]),
            "canonical_hash_equal": bool(bundle["canonical_hash_equal"]),
        })
    return records


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def confusion_at(records: list[dict], threshold: float) -> dict:
    tp = sum(1 for r in records if r["is_clone"] and r["score"] >= threshold)
    fp = sum(1 for r in records if not r["is_clone"] and r["score"] >= threshold)
    fn = sum(1 for r in records if r["is_clone"] and r["score"] < threshold)
    tn = sum(1 for r in records if not r["is_clone"] and r["score"] < threshold)
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    return {"threshold": round(threshold, 3), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(f1, 4), "fpr": round(fpr, 4)}


def sweep(records: list[dict]) -> list[dict]:
    return [confusion_at(records, t / 200) for t in range(0, 201)]


def pick_operating_points(sweep_rows: list[dict]) -> dict:
    best_f1 = max(sweep_rows, key=lambda row: (row["f1"], row["threshold"]))
    zero_fp = [row for row in sweep_rows if row["fp"] == 0]
    best_zero_fp = max(zero_fp, key=lambda row: row["recall"]) if zero_fp else None
    return {"best_f1": best_f1, "best_recall_at_zero_fp": best_zero_fp}


def _stable_key(pair_id: str) -> str:
    # Deterministic across runs (unlike the salted built-in hash()), so the
    # train/test split is fully reproducible without an RNG seed.
    return hashlib.sha256(pair_id.encode("utf-8")).hexdigest()


def stratified_split(records: list[dict], test_fraction: float = 0.4) -> tuple[list[dict], list[dict]]:
    """Deterministic, category-stratified train/test split.

    Each category contributes ~``test_fraction`` of its pairs to the test set
    (at least one, but never all), so both splits keep the label mix. Ordering
    within a category is by a stable content hash of the pair id — reproducible
    run to run with no randomness.
    """
    by_cat: dict[str, list[dict]] = {}
    for record in records:
        by_cat.setdefault(record["category"], []).append(record)
    train: list[dict] = []
    test: list[dict] = []
    for _category, rows in sorted(by_cat.items()):
        rows_sorted = sorted(rows, key=lambda r: _stable_key(r["id"]))
        if len(rows_sorted) >= 2:
            n_test = min(max(round(len(rows_sorted) * test_fraction), 1), len(rows_sorted) - 1)
        else:
            n_test = 0  # a singleton category stays in train
        test.extend(rows_sorted[:n_test])
        train.extend(rows_sorted[n_test:])
    return train, test


def evaluate_holdout(records: list[dict], test_fraction: float = 0.4) -> dict:
    """Honest generalization estimate: pick the zero-false-positive operating
    threshold on TRAIN only, then report its performance on the held-out TEST
    split — so the numbers are not an in-sample fit of the same pairs."""
    train, test = stratified_split(records, test_fraction)
    train_ops = pick_operating_points(sweep(train))
    picked = train_ops["best_recall_at_zero_fp"] or train_ops["best_f1"]
    threshold = picked["threshold"]
    return {
        "test_fraction": test_fraction,
        "train_pairs": len(train),
        "test_pairs": len(test),
        "threshold_picked_on_train": threshold,
        "train_at_threshold": confusion_at(train, threshold),
        "test_at_threshold": confusion_at(test, threshold),
    }


def category_stats(records: list[dict], thresholds: dict[str, float]) -> dict:
    stats: dict[str, dict] = {}
    for category in sorted({r["category"] for r in records}):
        rows = [r for r in records if r["category"] == category]
        scores = [r["score"] for r in rows]
        entry = {
            "pairs": len(rows),
            "score_min": round(min(scores), 4),
            "score_mean": round(sum(scores) / len(scores), 4),
            "score_max": round(max(scores), 4),
        }
        for label, threshold in thresholds.items():
            hit = sum(1 for r in rows if r["score"] >= threshold)
            entry[f"detected_at_{label}"] = f"{hit}/{len(rows)}"
        stats[category] = entry
    return stats


def flag_fire_rates(records: list[dict]) -> dict:
    positives = [r for r in records if r["is_clone"]]
    negatives = [r for r in records if not r["is_clone"]]
    rates = {}
    for key in PAIRWISE_FLAG_KEYS:
        pos_rate = sum(1 for r in positives if r["flags"][key]) / len(positives)
        neg_rate = sum(1 for r in negatives if r["flags"][key]) / len(negatives)
        rates[key] = {"positives": round(pos_rate, 3), "negatives": round(neg_rate, 3)}
    return rates


def misclassified(records: list[dict], threshold: float) -> dict:
    false_negatives = sorted(
        ({"id": r["id"], "category": r["category"], "score": round(r["score"], 4)}
         for r in records if r["is_clone"] and r["score"] < threshold),
        key=lambda row: row["score"])
    false_positives = sorted(
        ({"id": r["id"], "category": r["category"], "score": round(r["score"], 4)}
         for r in records if not r["is_clone"] and r["score"] >= threshold),
        key=lambda row: -row["score"])
    return {"false_negatives": false_negatives, "false_positives": false_positives}


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def markdown_table(rows: list[dict], columns: list[str]) -> str:
    header = "| " + " | ".join(columns) + " |"
    divider = "|" + "|".join("---" for _ in columns) + "|"
    body = "\n".join(
        "| " + " | ".join(str(row.get(col, "")) for col in columns) + " |" for row in rows
    )
    return "\n".join([header, divider, body])


def build_report(results: dict, ai_enabled: bool) -> str:
    lines = ["# Detection accuracy report", ""]
    lines.append(f"Dataset: {results['dataset_pairs']} labeled pairs "
                 f"(positives: t1/t2/t3/t4/xlang; negatives: hard/easy). "
                 f"UniXcoder: {'enabled' if ai_enabled else 'DISABLED (--no-ai)'}.")
    lines.append("")
    for engine_name, engine in results["engines"].items():
        lines.append(f"## Engine: {engine_name}")
        lines.append("")
        lines.append(f"Pairs evaluated: {engine['pair_count']}")
        lines.append("")
        lines.append("### Operating points")
        lines.append("")
        rows = []
        for label, data in engine["operating_points"].items():
            if data:
                rows.append({"point": label, **data})
        lines.append(markdown_table(rows, ["point", "threshold", "precision", "recall", "f1", "fpr", "tp", "fp", "fn", "tn"]))
        lines.append("")
        if engine.get("holdout"):
            holdout = engine["holdout"]
            lines.append("### Held-out validation (threshold chosen on train, measured on test)")
            lines.append("")
            lines.append(
                f"Deterministic stratified split: **{holdout['train_pairs']} train / "
                f"{holdout['test_pairs']} test**. Zero-FP operating threshold picked on the "
                f"train split only: **{holdout['threshold_picked_on_train']}**. The test row is "
                f"the honest generalization estimate (not an in-sample fit)."
            )
            lines.append("")
            lines.append(markdown_table([
                {"split": "train", **holdout["train_at_threshold"]},
                {"split": "test (holdout)", **holdout["test_at_threshold"]},
            ], ["split", "threshold", "precision", "recall", "f1", "fpr", "tp", "fp", "fn", "tn"]))
            lines.append("")
        lines.append("### Per-category detection")
        lines.append("")
        cat_rows = [{"category": cat, **data} for cat, data in engine["categories"].items()]
        columns = ["category"] + [c for c in cat_rows[0] if c != "category"]
        lines.append(markdown_table(cat_rows, columns))
        lines.append("")
        if engine.get("flag_fire_rates"):
            lines.append("### Clone-flag fire rates (share of pairs where the flag is true)")
            lines.append("")
            flag_rows = [{"flag": key, "on_positives": val["positives"], "on_negatives": val["negatives"]}
                         for key, val in engine["flag_fire_rates"].items()]
            lines.append(markdown_table(flag_rows, ["flag", "on_positives", "on_negatives"]))
            lines.append("")
        if engine.get("clone_type_by_category"):
            lines.append("### classify_clone label distribution per category")
            lines.append("")
            for category, counts in engine["clone_type_by_category"].items():
                lines.append(f"- **{category}**: {counts}")
            lines.append("")
        mis = engine["misclassified_at_default"]
        lines.append(f"### Misclassifications at production default ({engine['default_threshold']})")
        lines.append("")
        lines.append(f"False negatives ({len(mis['false_negatives'])}): {mis['false_negatives']}")
        lines.append("")
        lines.append(f"False positives ({len(mis['false_positives'])}): {mis['false_positives']}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["pairwise", "enterprise", "both"], default="both")
    parser.add_argument("--no-ai", action="store_true", help="stub out UniXcoder (fast run)")
    args = parser.parse_args()

    if args.no_ai:
        install_ai_stub()

    all_pairs = load_manifest()
    results: dict = {"dataset_pairs": len(all_pairs), "ai_enabled": not args.no_ai, "engines": {}}

    if args.engine in ("pairwise", "both"):
        pairwise_pairs = [p for p in all_pairs if "pairwise" in p["engines"]]
        print(f"Running pairwise engine on {len(pairwise_pairs)} pairs "
              f"(AI {'stubbed' if args.no_ai else 'enabled'})...")
        records = run_pairwise(pairwise_pairs)
        sweep_rows = sweep(records)
        results["engines"]["pairwise"] = {
            "pair_count": len(records),
            "default_threshold": PAIRWISE_DEFAULT_THRESHOLD,
            "operating_points": {
                f"production_default_{PAIRWISE_DEFAULT_THRESHOLD}": confusion_at(records, PAIRWISE_DEFAULT_THRESHOLD),
                **pick_operating_points(sweep_rows),
            },
            "categories": category_stats(records, {
                "default_0.80": PAIRWISE_DEFAULT_THRESHOLD,
                "0.70": 0.70, "0.60": 0.60,
            }),
            "flag_fire_rates": flag_fire_rates(records),
            "flag_calibration": flag_calibration(records),
            "misclassified_at_default": misclassified(records, PAIRWISE_DEFAULT_THRESHOLD),
            "holdout": evaluate_holdout(records),
            "sweep": sweep_rows,
            "records": records,
        }

    if args.engine in ("enterprise", "both"):
        enterprise_pairs = [p for p in all_pairs if "enterprise" in p["engines"]]
        print(f"Running enterprise engine on {len(enterprise_pairs)} pairs...")
        records = run_enterprise(enterprise_pairs)
        sweep_rows = sweep(records)
        clone_type_by_category: dict[str, dict[str, int]] = {}
        for record in records:
            counts = clone_type_by_category.setdefault(record["category"], {})
            counts[record["clone_type"]] = counts.get(record["clone_type"], 0) + 1
        results["engines"]["enterprise"] = {
            "pair_count": len(records),
            "default_threshold": ENTERPRISE_DECISION_THRESHOLD,
            "operating_points": {
                f"review_threshold_{ENTERPRISE_REVIEW_THRESHOLD}": confusion_at(records, ENTERPRISE_REVIEW_THRESHOLD),
                f"decision_threshold_{ENTERPRISE_DECISION_THRESHOLD}": confusion_at(records, ENTERPRISE_DECISION_THRESHOLD),
                **pick_operating_points(sweep_rows),
            },
            "categories": category_stats(records, {
                "review_0.68": ENTERPRISE_REVIEW_THRESHOLD,
                "decision_0.78": ENTERPRISE_DECISION_THRESHOLD,
            }),
            "clone_type_by_category": clone_type_by_category,
            "misclassified_at_default": misclassified(records, ENTERPRISE_DECISION_THRESHOLD),
            "holdout": evaluate_holdout(records),
            "sweep": sweep_rows,
            "records": records,
        }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "metrics.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    report = build_report(results, ai_enabled=not args.no_ai)
    (RESULTS_DIR / "report.md").write_text(report, encoding="utf-8")
    print(f"\nWrote {RESULTS_DIR / 'metrics.json'} and {RESULTS_DIR / 'report.md'}")

    for engine_name, engine in results["engines"].items():
        print(f"\n=== {engine_name} ===")
        for label, point in engine["operating_points"].items():
            if point:
                print(f"  {label}: P={point['precision']} R={point['recall']} "
                      f"F1={point['f1']} FPR={point['fpr']} (t={point['threshold']})")


if __name__ == "__main__":
    main()
