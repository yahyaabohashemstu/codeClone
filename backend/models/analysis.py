"""Analysis model — persisted code-comparison results."""

from __future__ import annotations

from sqlalchemy.sql import func

from backend.extensions import db


class Analysis(db.Model):  # type: ignore[name-defined]
    """A single saved code-clone analysis run."""

    __tablename__ = "analysis"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    operation = db.Column(db.String(200), nullable=False, default="code clone analysis")
    result = db.Column(db.String(50), nullable=False, default="successful")
    language = db.Column(db.String(50), nullable=False, default="python")
    similarity = db.Column(db.Float, nullable=True)
    code1 = db.Column(db.Text, nullable=True)
    code2 = db.Column(db.Text, nullable=True)
    metrics = db.Column(db.Text, nullable=True)
    analysis_text = db.Column(db.Text, nullable=True)
    snapshot_json = db.Column(db.Text, nullable=True)
    date_created = db.Column(db.DateTime, nullable=False, server_default=func.now(), index=True)

    def __repr__(self) -> str:
        return f"<Analysis id={self.id} lang={self.language!r} sim={self.similarity}>"
