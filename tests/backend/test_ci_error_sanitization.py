"""The CI endpoint must never leak raw exception text to API-key holders."""

from __future__ import annotations

import os

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db


@pytest.fixture()
def ci_app(monkeypatch):
    monkeypatch.setenv("CI_API_KEY", "sanitization-test-key")
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "RATELIMIT_ENABLED": False,
    })
    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()


def test_pair_failure_is_generic(ci_app, monkeypatch):
    secret_detail = "secret-internal-path-C:/srv/keys/private.pem"

    def explode(*_args, **_kwargs):
        raise RuntimeError(secret_detail)

    import backend.api.v1.ci as ci_module
    monkeypatch.setattr(ci_module, "analyze_similarities", explode)

    client = ci_app.test_client()
    response = client.post(
        "/api/v1/ci/check",
        json={"language": "python", "pairs": [{"code_a": "x = 1", "code_b": "y = 2"}]},
        headers={"X-API-Key": "sanitization-test-key"},
    )
    assert response.status_code == 200  # failure of one pair is not a verdict failure
    body = response.get_data(as_text=True)
    assert secret_detail not in body
    result = response.get_json()["results"][0]
    assert result["error"] == "Analysis failed for this pair."
    assert result["code"] == "pair_analysis_failed"
