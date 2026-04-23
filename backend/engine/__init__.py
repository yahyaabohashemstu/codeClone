"""
Code analysis engine — Flask-independent core.

This package contains the pure analysis logic with zero Flask dependencies:
- ``clone_detector``: AST/token/semantic clone detection (23+ methods)
- ``ai_analyzer``: GraphCodeBERT embedding and similarity scoring
- ``code_smell``: Pylint-based code quality analysis
- ``similarity``: Chart generation and metric normalization
"""
