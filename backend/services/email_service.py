"""Transactional email delivery.

A thin, provider-agnostic wrapper so the rest of the app calls one function,
``send_email``, regardless of how mail is actually delivered.  The provider is
chosen by the ``EMAIL_PROVIDER`` config value:

* ``console``  (default) — log the message to the application logger.  Lets the
  whole account flow work in development with no SMTP server; the verification /
  reset link appears in the server logs.
* ``smtp``     — deliver via ``smtplib`` using the ``SMTP_*`` config.
* ``disabled`` — silently drop (returns ``False``).

Delivery failures never raise into the request path — callers treat email as
best-effort and must not leak whether an address exists.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from flask import current_app

logger = logging.getLogger(__name__)


def send_email(to_address: str, subject: str, body: str, html_body: str | None = None) -> bool:
    """Send an email. Returns True on apparent success, False otherwise.

    Never raises: transactional email is best-effort from the caller's view.
    """
    provider = current_app.config.get("EMAIL_PROVIDER", "console").lower()
    sender = current_app.config.get("EMAIL_FROM", "no-reply@clonelens.com")

    if not to_address:
        return False

    if provider == "disabled":
        return False

    if provider == "console":
        # SECURITY: the message body carries live, single-use bearer tokens
        # (password-reset and email-verification links). Writing it to the
        # application log would route account-takeover credentials to log
        # aggregators readable by a far broader, lower-trust audience than the
        # recipient's mailbox. Log only non-secret envelope metadata; include
        # the body ONLY under an interactive debug run (never in production —
        # ProductionConfig also refuses to boot with EMAIL_PROVIDER=console).
        if current_app.debug:
            logger.info(
                "[email:console] To=%s From=%s Subject=%s\n%s",
                to_address, sender, subject, body,
            )
        else:
            logger.info(
                "[email:console] To=%s From=%s Subject=%s "
                "(body suppressed — set EMAIL_PROVIDER=smtp to deliver, or run in debug to log it)",
                to_address, sender, subject,
            )
        return True

    if provider == "smtp":
        return _send_smtp(sender, to_address, subject, body, html_body)

    logger.warning("Unknown EMAIL_PROVIDER %r — email not sent.", provider)
    return False


def _send_smtp(sender: str, to_address: str, subject: str, body: str, html_body: str | None) -> bool:
    host = current_app.config.get("SMTP_HOST", "")
    if not host:
        logger.error("EMAIL_PROVIDER=smtp but SMTP_HOST is not configured — email not sent.")
        return False
    port = int(current_app.config.get("SMTP_PORT", 587))
    username = current_app.config.get("SMTP_USERNAME", "")
    password = current_app.config.get("SMTP_PASSWORD", "")
    use_tls = bool(current_app.config.get("SMTP_USE_TLS", True))

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls()
            if username:
                server.login(username, password)
            server.send_message(message)
        return True
    except Exception:
        logger.exception("SMTP delivery to %s failed.", to_address)
        return False
