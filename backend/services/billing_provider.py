"""Selects the active payment provider for the billing routes.

Both :mod:`stripe_service` and :mod:`lemonsqueezy_service` expose the same surface
(``is_configured`` / ``create_checkout_session`` / ``change_subscription_plan`` /
``create_billing_portal_session`` / ``verify_webhook`` / ``apply_webhook_event``
/ ``billing_operational`` / ``NotConfiguredError``), so callers hold a module
reference and never branch on the provider.

Selection: ``BILLING_PROVIDER`` (``stripe`` | ``lemonsqueezy``) forces a provider;
otherwise Lemon Squeezy is chosen when ``LEMONSQUEEZY_API_KEY`` is set, else
Stripe. With neither configured this returns Stripe, whose ``is_configured()`` is
False, so billing endpoints return 503 exactly as before.
"""

from __future__ import annotations

from flask import current_app

from backend.services import lemonsqueezy_service, stripe_service

_LEMONSQUEEZY_ALIASES = {"lemonsqueezy", "lemon_squeezy", "lemon-squeezy", "lemon squeezy"}


def get_billing_provider():
    cfg = current_app.config
    choice = (cfg.get("BILLING_PROVIDER") or "").strip().lower()
    if choice == "stripe":
        return stripe_service
    if choice in _LEMONSQUEEZY_ALIASES:
        return lemonsqueezy_service
    if cfg.get("LEMONSQUEEZY_API_KEY"):
        return lemonsqueezy_service
    return stripe_service
