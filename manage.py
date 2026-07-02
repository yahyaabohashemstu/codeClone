#!/usr/bin/env python
"""Operational management CLI for CodeSimilar.

Small admin tasks that don't belong in the HTTP API. Runs inside a full app
context so it uses the same config/DB as the server.

Usage:
    python manage.py set-plan <username> <free|pro|team> [--status active]
    python manage.py show-plan <username>
    python manage.py send-test-email <address>
    python manage.py verify-user <username>        # mark email verified
"""

from __future__ import annotations

import argparse
import sys

from backend.app_factory import create_app
from backend.extensions import db
from backend.models import User
from backend.models.billing import PLANS


def _get_user(username: str) -> User:
    user = User.query.filter_by(username=username).first()
    if not user:
        print(f"error: no user named {username!r}", file=sys.stderr)
        raise SystemExit(2)
    return user


def cmd_set_plan(args) -> None:
    from backend.services.billing_service import set_plan, quota_summary

    if args.plan not in PLANS:
        print(f"error: unknown plan {args.plan!r} (choose from {', '.join(PLANS)})", file=sys.stderr)
        raise SystemExit(2)
    user = _get_user(args.username)
    set_plan(user.id, args.plan, status=args.status)
    print(f"OK: {user.username} -> {args.plan} ({args.status})")
    print(quota_summary(user.id))


def cmd_show_plan(args) -> None:
    from backend.services.billing_service import quota_summary

    user = _get_user(args.username)
    print(quota_summary(user.id))


def cmd_send_test_email(args) -> None:
    from backend.services.email_service import send_email

    ok = send_email(
        args.address,
        "CodeSimilar test email",
        "This is a test email from CodeSimilar. If you received it, SMTP is configured correctly.",
    )
    print("sent" if ok else "NOT sent (check EMAIL_PROVIDER / SMTP_* settings)")
    if not ok:
        raise SystemExit(1)


def cmd_verify_user(args) -> None:
    user = _get_user(args.username)
    user.email_verified = True
    db.session.commit()
    print(f"OK: {user.username} email marked verified")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CodeSimilar admin CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("set-plan", help="Set a user's subscription plan")
    p.add_argument("username")
    p.add_argument("plan", choices=list(PLANS))
    p.add_argument("--status", default="active")
    p.set_defaults(func=cmd_set_plan)

    p = sub.add_parser("show-plan", help="Show a user's plan and usage")
    p.add_argument("username")
    p.set_defaults(func=cmd_show_plan)

    p = sub.add_parser("send-test-email", help="Send a test email via the configured provider")
    p.add_argument("address")
    p.set_defaults(func=cmd_send_test_email)

    p = sub.add_parser("verify-user", help="Mark a user's email as verified")
    p.add_argument("username")
    p.set_defaults(func=cmd_verify_user)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    app = create_app()
    with app.app_context():
        args.func(args)


if __name__ == "__main__":
    main()
