"""
Flask-independent AI-powered code similarity analyzer using GraphCodeBERT.

Provides embedding-based similarity analysis via Microsoft's GraphCodeBERT model.
All dependencies (transformers, torch, numpy) are optional and handled gracefully.
"""

import logging
import threading

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:
    np = None
    logger.warning("numpy is not installed; AIAnalyzer will not be available.")

try:
    import torch
except ImportError:
    torch = None
    logger.warning("torch is not installed; AIAnalyzer will not be available.")

try:
    from transformers import AutoTokenizer, AutoModel
except ImportError:
    AutoTokenizer = None
    AutoModel = None
    logger.warning(
        "transformers is not installed; AIAnalyzer will not be available."
    )

_GRAPHCODEBERT_MODEL = "microsoft/graphcodebert-base"

# GraphCodeBERT's positional embeddings cap the sequence at 512 tokens. We
# reserve two slots for the [CLS]/[SEP] special tokens and slide a window with
# 25% overlap across long inputs, then pool the per-window embeddings — so the
# whole file contributes rather than only its first ~512 tokens.
_MODEL_MAX_LEN = 512
_MAX_WINDOWS = 24  # bounds cost on very large files (~12k content tokens)


def _make_windows(token_ids, content_len, overlap, max_windows):
    """Split *token_ids* into overlapping windows of at most *content_len*.

    Pure function (no model needed) so the windowing logic is unit-testable.
    Guarantees the tail is covered. If the number of windows would exceed
    *max_windows*, evenly samples window starts across the whole sequence so
    global coverage (head→tail) is retained instead of silently truncating.
    """
    n = len(token_ids)
    if n == 0:
        return [[]]
    if n <= content_len:
        return [list(token_ids)]

    step = max(1, content_len - overlap)
    starts = list(range(0, n, step))
    # Ensure the final window reaches the end of the sequence.
    if starts[-1] + content_len < n:
        starts.append(n - content_len)
    # Clip each start into range and de-duplicate.
    starts = sorted({max(0, min(s, n - content_len)) for s in starts})

    if len(starts) > max_windows:
        picked = {
            starts[round(i * (len(starts) - 1) / (max_windows - 1))]
            for i in range(max_windows)
        }
        starts = sorted(picked)

    return [list(token_ids[s:s + content_len]) for s in starts]


