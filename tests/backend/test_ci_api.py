"""Tests for the CI/CD integration endpoint ``POST /api/v1/ci/check``."""

from __future__ import annotations

import os
import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db


@pytest.fixture(scope="module")
def ci_app():
    """Create an app configured for CI endpoint testing."""
    # Save and restore any pre-existing value instead of unconditionally
    # popping it — a developer's real CI_API_KEY must survive the test run.
    previous_ci_key = os.environ.get("CI_API_KEY")
    os.environ["CI_API_KEY"] = "test-ci-key-12345"
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()
    if previous_ci_key is None:
        os.environ.pop("CI_API_KEY", None)
    else:
        os.environ["CI_API_KEY"] = previous_ci_key


@pytest.fixture
def ci_client(ci_app):
    return ci_app.test_client()


VALID_HEADERS = {
    "Authorization": "Bearer test-ci-key-12345",
    "Content-Type": "application/json",
}

PYTHON_CODE_A = """
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
"""

PYTHON_CODE_B = """
def fib(num):
    if num <= 1:
        return num
    return fib(num - 1) + fib(num - 2)
"""

PYTHON_CODE_DIFFERENT = """
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
"""


class TestCiAuthentication:
    """Tests for CI endpoint authentication."""

    def test_no_auth_returns_401(self, ci_client):
        """Request without API key is rejected."""
        resp = ci_client.post("/api/v1/ci/check", json={
            "pairs": [{"code_a": "x", "code_b": "y"}],
        })
        assert resp.status_code == 401
        assert resp.get_json()["code"] == "authentication_required"

    def test_wrong_key_returns_401(self, ci_client):
        """Request with wrong API key is rejected."""
        resp = ci_client.post("/api/v1/ci/check",
            json={"pairs": [{"code_a": "x", "code_b": "y"}]},
            headers={"Authorization": "Bearer wrong-key", "Content-Type": "application/json"},
        )
        assert resp.status_code == 401

    def test_x_api_key_header_works(self, ci_client):
        """X-API-Key header is accepted as alternative to Bearer."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "language": "python",
                "pairs": [{"code_a": PYTHON_CODE_A, "code_b": PYTHON_CODE_DIFFERENT}],
            },
            headers={"X-API-Key": "test-ci-key-12345", "Content-Type": "application/json"},
        )
        assert resp.status_code in (200, 422)
        assert resp.get_json()["success"] is True


class TestCiValidation:
    """Tests for input validation."""

    def test_empty_body_returns_400(self, ci_client):
        resp = ci_client.post("/api/v1/ci/check",
            data="not json",
            headers={"Authorization": "Bearer test-ci-key-12345"},
        )
        assert resp.status_code == 400

    def test_missing_pairs_returns_400(self, ci_client):
        resp = ci_client.post("/api/v1/ci/check",
            json={"language": "python"},
            headers=VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "missing_pairs"

    def test_invalid_language_returns_400(self, ci_client):
        resp = ci_client.post("/api/v1/ci/check",
            json={"language": "brainfuck", "pairs": [{"code_a": "x", "code_b": "y"}]},
            headers=VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "unsupported_language"

    def test_threshold_out_of_range_returns_400(self, ci_client):
        resp = ci_client.post("/api/v1/ci/check",
            json={"threshold": 150, "pairs": [{"code_a": "x", "code_b": "y"}]},
            headers=VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "invalid_threshold"

    def test_too_many_pairs_returns_400(self, ci_client):
        pairs = [{"code_a": "x = 1", "code_b": "y = 2"} for _ in range(51)]
        resp = ci_client.post("/api/v1/ci/check",
            json={"pairs": pairs},
            headers=VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "too_many_pairs"

    def test_empty_code_returns_400(self, ci_client):
        resp = ci_client.post("/api/v1/ci/check",
            json={"pairs": [{"code_a": "", "code_b": "print(1)"}]},
            headers=VALID_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.get_json()["code"] == "empty_code"


class TestCiAnalysis:
    """Tests for the actual similarity analysis."""

    def test_similar_code_fails(self, ci_client):
        """Highly similar code (renamed variables) should fail with default threshold."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "language": "python",
                "threshold": 70,
                "pairs": [{
                    "label_a": "student-A/fib.py",
                    "label_b": "student-B/fib.py",
                    "code_a": PYTHON_CODE_A,
                    "code_b": PYTHON_CODE_B,
                }],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        assert data["success"] is True
        assert data["verdict"] == "fail"
        assert data["violations"] == 1
        assert resp.status_code == 422
        assert data["results"][0]["is_violation"] is True
        assert data["results"][0]["combined_similarity"] > 70

    def test_different_code_passes(self, ci_client):
        """Very different code should pass."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "language": "python",
                "threshold": 80,
                "pairs": [{
                    "code_a": PYTHON_CODE_A,
                    "code_b": PYTHON_CODE_DIFFERENT,
                }],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        assert data["success"] is True
        assert data["verdict"] == "pass"
        assert data["violations"] == 0
        assert resp.status_code == 200

    def test_multiple_pairs(self, ci_client):
        """Multiple pairs are analyzed independently."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "language": "python",
                "threshold": 70,
                "pairs": [
                    {"code_a": PYTHON_CODE_A, "code_b": PYTHON_CODE_B, "label_a": "pair1-a", "label_b": "pair1-b"},
                    {"code_a": PYTHON_CODE_A, "code_b": PYTHON_CODE_DIFFERENT, "label_a": "pair2-a", "label_b": "pair2-b"},
                ],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        assert data["success"] is True
        assert data["total_pairs"] == 2
        assert len(data["results"]) == 2
        assert data["results"][0]["label_a"] == "pair1-a"
        assert data["results"][1]["label_a"] == "pair2-a"

    def test_response_includes_timing(self, ci_client):
        """Response includes duration_ms field."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "pairs": [{"code_a": PYTHON_CODE_A, "code_b": PYTHON_CODE_DIFFERENT}],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        assert "duration_ms" in data
        assert isinstance(data["duration_ms"], int)
        assert data["duration_ms"] >= 0

    def test_clone_types_in_response(self, ci_client):
        """Response includes detected clone types."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "language": "python",
                "pairs": [{"code_a": PYTHON_CODE_A, "code_b": PYTHON_CODE_B}],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        result = data["results"][0]
        assert "clone_types_detected" in result
        assert isinstance(result["clone_types_detected"], list)

    def test_custom_labels_preserved(self, ci_client):
        """Custom labels are preserved in the response."""
        resp = ci_client.post("/api/v1/ci/check",
            json={
                "pairs": [{
                    "label_a": "my-file-a.py",
                    "label_b": "my-file-b.py",
                    "code_a": PYTHON_CODE_A,
                    "code_b": PYTHON_CODE_DIFFERENT,
                }],
            },
            headers=VALID_HEADERS,
        )
        data = resp.get_json()
        assert data["results"][0]["label_a"] == "my-file-a.py"
        assert data["results"][0]["label_b"] == "my-file-b.py"


class TestCiLanguages:
    """Tests for the languages endpoint."""

    def test_returns_language_list(self, ci_client):
        resp = ci_client.get("/api/v1/ci/languages")
        data = resp.get_json()
        assert data["success"] is True
        assert "python" in data["languages"]
        assert "javascript" in data["languages"]
        assert len(data["languages"]) >= 15
