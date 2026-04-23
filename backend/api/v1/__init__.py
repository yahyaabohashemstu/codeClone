"""
API v1 Blueprint — all core endpoints live under ``/api/v1/``.

Sub-modules register their routes onto *this* blueprint via
``v1_bp.route(...)`` or by attaching their own nested Blueprints.
"""

from __future__ import annotations

from flask import Blueprint

v1_bp = Blueprint("api_v1", __name__, url_prefix="/api/v1")

# ── Eagerly import route modules so their decorators register ───────────
from backend.api.v1 import auth as _auth  # noqa: F401, E402
from backend.api.v1 import analysis as _analysis  # noqa: F401, E402
from backend.api.v1 import history as _history  # noqa: F401, E402
from backend.api.v1 import analytics as _analytics  # noqa: F401, E402
from backend.api.v1 import health as _health  # noqa: F401, E402
from backend.api.v1 import chat as _chat  # noqa: F401, E402
from backend.api.v1 import home as _home  # noqa: F401, E402
from backend.api.v1 import ci as _ci  # noqa: F401, E402
