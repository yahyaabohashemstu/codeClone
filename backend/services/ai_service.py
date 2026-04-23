"""
AI text-generation service (Mistral integration).

Provides lazy Mistral client initialization, health checking, and
structured AI analysis generation for code-clone comparisons.

The Mistral SDK is imported at module level with a graceful fallback so
that the rest of the application can still function when the SDK is not
installed -- AI features will simply report themselves as unavailable.
"""

from __future__ import annotations

import inspect
import json
import logging
import os
import re
import threading

from backend.utils.localization import (
    get_ai_response_language_name,
    localize_ui_message,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mistral SDK import (graceful fallback)
# ---------------------------------------------------------------------------

_Mistral = None
_MISTRAL_SDK_IMPORT_PATH: str | None = None
_MISTRAL_SDK_IMPORT_ERROR: Exception | None = None

try:
    from mistralai.client import Mistral as _MistralClient  # type: ignore[import-untyped]
    _Mistral = _MistralClient
    _MISTRAL_SDK_IMPORT_PATH = "mistralai.client"
except ImportError:
    try:
        from mistralai import Mistral as _MistralRoot  # type: ignore[import-untyped]
        _Mistral = _MistralRoot
        _MISTRAL_SDK_IMPORT_PATH = "mistralai"
    except ImportError as _err:
        _MISTRAL_SDK_IMPORT_ERROR = _err

# ---------------------------------------------------------------------------
# Module-level Mistral state (lazy-init, thread-safe)
# ---------------------------------------------------------------------------

_mistral_client = None
_mistral_backend: str | None = None
_mistral_client_init_error: str | None = None
_mistral_init_lock = threading.Lock()
_mistral_initialized = False


def _get_mistral_api_key() -> str:
    """Resolve the Mistral API key from the environment or Flask config.

    Resolution order:
    1. ``MISTRAL_API_KEY`` environment variable.
    2. Flask ``current_app.config["MISTRAL_API_KEY"]``.
    3. ``instance/mistral_api_key`` file (legacy path).
    """
    env_key = os.environ.get("MISTRAL_API_KEY")
    if env_key:
        return env_key.strip()

    try:
        from flask import current_app
        cfg_key = current_app.config.get("MISTRAL_API_KEY", "")
        if cfg_key:
            return cfg_key.strip()
    except RuntimeError:
        pass

    # Legacy: key stored as a file in the instance directory.
    try:
        from flask import current_app
        key_path = os.path.join(current_app.instance_path, "mistral_api_key")
        if os.path.exists(key_path):
            with open(key_path, "r", encoding="utf-8") as fh:
                return fh.read().strip()
    except (RuntimeError, OSError):
        pass

    return ""


def _get_mistral_model() -> str:
    """Resolve the Mistral model name."""
    model = os.environ.get("MISTRAL_MODEL")
    if model:
        return model

    try:
        from flask import current_app
        return current_app.config.get("MISTRAL_MODEL", "mistral-small-latest")
    except RuntimeError:
        return "mistral-small-latest"


def _create_mistral_client(api_key: str):
    """Instantiate a Mistral client with the appropriate constructor args."""
    if _Mistral is None:
        raise ImportError(f"Mistral SDK import failed: {_MISTRAL_SDK_IMPORT_ERROR}")

    signature = inspect.signature(_Mistral)
    constructor_parameters = signature.parameters
    base_kwargs: dict = {"api_key": api_key}

    if "timeout_ms" in constructor_parameters:
        base_kwargs["timeout_ms"] = 60_000
    elif "timeout" in constructor_parameters:
        base_kwargs["timeout"] = 60

    return _Mistral(**base_kwargs)


def _ensure_client_initialized() -> None:
    """Lazily initialize the Mistral client (once, thread-safe)."""
    global _mistral_client, _mistral_backend, _mistral_client_init_error, _mistral_initialized  # noqa: PLW0603

    if _mistral_initialized:
        return

    with _mistral_init_lock:
        if _mistral_initialized:
            return

        api_key = _get_mistral_api_key()
        if not api_key:
            _mistral_initialized = True
            return

        try:
            _mistral_client = _create_mistral_client(api_key)
            _mistral_backend = "mistral"
            _mistral_client_init_error = None
        except Exception as exc:
            _mistral_client = None
            _mistral_backend = None
            _mistral_client_init_error = str(exc)
            logger.warning("Failed to initialize Mistral client: %s", _mistral_client_init_error)

        _mistral_initialized = True


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def extract_mistral_text(response) -> str:
    """Extract the text content from a Mistral chat completion response.

    Handles multiple response shapes:
    - Plain string ``content``
    - List of dicts with ``{"type": "text", "text": "..."}``
    - List of objects with ``.text`` attribute
    """
    try:
        content = response.choices[0].message.content
    except Exception:
        return ""

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
            else:
                text_value = getattr(item, "text", None)
                if text_value:
                    text_parts.append(text_value)
        return "\n".join(part for part in text_parts if part).strip()

    return str(content).strip()


# ---------------------------------------------------------------------------
# Health checking
# ---------------------------------------------------------------------------


def classify_ai_health_error(error_text: str) -> dict:
    """Categorize an AI API error into a user-facing status + message.

    Returns a dict with ``status`` and ``message`` keys.
    """
    lowered_error = error_text.lower()

    if "401" in error_text or "unauthorized" in lowered_error:
        return {
            "status": "unauthorized",
            "message": localize_ui_message(
                "AI analysis is temporarily unavailable because the configured "
                "Mistral key was rejected by the API. Verify the key and try again.",
                "\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0645\u0624\u0642\u062a\u064b\u0627 \u0644\u0623\u0646 \u0645\u0641\u062a\u0627\u062d Mistral \u0627\u0644\u0645\u0647\u064a\u0623 \u062a\u0645 \u0631\u0641\u0636\u0647 \u0645\u0646 \u0627\u0644\u0648\u0627\u062c\u0647\u0629 \u0627\u0644\u0628\u0631\u0645\u062c\u064a\u0629. \u062a\u062d\u0642\u0651\u0642 \u0645\u0646 \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u062b\u0645 \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
            ),
        }

    if "429" in error_text or "rate limit" in lowered_error or "quota" in lowered_error:
        return {
            "status": "rate_limited",
            "message": localize_ui_message(
                "AI analysis is temporarily unavailable because the configured "
                "Mistral key has reached its current rate or quota limit. "
                "Try again later.",
                "\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0645\u0624\u0642\u062a\u064b\u0627 \u0644\u0623\u0646 \u0645\u0641\u062a\u0627\u062d Mistral \u0627\u0644\u0645\u0647\u064a\u0623 \u0628\u0644\u063a \u062d\u062f \u0627\u0644\u0645\u0639\u062f\u0644 \u0623\u0648 \u0627\u0644\u062d\u0635\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649 \u0644\u0627\u062d\u0642\u064b\u0627.",
            ),
        }

    return {
        "status": "error",
        "message": localize_ui_message(
            "AI analysis is temporarily unavailable. Please try again later.",
            "\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0645\u0624\u0642\u062a\u064b\u0627. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649 \u0644\u0627\u062d\u0642\u064b\u0627.",
        ),
    }


def check_ai_health(run_live_check: bool = True) -> dict:
    """Return a health-status dict for the Mistral AI backend.

    Parameters
    ----------
    run_live_check:
        When ``True``, a small test prompt is sent to the Mistral API to
        verify the key is valid and the service is reachable.  When
        ``False``, only configuration readiness is checked.
    """
    _ensure_client_initialized()

    api_key = _get_mistral_api_key()
    model = _get_mistral_model()

    if not api_key:
        return {
            "provider": "mistral",
            "model": model,
            "status": "not_configured",
            "live_check": False,
            "message": localize_ui_message(
                "MISTRAL_API_KEY is not configured.",
                "\u0627\u0644\u0645\u062a\u063a\u064a\u0631 MISTRAL_API_KEY \u063a\u064a\u0631 \u0645\u0636\u0628\u0648\u0637.",
            ),
        }

    if _mistral_backend != "mistral" or _mistral_client is None:
        reason = _mistral_client_init_error or (
            f"Mistral SDK import failed via {_MISTRAL_SDK_IMPORT_PATH or 'unknown import path'}."
            if _MISTRAL_SDK_IMPORT_ERROR
            else "The Mistral client could not be initialized."
        )
        return {
            "provider": "mistral",
            "model": model,
            "status": "client_unavailable",
            "live_check": False,
            "message": localize_ui_message(
                f"The Mistral client is unavailable. {reason}",
                f"\u0639\u0645\u064a\u0644 Mistral \u063a\u064a\u0631 \u0645\u062a\u0627\u062d. {reason}",
            ),
        }

    if not run_live_check:
        return {
            "provider": "mistral",
            "model": model,
            "status": "ready",
            "live_check": False,
            "message": localize_ui_message(
                "The Mistral client is configured and ready for a live check.",
                "\u0639\u0645\u064a\u0644 Mistral \u0645\u0647\u064a\u0623 \u0648\u062c\u0627\u0647\u0632 \u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0645\u0628\u0627\u0634\u0631.",
            ),
        }

    try:
        response = _mistral_client.chat.complete(
            model=model,
            messages=[{"role": "user", "content": "Reply with exactly OK."}],
        )
        response_text = extract_mistral_text(response)
        return {
            "provider": "mistral",
            "model": model,
            "status": "ok",
            "live_check": True,
            "message": localize_ui_message(
                "The configured Mistral key is valid and the API responded successfully.",
                "\u0645\u0641\u062a\u0627\u062d Mistral \u0627\u0644\u0645\u0647\u064a\u0623 \u0635\u0627\u0644\u062d \u0648\u0642\u062f \u0627\u0633\u062a\u062c\u0627\u0628\u062a \u0627\u0644\u0648\u0627\u062c\u0647\u0629 \u0627\u0644\u0628\u0631\u0645\u062c\u064a\u0629 \u0628\u0646\u062c\u0627\u062d.",
            ),
            "sample_response": response_text or "",
        }
    except Exception as exc:
        classified_error = classify_ai_health_error(str(exc))
        return {
            "provider": "mistral",
            "model": model,
            "live_check": True,
            **classified_error,
        }


# ---------------------------------------------------------------------------
# Text generation
# ---------------------------------------------------------------------------


def generate_ai_text(prompt: str) -> str:
    """Send *prompt* to Mistral and return the generated text.

    Falls back to a user-facing error message when the client is
    unavailable or the API call fails.
    """
    return generate_ai_chat([{"role": "user", "content": prompt}])


def generate_ai_chat(messages: list[dict[str, str]]) -> str:
    """Send a multi-message conversation to Mistral and return the response.

    This is the general-purpose entry point for all Mistral chat
    completions.  ``generate_ai_text`` delegates to this function with a
    single user message.

    Parameters
    ----------
    messages:
        A list of message dicts, each with ``role`` and ``content`` keys,
        following the OpenAI/Mistral chat-completion format (e.g.
        ``[{"role": "system", "content": "..."}, ...]``).

    Returns
    -------
    str
        The assistant's response text, or a user-facing error/fallback
        message when the client is unavailable or the API call fails.
    """
    _ensure_client_initialized()

    health = check_ai_health(run_live_check=False)
    if health["status"] == "not_configured":
        return localize_ui_message(
            "AI analysis is unavailable because MISTRAL_API_KEY is not configured.",
            "\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0644\u0623\u0646 MISTRAL_API_KEY \u063a\u064a\u0631 \u0645\u0636\u0628\u0648\u0637.",
        )
    if health["status"] == "client_unavailable":
        return health.get("message") or localize_ui_message(
            "AI analysis is unavailable because the Mistral client is not available.",
            "\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0644\u0623\u0646 \u0639\u0645\u064a\u0644 Mistral \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631.",
        )

    model = _get_mistral_model()
    try:
        response = _mistral_client.chat.complete(
            model=model,
            messages=messages,
        )
        response_text = extract_mistral_text(response)
        return response_text or localize_ui_message(
            "AI analysis returned an empty response.",
            "\u0623\u0639\u0627\u062f \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0627\u0633\u062a\u062c\u0627\u0628\u0629 \u0641\u0627\u0631\u063a\u0629.",
        )
    except Exception as exc:
        return classify_ai_health_error(str(exc))["message"]


# ---------------------------------------------------------------------------
# Structured analysis generation
# ---------------------------------------------------------------------------


def generate_textual_analysis_ai(
    code1: str,
    code2: str,
    results: list,
) -> tuple[str, dict | None]:
    """Generate a structured AI analysis of code similarity results.

    Parameters
    ----------
    code1, code2:
        The two code snippets being compared.
    results:
        List of ``[metric_name, metric_value]`` pairs.

    Returns
    -------
    tuple[str, dict | None]
        ``(prose_text, structured_json)``.  When the AI response is valid
        JSON, the ``report`` field is used as *prose_text* and the full
        parsed dict as *structured_json*.  Otherwise *prose_text* is the
        raw response and *structured_json* is ``None``.
    """
    results_text: list[str] = []
    for metric, value in results:
        if isinstance(value, float):
            results_text.append(f"{metric}: {value:.2f}%")
        else:
            results_text.append(f"{metric}: {value}")

    joined_results = "\n".join(results_text)
    response_language = get_ai_response_language_name()

    prompt = (
        f"Respond in {response_language}. Keep code identifiers, rule names, "
        "and metric labels in their original form.\n"
        "Analyze the code similarity results below. Return ONLY a valid JSON "
        "object with exactly these fields "
        "(no markdown code fences, no extra text outside the JSON):\n"
        "{\n"
        '  "risk_level": "critical" | "high" | "moderate" | "low" | "none",\n'
        '  "summary": "<1-2 sentence executive summary>",\n'
        '  "findings": [\n'
        '    { "title": "<short title>", "severity": "critical" | "high" | '
        '"medium" | "low" | "info", "description": "<explanation>" }\n'
        "  ],\n"
        '  "refactoring_suggestion": "<concrete advice for reducing '
        'duplication or risk>",\n'
        '  "verdict": "<final one-sentence assessment>",\n'
        '  "report": "<full markdown analysis covering purpose, structure, '
        'maintainability, security, and recommendations>"\n'
        "}\n\n"
        f"Similarity Results:\n{joined_results}\n\n"
        f"Code 1:\n{code1}\n\n"
        f"Code 2:\n{code2}"
    )

    raw = generate_ai_text(prompt)
    if not raw or raw.startswith("Unable") or raw.startswith("\u0644\u0627 \u064a\u0645\u0643\u0646"):
        return raw, None

    # Strip accidental markdown code fences.
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
        cleaned = cleaned.strip()

    try:
        structured = json.loads(cleaned)
        prose = structured.get("report") or raw
        return prose, structured
    except (json.JSONDecodeError, ValueError):
        return raw, None
