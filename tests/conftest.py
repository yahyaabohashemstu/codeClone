"""
Shared pytest fixtures for the CodeClone test suite.

Provides application instances, test clients, database sessions,
and pre-built user accounts for use across all test modules.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models.user import User


# ---------------------------------------------------------------------------
# Application & client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    """Create a Flask application configured for testing (session scope)."""
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
    })

    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture()
def client(app):
    """Provide a Flask test client."""
    return app.test_client()


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session(app):
    """
    Yield a database session that rolls back after every test.

    This keeps each test isolated without requiring table recreation.
    """
    with app.app_context():
        connection = _db.engine.connect()
        transaction = connection.begin()

        # Bind the session to this connection so all ORM work uses it.
        options = {"bind": connection, "binds": {}}
        session = _db.create_scoped_session(options=options)
        old_session = _db.session
        _db.session = session

        yield session

        transaction.rollback()
        connection.close()
        session.remove()
        _db.session = old_session


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def test_user(app):
    """Create and persist a regular (non-admin) test user."""
    with app.app_context():
        user = User.query.filter_by(username="testuser").first()
        if user is None:
            user = User(username="testuser", is_admin=False)
            user.set_password("TestPass123!")
            _db.session.add(user)
            _db.session.commit()
        else:
            # Reset password in case a prior test changed it.
            user.set_password("TestPass123!")
            _db.session.commit()
        yield user
        # Cleanup
        User.query.filter_by(username="testuser").delete()
        _db.session.commit()


@pytest.fixture()
def admin_user(app):
    """Create and persist an admin user."""
    with app.app_context():
        user = User.query.filter_by(username="testadmin").first()
        if user is None:
            user = User(username="testadmin", is_admin=True)
            user.set_password("AdminPass123!")
            _db.session.add(user)
            _db.session.commit()
        else:
            user.set_password("AdminPass123!")
            user.is_admin = True
            _db.session.commit()
        yield user
        User.query.filter_by(username="testadmin").delete()
        _db.session.commit()


# ---------------------------------------------------------------------------
# Authenticated client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def auth_client(client, test_user, app):
    """
    Return a test client that is already logged in as ``test_user``.

    Uses the Flask login mechanism directly via the test request context
    to avoid dependency on the API login endpoint.
    """
    with client.session_transaction() as sess:
        sess["_user_id"] = str(test_user.id)
        sess["csrf_token"] = "test-csrf-token"
    yield client


@pytest.fixture()
def admin_client(client, admin_user, app):
    """
    Return a test client that is already logged in as ``admin_user``.
    """
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_user.id)
        sess["csrf_token"] = "test-csrf-token"
    yield client
