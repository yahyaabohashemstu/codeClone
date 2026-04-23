"""
Localization utilities.

Provides request-aware language detection and simple English/Arabic message
selection for the CodeClone UI and AI prompts.

The functions here depend on a Flask request context but have *no* dependency
on application configuration or database models, so they can be imported early
without circular-import risks.
"""

from __future__ import annotations

from flask import has_request_context, request


# ---------------------------------------------------------------------------
# Supported languages
# ---------------------------------------------------------------------------

_SUPPORTED_LANGUAGES: frozenset[str] = frozenset({"en", "ar"})

_LANGUAGE_DISPLAY_NAMES: dict[str, str] = {
    "en": "English",
    "ar": "Arabic",
}


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

def get_request_app_language() -> str:
    """
    Detect the user's preferred UI language from the current request.

    Resolution order:

    1. ``X-App-Language`` header (explicit override from the React frontend).
    2. ``Accept-Language`` header (browser / HTTP client default).
    3. Falls back to ``"en"`` if neither header yields a supported language
       **or** when called outside of a Flask request context (e.g. CLI,
       background worker).
    """
    if not has_request_context():
        return "en"

    # 1. Explicit header from the React frontend.
    explicit = (request.headers.get("X-App-Language") or "").strip().lower()
    if explicit in _SUPPORTED_LANGUAGES:
        return explicit

    # 2. Standard Accept-Language negotiation.
    accept = (request.headers.get("Accept-Language") or "").strip().lower()
    for token in accept.split(","):
        # Strip quality factor (e.g. "en-US;q=0.9" -> "en-US" -> "en").
        normalized = token.split(";", 1)[0].strip()
        primary = normalized.split("-", 1)[0]
        if primary in _SUPPORTED_LANGUAGES:
            return primary

    return "en"


# ---------------------------------------------------------------------------
# Language name for AI prompts
# ---------------------------------------------------------------------------

def get_ai_response_language_name(language: str | None = None) -> str:
    """
    Return the full English name of the language to use in AI prompt
    instructions (e.g. ``"Respond in Arabic."``).

    If *language* is ``None``, the language is auto-detected from the
    current request via :func:`get_request_app_language`.
    """
    lang = language or get_request_app_language()
    return _LANGUAGE_DISPLAY_NAMES.get(lang, "English")


# ---------------------------------------------------------------------------
# Simple UI message localization
# ---------------------------------------------------------------------------

def localize_ui_message(english_message: str, arabic_message: str) -> str:
    """
    Return the appropriate translation of a static UI message.

    Parameters
    ----------
    english_message:
        The English variant of the message.
    arabic_message:
        The Arabic variant of the message.

    Returns
    -------
    str
        *arabic_message* when the current request language is ``"ar"``,
        otherwise *english_message*.
    """
    return arabic_message if get_request_app_language() == "ar" else english_message
