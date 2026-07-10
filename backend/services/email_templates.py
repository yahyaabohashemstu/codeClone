"""Branded HTML rendering for transactional email (verification, reset, …).

Returns a ``(text, html)`` pair so recipients on plain-text clients still get a
readable message while HTML clients get the designed version. Table-based layout
with inline CSS for broad email-client compatibility (Gmail, Apple Mail, Outlook,
mobile). No external assets — everything is inline so nothing is blocked.
"""

from __future__ import annotations

import datetime
import html as _html

BRAND = "CodeSimilar"
SUPPORT_EMAIL = "hello@clonelens.com"
SITE_URL = "https://clonelens.com"

# Palette
_INK = "#0f172a"
_MUTED = "#64748b"
_BG = "#eef2f8"
_CARD = "#ffffff"
_BORDER = "#e2e8f0"
_BTN = "#4f46e5"
_GRAD = "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a855f7 100%)"


def render_action_email(*, heading: str, intro: str, button_label: str,
                        button_url: str, outro: str | None = None) -> tuple[str, str]:
    """Return ``(text_body, html_body)`` for a single call-to-action email."""
    outro = outro or "If you didn't request this, you can safely ignore this email — no action is needed."
    year = datetime.datetime.now(datetime.timezone.utc).year

    text = (
        f"{heading}\n\n"
        f"{intro}\n\n"
        f"{button_label}:\n{button_url}\n\n"
        f"{outro}\n\n"
        f"— The {BRAND} team\n"
        f"Need help? {SUPPORT_EMAIL}\n{SITE_URL}"
    )

    h = _html.escape
    heading_e, intro_e, label_e, outro_e = h(heading), h(intro), h(button_label), h(outro)
    url_attr = h(button_url, quote=True)
    url_text = h(button_url)

    html_body = f"""\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{heading_e}</title>
</head>
<body style="margin:0;padding:0;background:{_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{intro_e}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:{_CARD};border:1px solid {_BORDER};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td style="background:{_BTN};background-image:{_GRAD};padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:38px;height:38px;background:rgba(255,255,255,.18);border-radius:10px;text-align:center;vertical-align:middle;color:#fff;font-weight:800;font-size:15px;">CS</td>
            <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-.02em;">{BRAND}</td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;color:{_INK};font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.02em;">{heading_e}</h1>
          <p style="margin:0 0 26px 0;color:{_MUTED};font-size:15px;line-height:1.65;">{intro_e}</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:{_BTN};background-image:{_GRAD};">
              <a href="{url_attr}" style="display:inline-block;padding:13px 30px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">{label_e}</a>
            </td>
          </tr></table>
          <p style="margin:26px 0 0 0;color:{_MUTED};font-size:12.5px;line-height:1.6;">
            Or paste this link into your browser:<br>
            <a href="{url_attr}" style="color:{_BTN};word-break:break-all;">{url_text}</a>
          </p>
        </td>
      </tr>
      <tr><td style="padding:8px 32px 0 32px;"><hr style="border:none;border-top:1px solid {_BORDER};margin:20px 0 0 0;"></td></tr>
      <tr>
        <td style="padding:18px 32px 30px 32px;">
          <p style="margin:0 0 10px 0;color:{_MUTED};font-size:12.5px;line-height:1.6;">{outro_e}</p>
          <p style="margin:0;color:{_MUTED};font-size:12.5px;line-height:1.6;">
            Need help? <a href="mailto:{SUPPORT_EMAIL}" style="color:{_BTN};text-decoration:none;">{SUPPORT_EMAIL}</a>
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0 0;color:#94a3b8;font-size:11.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      © {year} {BRAND} · <a href="{SITE_URL}" style="color:#94a3b8;text-decoration:underline;">clonelens.com</a>
    </p>
  </td></tr>
</table>
</body>
</html>"""
    return text, html_body
