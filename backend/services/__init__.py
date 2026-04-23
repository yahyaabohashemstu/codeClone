"""
Services layer -- business logic orchestration.

This package contains the application's service modules that sit between
the API routes and the pure analysis engine.  Each module has a focused
responsibility:

- ``progress_service`` -- per-user analysis progress tracking
- ``cache_service`` -- in-memory LRU cache for analysis results
- ``ai_service`` -- Mistral AI text generation and health checking
- ``upload_service`` -- file upload handling, ZIP extraction, spreadsheet reading
- ``analysis_service`` -- main analysis pipeline orchestrator
"""
