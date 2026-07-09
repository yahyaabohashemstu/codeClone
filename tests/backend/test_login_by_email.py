"""Login accepts either a username or an email address as the identifier.

This backs the "I forgot my username" recovery path: a user who remembers only
the email they signed up with can still sign in. Username lookup is tried first;
an email fallback runs only when the value contains ``@`` and no username matched.
"""

from __future__ import annotations

import pytest

from backend.extensions import db
from backend.models.user import User


@pytest.fixture()
def email_user(app):
    """A user with both a username and a (lower-cased) email on file."""
    with app.app_context():
        User.query.filter_by(username="emailuser").delete()
        db.session.commit()
        user = User(username="emailuser", email="person@example.com", is_admin=False)
        user.set_password("EmailPass123!")
        db.session.add(user)
        db.session.commit()
        yield user
        User.query.filter_by(username="emailuser").delete()
        db.session.commit()


class TestLoginByEmail:

    def test_login_with_username_still_works(self, client, email_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "emailuser", "password": "EmailPass123!",
        })
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

    def test_login_with_email_as_identifier(self, client, email_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "person@example.com", "password": "EmailPass123!",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["username"] == "emailuser"

    def test_login_with_email_is_case_insensitive(self, client, email_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "Person@Example.COM", "password": "EmailPass123!",
        })
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

    def test_login_with_email_wrong_password(self, client, email_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "person@example.com", "password": "WrongPass999!",
        })
        assert resp.status_code == 401
        assert resp.get_json()["success"] is False

    def test_login_with_unknown_email(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "username": "nobody@nowhere.test", "password": "whatever12",
        })
        assert resp.status_code == 401

    def test_identifier_key_is_accepted(self, client, email_user):
        # The relaxed handler also accepts an explicit ``identifier`` key.
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "person@example.com", "password": "EmailPass123!",
        })
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True
