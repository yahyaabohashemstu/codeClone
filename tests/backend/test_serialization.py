"""
Tests for backend.utils.serialization — pure utility functions.

No Flask context required; these are all stateless data-transformation helpers.
"""

from __future__ import annotations

import datetime
import json

import pytest

from backend.utils.serialization import (
    build_error_response_payload,
    derive_source_label,
    ensure_dict,
    ensure_list,
    json_dumps_compact,
    json_loads_safe,
    normalize_datetime,
)


# ---------------------------------------------------------------------------
# json_dumps_compact
# ---------------------------------------------------------------------------

class TestJsonDumpsCompact:

    def test_compact_separators(self):
        """Output uses ',' and ':' separators with no whitespace."""
        result = json_dumps_compact({"a": 1, "b": 2})
        assert " " not in result
        assert '{"a":1,"b":2}' == result

    def test_non_ascii_preserved(self):
        """Non-ASCII characters (Arabic, CJK, etc.) are kept as-is."""
        result = json_dumps_compact({"msg": "مرحبا"})
        assert "مرحبا" in result
        # ensure_ascii=False means no \\uXXXX escapes
        assert "\\u" not in result

    def test_nested_structure(self):
        """Nested dicts/lists are serialized compactly."""
        data = {"items": [1, 2, {"nested": True}]}
        result = json_dumps_compact(data)
        parsed = json.loads(result)
        assert parsed == data


# ---------------------------------------------------------------------------
# json_loads_safe
# ---------------------------------------------------------------------------

class TestJsonLoadsSafe:

    def test_valid_json(self):
        """Parses valid JSON and returns the result."""
        assert json_loads_safe('{"key": "val"}', {}) == {"key": "val"}

    def test_invalid_json_returns_fallback(self):
        """Returns fallback for malformed JSON."""
        assert json_loads_safe("not json{{{", {"default": True}) == {"default": True}

    def test_none_input_returns_fallback(self):
        """Returns fallback when input is None."""
        assert json_loads_safe(None, []) == []

    def test_empty_string_returns_fallback(self):
        """Returns fallback when input is empty string."""
        assert json_loads_safe("", {"x": 1}) == {"x": 1}

    def test_type_mismatch_returns_fallback(self):
        """When parsed type differs from fallback type, return fallback."""
        # fallback is a dict, but JSON is a list
        assert json_loads_safe("[1, 2, 3]", {"default": True}) == {"default": True}
        # fallback is a list, but JSON is a dict
        assert json_loads_safe('{"a": 1}', [1, 2]) == [1, 2]

    def test_matching_types_returned(self):
        """When parsed type matches fallback type, return parsed."""
        assert json_loads_safe("[1, 2]", []) == [1, 2]
        assert json_loads_safe('{"a": 1}', {}) == {"a": 1}


# ---------------------------------------------------------------------------
# ensure_dict / ensure_list
# ---------------------------------------------------------------------------

class TestEnsureDict:

    def test_with_dict(self):
        d = {"key": "value"}
        assert ensure_dict(d) is d

    def test_with_non_dict_returns_empty(self):
        assert ensure_dict("string") == {}
        assert ensure_dict(42) == {}
        assert ensure_dict(None) == {}

    def test_with_non_dict_returns_fallback(self):
        fb = {"fallback": True}
        assert ensure_dict([1, 2, 3], fallback=fb) is fb


class TestEnsureList:

    def test_with_list(self):
        lst = [1, 2, 3]
        assert ensure_list(lst) is lst

    def test_with_non_list_returns_empty(self):
        assert ensure_list("string") == []
        assert ensure_list(42) == []
        assert ensure_list(None) == []
        assert ensure_list({"a": 1}) == []


# ---------------------------------------------------------------------------
# normalize_datetime
# ---------------------------------------------------------------------------

class TestNormalizeDatetime:

    def test_naive_datetime_gets_utc(self):
        """A naive datetime is annotated with UTC."""
        naive = datetime.datetime(2024, 1, 15, 10, 30, 0)
        result = normalize_datetime(naive)
        assert result is not None
        assert result.tzinfo is datetime.timezone.utc
        assert result.year == 2024

    def test_aware_datetime_unchanged(self):
        """An already-aware datetime is returned as-is."""
        aware = datetime.datetime(2024, 6, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)
        result = normalize_datetime(aware)
        assert result is aware

    def test_none_returns_none(self):
        """None input yields None output."""
        assert normalize_datetime(None) is None


# ---------------------------------------------------------------------------
# derive_source_label
# ---------------------------------------------------------------------------

class TestDeriveSourceLabel:

    def test_extracts_first_non_blank_line(self):
        code = "\n\n  def hello():\n    pass\n"
        label = derive_source_label(code, "Source A")
        assert label == "def hello():"

    def test_empty_code_returns_fallback(self):
        assert derive_source_label("", "Source A") == "Source A"
        assert derive_source_label(None, "Fallback") == "Fallback"

    def test_whitespace_only_returns_fallback(self):
        assert derive_source_label("   \n\n   \n", "Source B") == "Source B"

    def test_long_line_truncated_to_72(self):
        long_line = "x" * 200
        label = derive_source_label(long_line, "FB")
        assert len(label) == 72

    def test_collapses_internal_whitespace(self):
        code = "  def   foo(  a ,  b  ):  "
        label = derive_source_label(code, "FB")
        # Multiple spaces collapsed to single
        assert "  " not in label


# ---------------------------------------------------------------------------
# build_error_response_payload
# ---------------------------------------------------------------------------

class TestBuildErrorResponsePayload:

    def test_basic_structure(self):
        payload = build_error_response_payload("Something went wrong")
        assert payload["success"] is False
        assert payload["message"] == "Something went wrong"
        assert payload["error_message"] == "Something went wrong"

    def test_extra_kwargs_merged(self):
        payload = build_error_response_payload(
            "Bad input", status_code=422, details={"field": "name"}
        )
        assert payload["status_code"] == 422
        assert payload["details"] == {"field": "name"}
        assert payload["success"] is False

    def test_message_and_error_message_match(self):
        payload = build_error_response_payload("Error X")
        assert payload["message"] == payload["error_message"]
