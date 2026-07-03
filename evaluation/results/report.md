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
| semantic_clone_result | 0.0 | 0.0 |

### Misclassifications at production default (0.8)

False negatives (3): [{'id': 't4_binary_search_python', 'category': 't4', 'score': 0.6947}, {'id': 't4_matrix_ops_python', 'category': 't4', 'score': 0.6989}, {'id': 't4_group_by_javascript', 'category': 't4', 'score': 0.774}]

False positives (0): []
