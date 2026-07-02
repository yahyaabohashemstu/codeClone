"""Generate the labeled clone-detection evaluation dataset.

Produces, deterministically (no randomness):

* ``dataset/variants/generated/t1_*``  -- Type-1 clones: identical code with
  added comments and blank lines (whitespace/comment-only changes).
* ``dataset/variants/generated/t2_*``  -- Type-2 clones: systematically renamed
  identifiers via hand-curated, word-boundary rename maps.
* ``dataset/manifest.json``            -- every labeled pair (generated T1/T2,
  hand-written T3/T4/cross-language variants, hard negatives, easy negatives).

Hand-written files under ``dataset/variants`` and ``dataset/negatives`` are
inputs, not outputs -- the generator only registers them in the manifest.

Run from the repo root:  python evaluation/generate_dataset.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
SEEDS_DIR = DATASET_DIR / "seeds"
GENERATED_DIR = DATASET_DIR / "variants" / "generated"

COMMENT_PREFIX = {"python": "#", "javascript": "//", "java": "//"}

# Type-1 headers must be COMMENTS only (a Python docstring is a string
# statement, i.e. real code, and would make the pair Type-1-impure).
HEADER = {
    "python": "# Utility module (reviewed 2026).\n# Implementation notes below.\n\n",
    "javascript": "/* Utility module (reviewed 2026). */\n// Implementation notes below.\n\n",
    "java": "/* Utility module (reviewed 2026). */\n// Implementation notes below.\n\n",
}

SEEDS: dict[str, str] = {
    "python/binary_search.py": "python",
    "python/lru_cache.py": "python",
    "python/csv_stats.py": "python",
    "python/slugify.py": "python",
    "python/matrix_ops.py": "python",
    "python/task_scheduler.py": "python",
    "javascript/debounce.js": "javascript",
    "javascript/group_by.js": "javascript",
    "javascript/event_emitter.js": "javascript",
    "java/StringCalculator.java": "java",
    "java/BankAccount.java": "java",
}

# Hand-curated identifier rename maps (applied with \b word boundaries).
RENAMES: dict[str, dict[str, str]] = {
    "python/binary_search.py": {
        "binary_search": "bsearch_idx", "items": "arr", "target": "key_val",
        "low": "lo", "high": "hi", "mid": "m", "value": "cur",
        "insert_position": "bisect_left_idx", "contains": "has_key",
    },
    "python/lru_cache.py": {
        "LRUCache": "RecentMap", "capacity": "limit", "entries": "data",
        "hits": "hit_count", "misses": "miss_count", "key": "k", "value": "v",
        "stats": "metrics", "total": "n", "ratio": "rate",
    },
    "python/csv_stats.py": {
        "parse_rows": "read_table", "text": "raw", "delimiter": "sep",
        "rows": "table", "line": "ln", "cell": "field",
        "column_values": "col_nums", "index": "col", "values": "nums",
        "row": "rec", "summarize_column": "col_summary", "total": "acc",
    },
    "python/slugify.py": {
        "ALLOWED": "SAFE_CHARS", "slugify": "to_slug", "title": "heading",
        "separator": "sep", "slug_chars": "out",
        "previous_was_separator": "prev_sep", "char": "ch", "slug": "s",
        "truncate_slug": "clip_slug", "max_length": "limit", "cut": "head",
        "unique_slug": "ensure_unique", "candidate": "base_slug",
        "existing": "used", "counter": "n",
    },
    "python/matrix_ops.py": {
        "identity": "eye", "size": "n", "matrix": "grid",
        "row_index": "r", "col_index": "c", "row": "line_vals",
        "transpose": "flip", "rows": "height", "cols": "width",
        "result": "out", "new_row": "col_line", "multiply": "matmul",
        "rows_a": "h_left", "cols_a": "w_left", "cols_b": "w_right",
        "total": "acc",
    },
    "python/task_scheduler.py": {
        "TaskScheduler": "JobQueue", "_heap": "_pq", "_counter": "_seq",
        "completed": "done", "add_task": "enqueue", "name": "job_name",
        "priority": "prio", "depends_on": "prereqs", "entry": "item",
        "_dependencies_met": "_ready", "run_next": "pop_ready",
        "deferred": "parked", "result": "picked", "run_all": "drain",
        "order": "sequence", "dep": "req",
    },
    "javascript/debounce.js": {
        "debounce": "defer", "fn": "callback", "waitMs": "delay",
        "timer": "timeoutId", "debounced": "wrapper", "args": "rest",
        "throttle": "rateLimit", "intervalMs": "windowMs",
        "lastCall": "prevTs", "pending": "queued", "throttled": "limited",
        "now": "ts", "remaining": "waitLeft",
    },
    "javascript/group_by.js": {
        "groupBy": "collectBy", "items": "list", "keyFn": "getKey",
        "groups": "out", "item": "entry", "key": "k",
        "countBy": "totalsBy", "counts": "sums", "partition": "split",
        "predicate": "test", "matched": "yes", "rest": "no",
    },
    "javascript/event_emitter.js": {
        "EventEmitter": "PubSub", "listeners": "channels",
        "eventName": "topic", "handler": "fn", "handlers": "fns",
        "index": "pos", "once": "onceOnly", "wrapper": "proxy",
        "emit": "publish", "args": "payload",
    },
    "java/StringCalculator.java": {
        "StringCalculator": "T2AddingMachine", "input": "expr",
        "numbers": "values", "total": "sum", "number": "n",
        "parse": "split", "body": "payload", "delimiter": "sep",
        "newline": "nl", "part": "chunk",
    },
    "java/BankAccount.java": {
        "BankAccount": "T2LedgerAccount", "owner": "holder",
        "balanceCents": "cents", "transactions": "entries",
        "openingBalanceCents": "startCents", "amountCents": "delta",
        "deposit": "addFunds", "withdraw": "removeFunds",
        "getBalanceCents": "balance", "statement": "entriesCopy",
    },
}


def make_t1(source: str, language: str) -> str:
    """Type-1 variant: same code, extra comments and blank lines only."""
    marker = COMMENT_PREFIX[language]
    out_lines: list[str] = []
    for line in source.splitlines():
        stripped = line.rstrip()
        # Annotate block openers; safe because no seed line ending in ':' or
        # '{' terminates inside a string literal.
        if stripped.endswith(":") and language == "python":
            out_lines.append(f"{stripped}  {marker} step")
        elif stripped.endswith("{") and language in ("javascript", "java"):
            out_lines.append(f"{stripped} {marker} step")
        else:
            out_lines.append(line)
        if stripped.endswith((":", "{")):
            out_lines.append("")
    return HEADER[language] + "\n".join(out_lines) + "\n"


def make_t2(source: str, renames: dict[str, str]) -> str:
    """Type-2 variant: systematic identifier renaming (word boundaries)."""
    result = source
    # Longest-first so e.g. 'rows_a' is replaced before 'rows'.
    for old in sorted(renames, key=len, reverse=True):
        result = re.sub(rf"\b{re.escape(old)}\b", renames[old], result)
    return result


def variant_name(rel_path: str, kind: str) -> str:
    stem = Path(rel_path).name
    if stem[0].isupper():  # Java-style: T1StringCalculator.java
        return f"{kind.upper()}{stem}"
    return f"{kind}_{stem}"


def generate() -> list[dict]:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    pairs: list[dict] = []

    def add_pair(pair_id, category, is_clone, file_a, file_b, lang_a, lang_b, engines):
        pairs.append({
            "id": pair_id, "category": category, "is_clone": is_clone,
            "file_a": file_a, "file_b": file_b,
            "language_a": lang_a, "language_b": lang_b, "engines": engines,
        })

    both = ["pairwise", "enterprise"]

    # -- Generated T1 / T2 positives -------------------------------------
    for rel_path, language in SEEDS.items():
        seed_file = SEEDS_DIR / rel_path
        source = seed_file.read_text(encoding="utf-8")
        seed_key = Path(rel_path).stem.lower()

        t1_name = variant_name(rel_path, "t1")
        (GENERATED_DIR / t1_name).write_text(make_t1(source, language), encoding="utf-8")
        add_pair(f"t1_{seed_key}_{language}", "t1", True,
                 f"seeds/{rel_path}", f"variants/generated/{t1_name}",
                 language, language, both)

        t2_name = variant_name(rel_path, "t2")
        (GENERATED_DIR / t2_name).write_text(make_t2(source, RENAMES[rel_path]), encoding="utf-8")
        add_pair(f"t2_{seed_key}_{language}", "t2", True,
                 f"seeds/{rel_path}", f"variants/generated/{t2_name}",
                 language, language, both)

    # -- Hand-written T3 (near-miss: renamed + statements changed) -------
    t3 = [
        ("python/binary_search.py", "variants/t3_binary_search.py", "python"),
        ("python/lru_cache.py", "variants/t3_lru_cache.py", "python"),
        ("python/slugify.py", "variants/t3_slugify.py", "python"),
        ("javascript/debounce.js", "variants/t3_debounce.js", "javascript"),
        ("javascript/group_by.js", "variants/t3_group_by.js", "javascript"),
        ("java/BankAccount.java", "variants/T3SavingsAccount.java", "java"),
    ]
    for seed_rel, variant_rel, language in t3:
        add_pair(f"t3_{Path(seed_rel).stem.lower()}_{language}", "t3", True,
                 f"seeds/{seed_rel}", variant_rel, language, language, both)

    # -- Hand-written T4 (same behaviour, different implementation) ------
    t4 = [
        ("python/binary_search.py", "variants/t4_binary_search.py", "python"),
        ("python/matrix_ops.py", "variants/t4_matrix_ops.py", "python"),
        ("python/slugify.py", "variants/t4_slugify.py", "python"),
        ("javascript/group_by.js", "variants/t4_group_by.js", "javascript"),
        ("java/StringCalculator.java", "variants/T4StreamCalculator.java", "java"),
    ]
    for seed_rel, variant_rel, language in t4:
        add_pair(f"t4_{Path(seed_rel).stem.lower()}_{language}", "t4", True,
                 f"seeds/{seed_rel}", variant_rel, language, language, both)

    # -- Cross-language ports (enterprise engine only) --------------------
    add_pair("xlang_binary_search", "xlang", True,
             "seeds/python/binary_search.py", "variants/xlang_binary_search.js",
             "python", "javascript", ["enterprise"])
    add_pair("xlang_group_by", "xlang", True,
             "seeds/javascript/group_by.js", "variants/xlang_group_by.py",
             "javascript", "python", ["enterprise"])

    # -- Hard negatives (same domain/shape, different task) ---------------
    hard = [
        ("python/binary_search.py", "negatives/hard_merge_sorted.py", "python"),
        ("python/lru_cache.py", "negatives/hard_bounded_stack.py", "python"),
        ("python/csv_stats.py", "negatives/hard_log_parser.py", "python"),
        ("python/slugify.py", "negatives/hard_password_strength.py", "python"),
        ("javascript/debounce.js", "negatives/hard_memoize.js", "javascript"),
        ("javascript/event_emitter.js", "negatives/hard_state_machine.js", "javascript"),
        ("java/BankAccount.java", "negatives/HardTemperatureLogger.java", "java"),
    ]
    for seed_rel, negative_rel, language in hard:
        add_pair(f"hard_{Path(seed_rel).stem.lower()}_{language}", "hard_negative",
                 False, f"seeds/{seed_rel}", negative_rel, language, language, both)

    # -- Easy negatives (unrelated seeds, same language) -------------------
    easy = [
        ("python/binary_search.py", "python/csv_stats.py"),
        ("python/lru_cache.py", "python/slugify.py"),
        ("python/matrix_ops.py", "python/task_scheduler.py"),
        ("python/binary_search.py", "python/matrix_ops.py"),
        ("python/csv_stats.py", "python/task_scheduler.py"),
        ("python/slugify.py", "python/binary_search.py"),
        ("javascript/debounce.js", "javascript/group_by.js"),
        ("javascript/event_emitter.js", "javascript/debounce.js"),
        ("javascript/group_by.js", "javascript/event_emitter.js"),
        ("java/StringCalculator.java", "java/BankAccount.java"),
    ]
    for rel_a, rel_b in easy:
        language = SEEDS[rel_a]
        pair_id = f"easy_{Path(rel_a).stem.lower()}_vs_{Path(rel_b).stem.lower()}"
        add_pair(pair_id, "easy_negative", False,
                 f"seeds/{rel_a}", f"seeds/{rel_b}", language, language, both)

    return pairs


def main() -> None:
    pairs = generate()
    manifest = {"version": 1, "pair_count": len(pairs), "pairs": pairs}
    manifest_path = DATASET_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    by_category: dict[str, int] = {}
    for pair in pairs:
        by_category[pair["category"]] = by_category.get(pair["category"], 0) + 1
    print(f"Wrote {manifest_path} with {len(pairs)} pairs: {by_category}")


if __name__ == "__main__":
    main()