class AIAnalyzer:
    """Embedding-based code similarity analyzer using GraphCodeBERT.

    Loads the ``microsoft/graphcodebert-base`` tokenizer and model on first
    instantiation.  Consumers should prefer the :func:`get_ai_analyzer`
    factory which provides a thread-safe, lazily-initialized singleton.
    """

    def __init__(self):
        if AutoTokenizer is None or AutoModel is None:
            raise RuntimeError(
                "The 'transformers' library is required for AIAnalyzer but is "
                "not installed.  Install it with: pip install transformers"
            )
        if torch is None:
            raise RuntimeError(
                "PyTorch is required for AIAnalyzer but is not installed.  "
                "Install it with: pip install torch"
            )
        if np is None:
            raise RuntimeError(
                "numpy is required for AIAnalyzer but is not installed.  "
                "Install it with: pip install numpy"
            )

        logger.info("Loading GraphCodeBERT model '%s' ...", _GRAPHCODEBERT_MODEL)
        self.tokenizer = AutoTokenizer.from_pretrained(_GRAPHCODEBERT_MODEL)
        self.model = AutoModel.from_pretrained(
            _GRAPHCODEBERT_MODEL, add_pooling_layer=False
        )
        # Use a GPU when one is present; otherwise stay on CPU. eval() disables
        # dropout for deterministic embeddings.
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()
        # A single torch.nn.Module is not safe for concurrent forward passes from
        # multiple threads (background pool + CI request threads). Serialize
        # inference on this shared model.
        self._infer_lock = threading.Lock()
        logger.info("GraphCodeBERT model loaded successfully (device=%s).", self.device)

    def _masked_mean(self, hidden, attention):
        """Mean-pool *hidden* over real (non-padding) positions using the mask.

        The previous implementation padded every input to 512 and averaged over
        all positions, so padding diluted short snippets. Masked pooling averages
        only the actual tokens.
        """
        mask = attention.unsqueeze(-1).type_as(hidden)      # [B, L, 1]
        summed = (hidden * mask).sum(dim=1)                 # [B, H]
        counts = mask.sum(dim=1).clamp(min=1e-9)            # [B, 1]
        return summed / counts                              # [B, H]

    def get_embedding(self, code):
        """Return a 1-D embedding for *code*, covering the WHOLE input.

        Long inputs are split into overlapping ≤512-token windows; each window is
        embedded and masked-mean-pooled, then the window vectors are combined
        with a length-weighted average. This removes the old 512-token
        truncation that discarded everything past the first screenful of code.
        """
        encoded = self.tokenizer(code or "", add_special_tokens=False)
        input_ids = encoded["input_ids"]
        content_len = _MODEL_MAX_LEN - 2  # reserve room for [CLS] and [SEP]
        overlap = content_len // 4        # 25% overlap between adjacent windows
        windows = _make_windows(input_ids, content_len, overlap, _MAX_WINDOWS)

        cls_id = self.tokenizer.cls_token_id
        sep_id = self.tokenizer.sep_token_id

        pooled_vecs = []
        weights = []
        for window in windows:
            ids = list(window)
            if cls_id is not None and sep_id is not None:
                ids = [cls_id] + ids + [sep_id]
            if not ids:
                continue
            input_tensor = torch.tensor([ids], device=self.device)
            attn_tensor = torch.ones_like(input_tensor)
            with self._infer_lock, torch.no_grad():
                outputs = self.model(input_ids=input_tensor, attention_mask=attn_tensor)
            pooled = self._masked_mean(outputs.last_hidden_state, attn_tensor).squeeze(0)
            pooled_vecs.append(pooled)
            weights.append(max(1, len(window)))

        if not pooled_vecs:
            hidden_size = getattr(self.model.config, "hidden_size", 768)
            return np.zeros(hidden_size, dtype=np.float32)

        stacked = torch.stack(pooled_vecs)  # [nWindows, H]
        w = torch.tensor(weights, dtype=stacked.dtype, device=stacked.device).unsqueeze(-1)
        aggregated = (stacked * w).sum(dim=0) / w.sum()  # length-weighted mean
        return aggregated.detach().cpu().numpy()

    def cosine_similarity(self, vec1, vec2):
        """Compute cosine similarity between two vectors, clamped to [0, 1].

        Parameters
        ----------
        vec1, vec2 : numpy.ndarray
            Vectors to compare.

        Returns
        -------
        float
            Cosine similarity in the range ``[0.0, 1.0]``.
        """
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if norm_product == 0.0:
            return 0.0
        similarity = np.dot(vec1, vec2) / norm_product
        return float(np.clip(similarity, 0.0, 1.0))

    def analyze_similarity(self, code1, code2):
        """Return a float similarity score for two code snippets.

        Parameters
        ----------
        code1, code2 : str
            Source code strings to compare.

        Returns
        -------
        float
            Similarity score in ``[0.0, 1.0]``.
        """
        emb1 = self.get_embedding(code1)
        emb2 = self.get_embedding(code2)
        similarity = self.cosine_similarity(emb1, emb2)
        return similarity


# ---------------------------------------------------------------------------
# Thread-safe singleton factory
# ---------------------------------------------------------------------------

_ai_analyzer = None
_ai_analyzer_lock = threading.Lock()


def get_ai_analyzer():
    """Return a lazily-initialized, thread-safe singleton :class:`AIAnalyzer`.

    The first call creates the instance (which downloads / loads the model);
    subsequent calls return the same object without locking overhead thanks to
    the double-checked locking pattern.

    Returns
    -------
    AIAnalyzer
        The shared analyzer instance.
    """
    global _ai_analyzer
    if _ai_analyzer is None:
        with _ai_analyzer_lock:
            if _ai_analyzer is None:
                _ai_analyzer = AIAnalyzer()
    return _ai_analyzer
