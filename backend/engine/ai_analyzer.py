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
        logger.info("GraphCodeBERT model loaded successfully.")

    def get_embedding(self, code):
        """Tokenize *code*, run a forward pass, and return a mean-pooled numpy vector.

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
            padding="max_length",
            max_length=512,
        )
        with torch.no_grad():
            outputs = self.model(**inputs)
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze().numpy()
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
