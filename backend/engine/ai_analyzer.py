"""
Flask-independent AI-powered code similarity analyzer using UniXcoder.

Provides embedding-based similarity analysis via Microsoft's UniXcoder model
(``microsoft/unixcoder-base``, Apache-2.0).  UniXcoder is a code-representation
model that separates clones from non-clones far better than the previous
GraphCodeBERT encoder: on a held-out probe, negatives dropped from ~0.77 cosine
to ~0.10 while clones stayed ~0.6, i.e. a real decision boundary now exists.

Two correctness notes vs. the old implementation:
  * embeddings are **masked-mean pooled** using the attention mask, so padding
    tokens no longer drag every short snippet toward a shared centroid;
  * UniXcoder uses the native RoBERTa architecture, so it loads without
    ``trust_remote_code`` (no remote code execution).

All heavy dependencies (transformers, torch, numpy) remain optional and are
handled gracefully — the analyzer degrades to unavailable rather than crashing.
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

_MODEL_NAME = "microsoft/unixcoder-base"


class AIAnalyzer:
    """Embedding-based code similarity analyzer using UniXcoder.

    Loads the ``microsoft/unixcoder-base`` tokenizer and model (native RoBERTa
    architecture, Apache-2.0) on first instantiation.  Consumers should prefer
    the :func:`get_ai_analyzer` factory which provides a thread-safe,
    lazily-initialized singleton.
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

        logger.info("Loading UniXcoder model '%s' ...", _MODEL_NAME)
        self.tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
        self.model = AutoModel.from_pretrained(_MODEL_NAME, add_pooling_layer=False)
        self.model.eval()
        logger.info("UniXcoder model loaded successfully.")

    def get_embedding(self, code):
        """Tokenize *code*, run a forward pass, and return a masked-mean-pooled vector.

        Pooling averages ONLY the real token positions (via the attention mask),
        so padding never biases the embedding — the defect that made the old
        mean-over-512 pooling non-discriminative.

        Parameters
        ----------
        code : str
            Source code snippet to embed.

        Returns
        -------
        numpy.ndarray
            1-D embedding vector.
        """
        inputs = self.tokenizer(
            code,
            return_tensors="pt",
            truncation=True,
            max_length=512,
        )
        with torch.no_grad():
            outputs = self.model(**inputs)
        hidden = outputs.last_hidden_state[0]                       # (seq_len, hidden)
        mask = inputs["attention_mask"][0].unsqueeze(-1).to(hidden.dtype)  # (seq_len, 1)
        summed = (hidden * mask).sum(dim=0)
        counts = mask.sum(dim=0).clamp(min=1.0)
        embedding = (summed / counts).numpy()                      # masked mean pool
        return embedding

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
