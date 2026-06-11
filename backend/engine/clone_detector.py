"""
Pure analysis engine for code clone detection.

This module contains the CloneDetector class and all supporting logic for
detecting code clones across multiple programming languages.  It is entirely
independent of Flask or any web framework -- it uses only standard-library
logging and third-party analysis libraries.

Dependencies:
    tree_sitter_languages, rapidfuzz, networkx, numpy, torch, transformers,
    radon (Python-only metrics)
"""

import logging
import threading
from collections import Counter

import networkx as nx
import numpy as np
from rapidfuzz import fuzz
from radon.complexity import cc_visit
from radon.metrics import h_visit, mi_visit
from radon.raw import analyze
from tree_sitter_languages import get_parser

logger = logging.getLogger(__name__)


# AIAnalyzer is in backend.engine.ai_analyzer — import the singleton factory
from backend.engine.ai_analyzer import get_ai_analyzer  # noqa: E402


# ---------------------------------------------------------------------------
# CloneDetector
# ---------------------------------------------------------------------------

class CloneDetector:
    """Class for detecting code clones."""

    def __init__(self, language):
        """Initialize CloneDetector with parser for the given language."""
        self.language = language
        self.parser = get_parser(language)

    def parse_code(self, code, with_order=False):
        """Parse code into tokens."""
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node
        tokens = []

        def traverse(node):
            if node.child_count == 0:
                tokens.append(node.type)
            for child in node.children:
                traverse(child)

        traverse(root_node)
        if with_order:
            return tokens
        tokens.sort()
        return tokens

    def remove_comments_and_whitespace(self, code):
        """Remove comments and whitespace from code.

        Note: leaf texts are joined with no separator, so the result is not
        valid source (e.g. ``defadd(a,b):``).  That is acceptable for the
        similarity metrics that consume it — both sides degrade identically —
        but do NOT feed the output to anything expecting parseable code.
        Changing the join to a space would shift every token-based score and
        requires recalibrating the clone thresholds against a labelled corpus.
        """
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node

        def extract_text(node):
            if node.type in ('comment', 'whitespace'):
                return ''
            if node.child_count == 0:
                return node.text.decode('utf8')
            return ''.join([extract_text(child) for child in node.children])

        return extract_text(root_node)

    def text_similarity(self, code1, code2):
        """Compute text similarity between two code snippets."""
        return fuzz.ratio(code1, code2) / 100

    def token_similarity(self, code1, code2, with_order=False):
        """Compute token similarity between two code snippets."""
        tokens1 = self.parse_code(code1, with_order)
        tokens2 = self.parse_code(code2, with_order)
        return fuzz.ratio(' '.join(tokens1), ' '.join(tokens2)) / 100

    def is_exact_clone(self, code1, code2):
        """Check if two code snippets are exact clones."""
        return code1.strip() == code2.strip()

    def renamed_clone_similarity(self, code1, code2):
        """Compute similarity for renamed clones.

        Renamed clones (Type 2) have the same structure but different identifier
        names.  The correct signal is therefore the structural fingerprint produced
        by comparing ordered token *types* -- because tree-sitter emits 'identifier'
        for every user-defined name, two renamed clones yield nearly identical type
        sequences.  Jaccard on identifier *values* was the previous (incorrect)
        approach: renamed clones share *no* identifiers, so it always returned ~0.
        """
        tokens1 = self.parse_code(code1, with_order=True)
        tokens2 = self.parse_code(code2, with_order=True)
        return fuzz.ratio(' '.join(tokens1), ' '.join(tokens2)) / 100

    def near_miss_clone_similarity(self, code1, code2, threshold=0.8,
                                   _text_sim=None, _token_sim=None,
                                   _token_sim_without_comments=None):
        """Check for near miss clones (Type 3 -- minor modifications of a copy).

        Genuine near-miss clones show high similarity across *multiple* independent
        signals.  The previous OR logic (any single metric > threshold) caused false
        positives: two programs that happen to share the same token-type vocabulary
        (e.g. any two Python functions using for/if/return) would fire even though
        they are entirely different algorithms.  Requiring at least 2 out of 3
        signals to exceed the threshold eliminates those accidental matches while
        still catching real near-miss clones (which dominate in all three signals).

        Callers that already computed the three component scores (the analysis
        pipeline does) should pass them in to avoid re-parsing both snippets.
        """
        text_sim = _text_sim if _text_sim is not None else self.text_similarity(code1, code2)
        token_sim = _token_sim if _token_sim is not None else self.token_similarity(code1, code2)
        if _token_sim_without_comments is not None:
            token_sim_without_comments = _token_sim_without_comments
        else:
            token_sim_without_comments = self.token_similarity(
                self.remove_comments_and_whitespace(code1),
                self.remove_comments_and_whitespace(code2)
            )
        conditions_met = sum([
            text_sim > threshold,
            token_sim > threshold,
            token_sim_without_comments > threshold,
        ])
        return conditions_met >= 2

    def parameterized_clone_similarity(self, code1, code2, threshold=0.8,
                                       clean1=None, clean2=None):
        """Check for parameterized clones (Type 3a).

        Parameterized clones share the same structure but differ only in literal
        constant values (numbers, strings).  Because tree-sitter token *types* for
        integer/string literals are uniform ('integer', 'string_literal', etc.),
        the ordered token-type sequence already abstracts away literal values.
        Two codes are parameterized clones when their ordered token-type sequences
        are very similar (same control flow, same call structure) even after
        stripping comments.  We therefore compare ordered token types on the
        comment-free versions, which is more precise than the near-miss check.

        Pass *clean1*/*clean2* when the comment-free sources are already
        available to avoid recomputing them.
        """
        clean1 = clean1 if clean1 is not None else self.remove_comments_and_whitespace(code1)
        clean2 = clean2 if clean2 is not None else self.remove_comments_and_whitespace(code2)
        return self.token_similarity(clean1, clean2, with_order=True) > threshold

    def function_clone_similarity(self, code1, code2, threshold=0.8,
                                  clean1=None, clean2=None):
        """Check for function-level clones.

        Function clones are detected by comparing the unordered token-type
        multisets of both snippets after comment removal.  Using the unordered
        (bag-of-tokens) form means that functions with the same vocabulary of
        constructs but slightly different arrangement still match, which is
        appropriate for function-level granularity where statement reordering
        is common.  This is distinct from near-miss (which uses raw text/tokens
        with comments) and from structural clones (ordered comparison).
        """
        clean1 = clean1 if clean1 is not None else self.remove_comments_and_whitespace(code1)
        clean2 = clean2 if clean2 is not None else self.remove_comments_and_whitespace(code2)
        return self.token_similarity(clean1, clean2, with_order=False) > threshold

    def non_contiguous_clone_similarity(self, code1, code2, threshold=0.85):
        """Check for non-contiguous clones.

        Non-contiguous clones share matching code segments scattered at different
        positions.  Both ordered and unordered token similarity must be high: the
        ordered score confirms that the same sequence of constructs appears somewhere,
        and the unordered score confirms the same vocabulary.  Requiring BOTH signals
        and a higher threshold (0.85) avoids false positives from programs that
        merely share common constructs without being genuine copies.
        """
        token_sim_without_order = self.token_similarity(code1, code2, with_order=False)
        token_sim_with_order = self.token_similarity(code1, code2, with_order=True)
        return token_sim_without_order > threshold and token_sim_with_order > threshold

    def structural_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for structural clones."""
        return self.token_similarity(code1, code2, with_order=True) > threshold

    def reordered_clone_similarity(self, code1, code2, threshold=0.85):
        """Check for reordered clones.

        Reordered clones have the same token vocabulary but in a different order
        (e.g. helper methods defined before vs after the main logic).  Unordered
        token-type similarity measures this well, but at 0.80 the threshold is too
        low for token *types* alone -- any two same-language programs share common
        types (identifiers, operators, keywords).  0.85 reduces false positives.
        """
        return self.token_similarity(code1, code2, with_order=False) > threshold

    def function_reordered_clone_similarity(self, code1, code2, threshold=0.85,
                                            clean1=None, clean2=None):
        """Check for function reordered clones.

        Same as reordered clone but applied at function granularity: functions whose
        internal statements are rearranged but use the same constructs.  Uses the
        comment-stripped version so formatting/comment differences do not inflate
        the score, and a higher threshold (0.85) to avoid false positives.
        """
        clean1 = clean1 if clean1 is not None else self.remove_comments_and_whitespace(code1)
        clean2 = clean2 if clean2 is not None else self.remove_comments_and_whitespace(code2)
        return self.token_similarity(clean1, clean2, with_order=False) > threshold

    def gapped_clone_similarity(self, code1, code2, threshold=0.85):
        """Check for gapped clones (same code with inserted/deleted blocks).

        Gapped clones are detected by requiring BOTH unordered token similarity
        (same vocabulary) AND text similarity (overall textual closeness) to be
        high.  Text similarity catches the gaps; token similarity confirms the core
        code is the same.  The higher threshold (0.85) prevents false positives.
        """
        tokens1 = self.parse_code(code1)
        tokens2 = self.parse_code(code2)
        token_ratio = fuzz.ratio(' '.join(tokens1), ' '.join(tokens2)) / 100
        text_ratio = self.text_similarity(code1, code2)
        return token_ratio > threshold and text_ratio > (threshold - 0.10)

    def intertwined_clone_similarity(self, code1, code2, threshold=0.85):
        """Check for intertwined clones (two clones merged into one file).

        Uses fuzz.partial_ratio which finds the best matching substring, making it
        suitable for detecting code that is a superset/subset of another snippet.
        Threshold raised to 0.85 to reduce false positives from partial matches.
        """
        tokens1 = self.parse_code(code1)
        tokens2 = self.parse_code(code2)
        match_ratio = fuzz.partial_ratio(' '.join(tokens1), ' '.join(tokens2)) / 100
        return match_ratio > threshold

    def semantic_clone_similarity(self, code1, code2, threshold=0.8, ai_score=None):
        """Check for semantic clones using AI-based (GraphCodeBERT) similarity.

        The previous implementation averaged text and token similarity, which is
        purely syntactic and has nothing to do with semantics.  Two functions that
        do the same thing differently (e.g. iterative vs recursive sum) would score
        near-zero with that approach.  The AI embedding model captures meaning, so
        we use it here.  When the caller has already computed the AI score it can
        pass it in via *ai_score* to avoid a second forward pass.
        """
        score = ai_score if ai_score is not None else self.ai_based_similarity(code1, code2)
        return score > threshold

    def code_to_graph(self, code):
        """Convert code to a graph representation."""
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node
        graph = nx.DiGraph()

        def add_nodes(node, parent=None):
            graph.add_node(
                node.id, type=node.type, start=node.start_point, end=node.end_point
            )
            if parent:
                graph.add_edge(parent.id, node.id)
            for child in node.children:
                add_nodes(child, node)

        add_nodes(root_node)
        return graph

    def calculate_graph_metrics(self, graph):
        """Calculate graph metrics."""
        num_nodes = graph.number_of_nodes()
        num_edges = graph.number_of_edges()
        if num_nodes == 0:
            return 0, 0, 0
        avg_degree = sum(dict(graph.degree()).values()) / num_nodes
        return num_nodes, num_edges, avg_degree

    def graph_similarity(self, code1, code2):
        """Compute graph similarity between two code ASTs.

        The previous implementation compared only *aggregate* graph statistics
        (node count, edge count, average degree).  This is misleading: two entirely
        different programs that happen to have the same number of AST nodes score
        1.0.  The fix compares the normalised *frequency distribution of node types*
        (e.g. how many 'if_statement', 'for_statement', 'call_expression' nodes
        each AST contains) using cosine similarity.  This captures what kinds of
        constructs are used, not just how many nodes exist.
        """
        graph1 = self.code_to_graph(code1)
        graph2 = self.code_to_graph(code2)

        types1 = Counter(data.get('type', '') for _, data in graph1.nodes(data=True))
        types2 = Counter(data.get('type', '') for _, data in graph2.nodes(data=True))

        all_types = set(types1) | set(types2)
        total1 = sum(types1.values()) or 1
        total2 = sum(types2.values()) or 1

        dot = sum(
            (types1.get(t, 0) / total1) * (types2.get(t, 0) / total2)
            for t in all_types
        )
        norm1 = sum((v / total1) ** 2 for v in types1.values()) ** 0.5
        norm2 = sum((v / total2) ** 2 for v in types2.values()) ** 0.5

        if norm1 == 0 or norm2 == 0:
            return 1.0 if (total1 == 1 and total2 == 1) else 0.0
        return float(np.clip(dot / (norm1 * norm2), 0.0, 1.0))

    def combined_similarity(self, code1, code2,
                             _text_sim=None, _token_sim=None,
                             _graph_sim=None, _renamed_sim=None,
                             _ai_score=None):
        """Compute combined similarity from a weighted blend of individual metrics.

        When the caller has already computed some or all of the component scores it
        should pass them in to avoid redundant computation.  The weights reflect
        the relative discriminative power of each signal:
          - text similarity    (0.20) -- fast but sensitive to whitespace/comments
          - token similarity   (0.25) -- structural fingerprint via AST token types
          - renamed similarity (0.25) -- same as token-with-order; best for Type 2
          - graph similarity   (0.15) -- AST node-type distribution (cosine)
          - AI similarity      (0.15) -- GraphCodeBERT semantic embedding
        """
        text_sim    = _text_sim    if _text_sim    is not None else self.text_similarity(code1, code2)
        token_sim   = _token_sim   if _token_sim   is not None else self.token_similarity(code1, code2)
        graph_sim   = _graph_sim   if _graph_sim   is not None else self.graph_similarity(code1, code2)
        renamed_sim = _renamed_sim if _renamed_sim is not None else self.renamed_clone_similarity(code1, code2)
        ai_score    = _ai_score    if _ai_score    is not None else self.ai_based_similarity(code1, code2)
        return (0.20 * text_sim + 0.25 * token_sim + 0.25 * renamed_sim
                + 0.15 * graph_sim + 0.15 * ai_score)

    def calculate_raw_metrics(self, code):
        """Calculate raw metrics of code."""
        raw_metrics = analyze(code)
        return {
            'loc': raw_metrics.loc,
            'lloc': raw_metrics.lloc,
            'sloc': raw_metrics.sloc,
            'comments': raw_metrics.comments,
            'multi': raw_metrics.multi,
            'blank': raw_metrics.blank,
        }

    def calculate_halstead_metrics(self, code):
        """Calculate Halstead metrics."""
        halstead_metrics = h_visit(code)
        if halstead_metrics:
            return halstead_metrics[0]._asdict()
        return {}

    def calculate_cyclomatic_complexity(self, code):
        """Calculate cyclomatic complexity."""
        complexity = cc_visit(code)
        if complexity:
            return sum([block.complexity for block in complexity]) / len(complexity)
        return 0

    def calculate_maintainability_index(self, code):
        """Calculate maintainability index."""
        return mi_visit(code, True)

    def _universal_metrics(self, code):
        """Extract language-agnostic metrics from source code using tree-sitter."""
        lines = code.splitlines()
        loc = len(lines)
        blank = sum(1 for l in lines if not l.strip())
        comment_prefixes = ('//', '#', '--', ';', '%')
        comment_lines = sum(1 for l in lines if l.strip().startswith(comment_prefixes))
        sloc = loc - blank - comment_lines

        # Token-based metrics from the existing tokenizer
        try:
            tokens = self.parse_code(code, with_order=True)
            token_count = len(tokens)
            unique_tokens = len(set(tokens))
            token_density = round(token_count / max(sloc, 1), 2)
        except Exception:
            token_count = unique_tokens = 0
            token_density = 0.0

        # Nesting depth via AST
        max_nesting = 0
        function_count = 0
        class_count = 0
        try:
            tree = self.parser.parse(bytes(code, 'utf-8'))
            nesting_types = {
                'block', 'function_body', 'compound_statement', 'body',
                'statement_block', 'do_block', 'class_body',
            }
            function_types = {
                'function_definition', 'function_declaration', 'method_definition',
                'method_declaration', 'arrow_function', 'function_item',
                'def', 'fun_declaration',
            }
            class_types = {
                'class_definition', 'class_declaration', 'class_body',
                'struct_item', 'impl_item',
            }

            def walk(node, depth):
                nonlocal max_nesting, function_count, class_count
                if node.type in nesting_types:
                    depth += 1
                    max_nesting = max(max_nesting, depth)
                if node.type in function_types:
                    function_count += 1
                if node.type in class_types:
                    class_count += 1
                for child in node.children:
                    walk(child, depth)

            walk(tree.root_node, 0)
        except Exception:
            pass

        avg_line_length = round(
            sum(len(l) for l in lines if l.strip()) / max(sloc, 1), 1
        )

        return {
            'loc': loc,
            'sloc': sloc,
            'blank_lines': blank,
            'comment_lines': comment_lines,
            'token_count': token_count,
            'unique_tokens': unique_tokens,
            'token_density': token_density,
            'max_nesting_depth': max_nesting,
            'function_count': function_count,
            'class_count': class_count,
            'avg_line_length': avg_line_length,
        }

    def get_metrics(self, code, language):
        """Get code metrics."""
        universal = self._universal_metrics(code)

        if language != 'python':
            return {
                'universal': universal,
                'raw': None,
                'halstead': None,
                'cyclomatic_complexity': None,
                'maintainability_index': None,
            }

        raw_metrics = self.calculate_raw_metrics(code)
        halstead_metrics = self.calculate_halstead_metrics(code)
        cyclomatic_complexity = self.calculate_cyclomatic_complexity(code)
        maintainability_index = self.calculate_maintainability_index(code)

        return {
            'universal': universal,
            'raw': raw_metrics,
            'halstead': halstead_metrics,
            'cyclomatic_complexity': cyclomatic_complexity,
            'maintainability_index': maintainability_index,
        }

    def ai_based_similarity(self, code1, code2):
        """Compute AI-based similarity.

        Degrades to ``0.0`` when the embedding model is unavailable (e.g. torch
        not installed, model load failure) so the rest of the pipeline keeps
        working.  Because the AI score carries 0.15 of the combined similarity,
        a silent failure would deflate every result — so the FIRST failure per
        process is logged at WARNING; repeats drop to debug to avoid log spam.
        """
        global _AI_FAILURE_WARNED
        try:
            return get_ai_analyzer().analyze_similarity(code1, code2)
        except Exception:
            if not _AI_FAILURE_WARNED:
                _AI_FAILURE_WARNED = True
                logger.warning(
                    "AI-based similarity unavailable — degrading to 0.0. The "
                    "'AI Similarity' metric and 15%% of the combined score will "
                    "read as zero until the embedding model loads.",
                    exc_info=True,
                )
            else:
                logger.debug("AI-based similarity unavailable; degrading to 0.0", exc_info=True)
            return 0.0


# ---------------------------------------------------------------------------
# Module-level data and factory
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = [
    'python', 'c', 'java', 'javascript', 'ruby', 'go',
    'typescript', 'php', 'kotlin', 'r', 'rust',
    'scala', 'elixir', 'haskell', 'perl',
]

# Single lazily-populated detector pool, shared by the whole process.
# Eagerly building 15 detectors at import time doubled startup cost (the
# service layer used to keep a second identical pool) and meant a single
# missing tree-sitter grammar crashed the app before it could serve anything.
clone_detectors: dict = {}
_detector_lock = threading.Lock()

# Set to True after the first AI-similarity failure so we warn loudly once.
_AI_FAILURE_WARNED = False


def get_detector(language):
    """Return the shared CloneDetector for *language*, creating it on first use."""
    detector = clone_detectors.get(language)
    if detector is None:
        with _detector_lock:
            detector = clone_detectors.get(language)
            if detector is None:
                detector = CloneDetector(language)
                clone_detectors[language] = detector
    return detector
