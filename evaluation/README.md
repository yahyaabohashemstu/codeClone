# Detection-accuracy evaluation

This directory holds the labeled evaluation dataset and the measurement harness
used to calibrate CodeClone's two detection stacks with evidence instead of
hand-picked thresholds. It answers, with numbers: *if this tool flags a pair as
a clone, how likely is that to be true?*

## Layout

```
evaluation/
  generate_dataset.py     # regenerates T1/T2 variants + manifest.json (deterministic)
  run_eval.py             # measurement harness (see --help)
  dataset/
    seeds/                # hand-written original programs (python/, javascript/, java/)
    variants/             # hand-written T3/T4/cross-language variants
    variants/generated/   # T1 (comments/whitespace) + T2 (renamed) — generated
    negatives/            # hand-written hard negatives
    manifest.json         # every labeled pair
  results/                # metrics.json + report.md (written by run_eval.py)
```

## Pair categories

| Category | Meaning | Label |
|---|---|---|
| `t1` | Type-1: identical code, only comments/whitespace differ | clone |
| `t2` | Type-2: systematically renamed identifiers | clone |
| `t3` | Type-3: renamed + statements added/removed/modified | clone |
| `t4` | Type-4: same behaviour, structurally different implementation | clone |
| `xlang` | Same logic ported across languages (enterprise engine only) | clone |
| `hard_negative` | Same domain and shape (e.g. two capacity-bounded container classes), genuinely different task | not a clone |
| `easy_negative` | Unrelated programs in the same language | not a clone |

Hard negatives are the pairs that matter most: they model the situation where
two students solve *different* problems with similar boilerplate — the main
source of false accusations.

## Engines measured

* **pairwise** — `analyze_similarities` (the `/api/v1/analysis` and CI-gate
  path): text/token/graph metrics + GraphCodeBERT, combined score, and the 11
  boolean clone flags.
* **enterprise** — `compute_similarity_bundle` (the repository-scan path):
  feature-hash "semantic" cosine + token overlap + structural score.
  Comparison is file-level (one file-kind `ArtifactExtraction` per file);
  scan-time block extraction is not exercised.

## Running

```bash
python evaluation/generate_dataset.py     # only needed after editing seeds/renames
python evaluation/run_eval.py             # both engines, GraphCodeBERT enabled
python evaluation/run_eval.py --no-ai     # fast run without the ML model
```

Outputs land in `results/metrics.json` (full sweep + per-pair records) and
`results/report.md` (human-readable summary).

## Interpreting the report

* **Operating points** — precision/recall/F1/FPR at the production defaults,
  plus the best-F1 threshold and the highest-recall threshold with zero false
  positives on this dataset.
* **Per-category detection** — recall per clone type; expect t1/t2 ≈ 100%,
  t3 high, t4 substantially lower (semantic clones are genuinely hard).
* **Clone-flag fire rates** — a flag that fires on most *negatives* provides
  no evidence and should not be shown to users as "detected".

## Caveats

* 52 pairs is a calibration set, not a benchmark: good for exposing gross
  miscalibration and pinning regressions, too small for precise
  precision/recall claims. Extend it before quoting numbers in marketing.
* Dataset files are committed; the generator is deterministic, so
  regenerating must not change git state (CI-friendly).
* `tests/backend/test_detection_accuracy.py` pins the headline numbers as a
  regression gate.
