# Detection accuracy report

Dataset: 52 labeled pairs (positives: t1/t2/t3/t4/xlang; negatives: hard/easy). GraphCodeBERT: enabled.

## Engine: pairwise

Pairs evaluated: 50

### Operating points

| point | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| production_default_0.8 | 0.8 | 0.9375 | 0.9091 | 0.9231 | 0.1176 | 30 | 2 | 3 | 15 |
| best_f1 | 0.825 | 0.9677 | 0.9091 | 0.9375 | 0.0588 | 30 | 1 | 3 | 16 |
| best_recall_at_zero_fp | 0.83 | 1.0 | 0.8788 | 0.9355 | 0.0 | 29 | 0 | 4 | 17 |

### Per-category detection

| category | pairs | score_min | score_mean | score_max | detected_at_default_0.80 | detected_at_0.70 | detected_at_0.60 |
|---|---|---|---|---|---|---|---|
| easy_negative | 10 | 0.7106 | 0.7459 | 0.8097 | 1/10 | 10/10 | 10/10 |
| hard_negative | 7 | 0.76 | 0.7814 | 0.8267 | 1/7 | 7/7 | 7/7 |
| t1 | 11 | 0.9381 | 0.9571 | 0.965 | 11/11 | 11/11 | 11/11 |
| t2 | 11 | 0.9463 | 0.9587 | 0.9746 | 11/11 | 11/11 | 11/11 |
| t3 | 6 | 0.8387 | 0.8896 | 0.9325 | 6/6 | 6/6 | 6/6 |
| t4 | 5 | 0.6797 | 0.7765 | 0.8624 | 2/5 | 4/5 | 5/5 |

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
| semantic_clone_result | 0.485 | 0.0 |

### Misclassifications at production default (0.8)

False negatives (3): [{'id': 't4_matrix_ops_python', 'category': 't4', 'score': 0.6797}, {'id': 't4_binary_search_python', 'category': 't4', 'score': 0.7369}, {'id': 't4_group_by_javascript', 'category': 't4', 'score': 0.7756}]

False positives (2): [{'id': 'hard_lru_cache_python', 'category': 'hard_negative', 'score': 0.8267}, {'id': 'easy_matrix_ops_vs_task_scheduler', 'category': 'easy_negative', 'score': 0.8097}]

## Engine: enterprise

Pairs evaluated: 52

### Operating points

| point | threshold | precision | recall | f1 | fpr | tp | fp | fn | tn |
|---|---|---|---|---|---|---|---|---|---|
| review_threshold_0.88 | 0.88 | 0.9375 | 0.8571 | 0.8955 | 0.1176 | 30 | 2 | 5 | 15 |
| decision_threshold_0.91 | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |
| best_f1 | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |
| best_recall_at_zero_fp | 0.91 | 1.0 | 0.8571 | 0.9231 | 0.0 | 30 | 0 | 5 | 17 |

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
