"""Branded HTML rendering for transactional email (verification, reset, …).

Returns a ``(text, html)`` pair so recipients on plain-text clients still get a
readable message while HTML clients get the designed version. Table-based layout
with inline CSS for broad email-client compatibility (Gmail, Apple Mail, Outlook,
mobile). No external assets — everything is inline so nothing is blocked.

Visual identity is Press Check (see DESIGN.md): the sheet sits on the press bed,
a registration strip lays plate A (cyan) and plate B (magenta) either side of the
overprint where they agree, corners are square, and nothing is a gradient.
"""

from __future__ import annotations

import datetime
import html as _html

BRAND = "Clone Lens"
SUPPORT_EMAIL = "hello@clonelens.com"
SITE_URL = "https://clonelens.com"

# Press Check palette — the literal hex of the app's design tokens (index.css).
# Email clients cannot read CSS custom properties, so the values are resolved
# here; keep them in sync with :root if the tokens ever move.
_INK = "#131820"        # --foreground   216 25% 10%  (rich black, cyan lean)
_MUTED = "#515a67"      # --muted-foreground 215 12% 36%
_FAINT = "#8a929d"      # colophon voice, below the sheet
_BED = "#e3e7eb"        # --background   210 14% 91%  (the press bed)
_SHEET = "#fcfcfd"      # --card         210 20% 99%  (the proof sheet)
_BORDER = "#c5cbd3"     # --border       212 14% 80%
_OVERPRINT = "#3e2c8c"  # --primary      251 52% 36%  (cyan x magenta together)
_PLATE_A = "#00a0d1"    # --plate-a      194 100% 41% (process cyan, source A)
_PLATE_A_DEEP = "#005f85"
_PLATE_B = "#e90c82"    # --plate-b      328 90% 48%  (process magenta, source B)
_PLATE_B_DEEP = "#970c4f"

# Archivo is the product's display voice; it only resolves for recipients who
# happen to have it, so the grotesque fallback stack carries the real weight.
_SANS = "Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
# Machine text (URLs, tokens) is set in mono — the same rule the UI follows.
_MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Consolas,Menlo,monospace"

# Outlook's Word engine ignores text-transform, so casing is baked in here.
_WORDMARK = BRAND.upper()
_DOMAIN = SITE_URL.split("//", 1)[-1].upper()


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
<meta name="supported-color-schemes" content="light">
<title>{heading_e}</title>
</head>
<body style="margin:0;padding:0;background:{_BED};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{intro_e}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BED};padding:36px 12px;">
  <tr><td align="center">

    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:{_SHEET};border:1px solid {_BORDER};font-family:{_SANS};">

      <tr><td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="40%" height="5" style="height:5px;background:{_PLATE_A};font-size:0;line-height:0;">&nbsp;</td>
          <td width="20%" height="5" style="height:5px;background:{_OVERPRINT};font-size:0;line-height:0;">&nbsp;</td>
          <td width="40%" height="5" style="height:5px;background:{_PLATE_B};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:26px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="color:{_INK};font-size:17px;font-weight:800;letter-spacing:.14em;">{_WORDMARK}</td>
          <td align="right" style="color:{_MUTED};font-family:{_MONO};font-size:10px;letter-spacing:.1em;">{_DOMAIN}</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:12px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td height="2" style="height:2px;background:{_INK};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:28px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;color:{_INK};font-size:23px;line-height:1.25;font-weight:800;letter-spacing:-.015em;">{heading_e}</h1>
        <p style="margin:0 0 26px 0;color:{_MUTED};font-size:15px;line-height:1.65;">{intro_e}</p>

        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:{_OVERPRINT};border:1px solid {_OVERPRINT};">
            <a href="{url_attr}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.03em;text-decoration:none;">{label_e}</a>
          </td>
        </tr></table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:26px 0 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="border-left:2px solid {_PLATE_A};padding:2px 0 2px 12px;">
                <div style="color:{_MUTED};font-family:{_MONO};font-size:10px;letter-spacing:.1em;padding-bottom:5px;">OR PASTE THIS LINK</div>
                <a href="{url_attr}" style="color:{_OVERPRINT};font-family:{_MONO};font-size:11.5px;line-height:1.6;word-break:break-all;">{url_text}</a>
              </td>
            </tr></table>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:26px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td height="1" style="height:1px;background:{_BORDER};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:18px 32px 26px 32px;">
        <p style="margin:0 0 10px 0;color:{_MUTED};font-size:12.5px;line-height:1.6;">{outro_e}</p>
        <p style="margin:0;color:{_MUTED};font-size:12.5px;line-height:1.6;">
          Need help? <a href="mailto:{SUPPORT_EMAIL}" style="color:{_OVERPRINT};text-decoration:none;font-weight:600;">{SUPPORT_EMAIL}</a>
        </p>
      </td></tr>

      <tr><td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="17%" height="6" style="height:6px;background:{_PLATE_A};font-size:0;line-height:0;">&nbsp;</td>
          <td width="17%" height="6" style="height:6px;background:{_PLATE_A_DEEP};font-size:0;line-height:0;">&nbsp;</td>
          <td width="16%" height="6" style="height:6px;background:{_OVERPRINT};font-size:0;line-height:0;">&nbsp;</td>
          <td width="16%" height="6" style="height:6px;background:{_PLATE_B_DEEP};font-size:0;line-height:0;">&nbsp;</td>
          <td width="17%" height="6" style="height:6px;background:{_PLATE_B};font-size:0;line-height:0;">&nbsp;</td>
          <td width="17%" height="6" style="height:6px;background:{_INK};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>

    </table>

    <p style="margin:16px 0 0 0;color:{_FAINT};font-size:11px;font-family:{_MONO};letter-spacing:.06em;">
      &copy; {year} {_WORDMARK} &middot; <a href="{SITE_URL}" style="color:{_FAINT};text-decoration:underline;">{_DOMAIN}</a>
    </p>
  </td></tr>
</table>
</body>
</html>"""
    return text, html_body
