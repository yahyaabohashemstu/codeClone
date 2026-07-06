# Detection accuracy report

Dataset: 52 labeled pairs (positives: t1/t2/t3/t4/xlang; negatives: hard/easy). UniXcoder: enabled.

## Engine: pairwise

Pairs evaluated: 50

### Operating points

| point | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| production_default_0.8 | 0.8 | 1.0 | 0.9091 | 0.9524 | 0.0 | 30 | 0 | 3 | 17 |
| best_f1 | 0.825 | 1.0 | 0.9091 | 0.9524 | 0.0 | 30 | 0 | 3 | 17 |
| best_recall_at_zero_fp | 0.78 | 1.0 | 0.9091 | 0.9524 | 0.0 | 30 | 0 | 3 | 17 |

### Held-out validation (threshold chosen on train, measured on test)

Deterministic stratified split: **31 train / 19 test**. Zero-FP operating threshold picked on the train split only: **0.78**. The test row is the honest generalization estimate (not an in-sample fit).

| split | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| train | 0.78 | 1.0 | 0.9048 | 0.95 | 0.0 | 19 | 0 | 2 | 10 |
| test (holdout) | 0.78 | 1.0 | 0.9167 | 0.9565 | 0.0 | 11 | 0 | 1 | 7 |

### Per-category detection

| category | pairs | score_min | score_mean | score_max | detected_at_default_0.80 | detected_at_0.70 | detected_at_0.60 |
|---|---|---|---|---|---|---|---|
| easy_negative | 10 | 0.6266 | 0.6762 | 0.7323 | 0/10 | 2/10 | 10/10 |
| hard_negative | 7 | 0.7025 | 0.736 | 0.7783 | 0/7 | 7/7 | 7/7 |
| t1 | 11 | 0.9108 | 0.9522 | 0.9606 | 11/11 | 11/11 | 11/11 |
| t2 | 11 | 0.9208 | 0.9389 | 0.9591 | 11/11 | 11/11 | 11/11 |
| t3 | 6 | 0.8278 | 0.8674 | 0.9156 | 6/6 | 6/6 | 6/6 |
| t4 | 5 | 0.6947 | 0.7698 | 0.8504 | 2/5 | 3/5 | 5/5 |

### Clone-flag fire rates (share of pairs where the flag is true)

| flag | on_positives | on_negatives |
|---|---|---|
| exact_clone_result | 0.333 | 0.0 |
| near_miss_clone_result | 0.848 | 0.0 |
| parameterized_clone_result | 0.788 | 0.0 |
| function_clone_result | 0.818 | 0.0 |
| non_contiguous_clone_result | 0.788 | 0.0 |
| structural_clone_result | 0.818 | 0.0 |
| reordered_clone_result | 0.848 | 0.0 |
| function_reordered_clone_result | 0.818 | 0.0 |
| gapped_clone_result | 0.667 | 0.0 |
| intertwined_clone_result | 0.576 | 0.0 |
| semantic_clone_result | 0.758 | 0.0 |

### Misclassifications at production default (0.8)

False negatives (3): [{'id': 't4_binary_search_python', 'category': 't4', 'score': 0.6947}, {'id': 't4_matrix_ops_python', 'category': 't4', 'score': 0.6989}, {'id': 't4_group_by_javascript', 'category': 't4', 'score': 0.774}]

False positives (0): []

## Engine: enterprise

Pairs evaluated: 52

### Operating points

| point | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| review_threshold_0.88 | 0.88 | 0.9375 | 0.8571 | 0.8955 | 0.1176 | 30 | 2 | 5 | 15 |
| decision_threshold_0.91 | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |
| best_f1 | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |
| best_recall_at_zero_fp | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |

### Held-out validation (threshold chosen on train, measured on test)

Deterministic stratified split: **32 train / 20 test**. Zero-FP operating threshold picked on the train split only: **0.91**. The test row is the honest generalization estimate (not an in-sample fit).

| split | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| train | 0.91 | 1.0 | 0.8636 | 0.9268 | 0.0 | 19 | 0 | 3 | 10 |
| test (holdout) | 0.91 | 1.0 | 0.8462 | 0.9167 | 0.0 | 11 | 0 | 2 | 7 |

### Per-category detection

| category | pairs | score_min | score_mean | score_max | detected_at_review_0.68 | detected_at_decision_0.78 |
|---|---|---|---|---|---|---|
| easy_negative | 10 | 0.7632 | 0.7992 | 0.8744 | 0/10 | 0/10 |
| hard_negative | 7 | 0.8079 | 0.8503 | 0.906 | 2/7 | 0/7 |
| t1 | 11 | 0.9876 | 0.9893 | 0.9909 | 11/11 | 11/11 |
| t2 | 11 | 0.929 | 0.985 | 1.0 | 11/11 | 11/11 |
| t3 | 6 | 0.9143 | 0.9446 | 0.9731 | 6/6 | 6/6 |
| t4 | 5 | 0.7628 | 0.8377 | 0.9161 | 2/5 | 2/5 |
| xlang | 2 | 0.7748 | 0.776 | 0.7773 | 0/2 | 0/2 |

### classify_clone label distribution per category

- **t1**: {'type_2_renamed': 11}
- **t2**: {'type_2_renamed': 8, 'type_3_structural': 3}
- **t3**: {'type_3_structural': 5, 'semantic_clone': 1}
- **t4**: {'suspicious_similarity': 5}
- **xlang**: {'suspicious_similarity': 2}
- **hard_negative**: {'suspicious_similarity': 7}
- **easy_negative**: {'suspicious_similarity': 10}

### Misclassifications at production default (0.91)

False negatives (5): [{'id': 't4_group_by_javascript', 'category': 't4', 'score': 0.7628}, {'id': 'xlang_group_by', 'category': 'xlang', 'score': 0.7748}, {'id': 'xlang_binary_search', 'category': 'xlang', 'score': 0.7773}, {'id': 't4_matrix_ops_python', 'category': 't4', 'score': 0.7981}, {'id': 't4_binary_search_python', 'category': 't4', 'score': 0.7984}]

False positives (0): []
