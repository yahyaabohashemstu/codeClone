"""Selects the active payment provider for the billing routes.

:mod:`stripe_service`, :mod:`lemonsqueezy_service` and :mod:`paddle_service` all
expose the same surface (``is_configured`` / ``create_checkout_session`` /
``change_subscription_plan`` / ``create_billing_portal_session`` /
``verify_webhook`` / ``apply_webhook_event`` / ``billing_operational`` /
``NotConfiguredError``), so callers hold a module reference and never branch on
the provider.

Selection: ``BILLING_PROVIDER`` (``stripe`` | ``lemonsqueezy`` | ``paddle``) forces
a provider. Otherwise it is inferred from whichever API key is set, and that
fallback is ordered deliberately: **Lemon Squeezy wins over Paddle**, so adding a
``PADDLE_API_KEY`` to a deployment that is already selling through Lemon Squeezy
cannot silently move live billing onto a provider whose prices and webhook are not
wired up yet. Say ``BILLING_PROVIDER=paddle`` to make that switch on purpose.

With nothing configured this returns Stripe, whose ``is_configured()`` is False, so
billing endpoints return 503 exactly as before.
"""

from __future__ import annotations

from flask import current_app

from backend.services import lemonsqueezy_service, paddle_service, stripe_service

_LEMONSQUEEZY_ALIASES = {"lemonsqueezy", "lemon_squeezy", "lemon-squeezy", "lemon squeezy"}
_PADDLE_ALIASES = {"paddle", "paddle_billing", "paddle-billing"}


def get_billing_provider():
    cfg = current_app.config
    choice = (cfg.get("BILLING_PROVIDER") or "").strip().lower()
    if choice == "stripe":
        return stripe_service
    if choice in _LEMONSQUEEZY_ALIASES:
        return lemonsqueezy_service
    if choice in _PADDLE_ALIASES:
        return paddle_service
    if cfg.get("LEMONSQUEEZY_API_KEY"):
        return lemonsqueezy_service
    if cfg.get("PADDLE_API_KEY"):
        return paddle_service
    return stripe_service
