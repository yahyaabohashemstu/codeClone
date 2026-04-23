"""
Tests for the SQLAlchemy models: User and Analysis.

Covers creation, password hashing / verification, default values,
relationships, and repr methods.
"""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from backend.extensions import db
from backend.models.user import User
from backend.models.analysis import Analysis


# ---------------------------------------------------------------------------
# User model
# ---------------------------------------------------------------------------

class TestUserModel:

    def test_user_creation(self, app):
        """A new User record can be persisted and read back."""
        with app.app_context():
            user = User(username="model_test_user", is_admin=False)
            user.set_password("Str0ngP@ss!")
            db.session.add(user)
            db.session.commit()

            fetched = User.query.filter_by(username="model_test_user").first()
            assert fetched is not None
            assert fetched.username == "model_test_user"

            # cleanup
            db.session.delete(fetched)
            db.session.commit()

    def test_user_set_password_hashes(self, app):
        """set_password must store a hash, not the raw password."""
        with app.app_context():
            user = User(username="_hash_test")
            user.set_password("plaintext")
            assert user.password_hash is not None
            assert user.password_hash != "plaintext"
            assert len(user.password_hash) > 20

    def test_user_check_password_correct(self, app, test_user):
        """check_password returns True for the correct password."""
        with app.app_context():
            assert test_user.check_password("TestPass123!") is True

    def test_user_check_password_wrong(self, app, test_user):
        """check_password returns False for an incorrect password."""
        with app.app_context():
            assert test_user.check_password("WrongPassword") is False

    def test_user_username_unique(self, app, test_user):
        """Inserting a duplicate username raises IntegrityError."""
        with app.app_context():
            duplicate = User(username="testuser")
            duplicate.set_password("anything")
            db.session.add(duplicate)
            with pytest.raises(IntegrityError):
                db.session.commit()
            db.session.rollback()

    def test_user_is_admin_default_false(self, app):
        """is_admin defaults to False when not explicitly set."""
        with app.app_context():
            user = User(username="_admin_default")
            user.set_password("pass123456")
            db.session.add(user)
            db.session.commit()

            fetched = User.query.filter_by(username="_admin_default").first()
            assert fetched.is_admin is False

            db.session.delete(fetched)
            db.session.commit()

    def test_user_repr(self, app, test_user):
        """User.__repr__ includes the username."""
        with app.app_context():
            r = repr(test_user)
            assert "testuser" in r
            assert "User" in r


# ---------------------------------------------------------------------------
# Analysis model
# ---------------------------------------------------------------------------

class TestAnalysisModel:

    def test_analysis_creation(self, app, test_user):
        """An Analysis record can be persisted and read back."""
        with app.app_context():
            analysis = Analysis(
                user_id=test_user.id,
                operation="code clone analysis",
                result="successful",
                language="python",
                similarity=0.85,
                code1="print('hello')",
                code2="print('world')",
            )
            db.session.add(analysis)
            db.session.commit()

            fetched = db.session.get(Analysis, analysis.id)
            assert fetched is not None
            assert fetched.language == "python"
            assert fetched.similarity == pytest.approx(0.85)

            db.session.delete(fetched)
            db.session.commit()

    def test_analysis_default_values(self, app, test_user):
        """Default column values are applied when not supplied."""
        with app.app_context():
            analysis = Analysis(user_id=test_user.id)
            db.session.add(analysis)
            db.session.commit()

            fetched = db.session.get(Analysis, analysis.id)
            assert fetched.operation == "code clone analysis"
            assert fetched.result == "successful"
            assert fetched.language == "python"

            db.session.delete(fetched)
            db.session.commit()

    def test_analysis_user_relationship(self, app, test_user):
        """Analysis.user back-reference points to the owning User."""
        with app.app_context():
            analysis = Analysis(
                user_id=test_user.id,
                code1="a = 1",
                code2="b = 2",
            )
            db.session.add(analysis)
            db.session.commit()

            fetched = db.session.get(Analysis, analysis.id)
            assert fetched.user.id == test_user.id
            assert fetched.user.username == "testuser"

            db.session.delete(fetched)
            db.session.commit()

    def test_analysis_date_created_auto(self, app, test_user):
        """date_created is automatically populated by the database."""
        with app.app_context():
            analysis = Analysis(
                user_id=test_user.id,
                code1="x = 1",
                code2="y = 2",
            )
            db.session.add(analysis)
            db.session.commit()

            fetched = db.session.get(Analysis, analysis.id)
            assert fetched.date_created is not None

            db.session.delete(fetched)
            db.session.commit()

    def test_analysis_similarity_float(self, app, test_user):
        """similarity stores and returns a float value."""
        with app.app_context():
            analysis = Analysis(
                user_id=test_user.id,
                similarity=0.42,
                code1="a",
                code2="b",
            )
            db.session.add(analysis)
            db.session.commit()

            fetched = db.session.get(Analysis, analysis.id)
            assert isinstance(fetched.similarity, float)
            assert fetched.similarity == pytest.approx(0.42)

            db.session.delete(fetched)
            db.session.commit()

    def test_analysis_repr(self, app, test_user):
        """Analysis.__repr__ includes id, language, and similarity."""
        with app.app_context():
            analysis = Analysis(
                user_id=test_user.id,
                language="javascript",
                similarity=0.77,
                code1="const a = 1;",
                code2="const b = 2;",
            )
            db.session.add(analysis)
            db.session.commit()

            r = repr(analysis)
            assert "Analysis" in r
            assert "javascript" in r

            db.session.delete(analysis)
            db.session.commit()
