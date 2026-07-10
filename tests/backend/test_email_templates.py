"""The branded transactional-email template renders safe, complete HTML + text."""

from __future__ import annotations

from backend.services.email_templates import SUPPORT_EMAIL, render_action_email


def test_renders_button_url_in_both_parts():
    url = "https://clonelens.com/verify-email?token=abc123"
    text, html = render_action_email(
        heading="Confirm your email", intro="Welcome to Clone Lens!",
        button_label="Verify email address", button_url=url,
    )
    assert url in text
    assert url in html
    assert "<html" in html and "</html>" in html
    assert "Confirm your email" in html
    assert "Verify email address" in html


def test_includes_support_contact():
    _text, html = render_action_email(
        heading="Reset your password", intro="x", button_label="Reset", button_url="https://clonelens.com/x",
    )
    assert SUPPORT_EMAIL in html
    assert f"mailto:{SUPPORT_EMAIL}" in html


def test_escapes_untrusted_content():
    text, html = render_action_email(
        heading="Hi <script>alert(1)</script>", intro="a & b < c",
        button_label="Go", button_url="https://clonelens.com/x",
    )
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert "a &amp; b &lt; c" in html
    # Plain-text part keeps the raw characters (no HTML there).
    assert "<script>" in text
