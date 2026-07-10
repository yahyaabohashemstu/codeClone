#!/usr/bin/env python
"""Generate a complete OpenAPI 3.0 spec from the live Flask route table.

The hand-maintained docs/openapi.yaml drifted badly (it documented ~13 of ~50
canonical endpoints, omitting the entire enterprise API, admin, account, 2FA,
API-key and billing-portal surface). Rather than hand-author dozens of schemas
that drift again, this script introspects the real url_map so the spec is
exhaustive and reproducible.

Usage:
    python tools/generate_openapi.py            # writes docs/openapi.yaml
    python tools/generate_openapi.py --check     # exit 1 if the file is stale

Coverage is complete (every canonical endpoint is present with method, path
params, security and a response envelope). Request/response bodies are described
at the envelope level; deepen individual schemas as needed.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Endpoints reachable without a session (public self-service, signature-auth, health).
_PUBLIC_ENDPOINTS = {
    "api_v1.api_login", "api_v1.api_signup", "api_v1.api_verify_email",
    "api_v1.api_resend_verification", "api_v1.api_request_password_reset",
    "api_v1.api_reset_password", "api_v1.api_2fa_login", "api_v1.api_session",
    "api_v1.api_billing_plans", "api_v1.api_billing_webhook", "api_v1.health_check",
    "api_v1.metrics_endpoint", "enterprise_api.enterprise_health",
    "enterprise_api.github_webhook", "enterprise_api.gitlab_webhook",
}
# Endpoints authenticated by API key (Bearer / X-API-Key) rather than a session.
_APIKEY_PREFIXES = ("enterprise_api.",)
_APIKEY_ENDPOINTS = {"api_v1.ci_check"}


def _humanize(endpoint: str) -> str:
    name = endpoint.split(".")[-1]
    name = re.sub(r"^(api_v1_|api_|legacy_)", "", name)
    words = name.replace("_", " ").strip()
    return words[:1].upper() + words[1:] if words else endpoint


def _tag_for(path: str) -> str:
    if path.startswith("/api/enterprise") or "/enterprise/" in path:
        return "enterprise"
    if path.startswith("/api/integrations"):
        return "webhooks"
    m = re.match(r"^/api/v1/([a-z0-9\-]+)", path)
    if m:
        seg = m.group(1)
        return {"auth": "auth", "billing": "billing", "admin": "admin",
                "account": "account", "api-keys": "api-keys", "analysis": "analysis",
                "history": "history", "analytics": "analytics", "chat": "chat",
                "ci": "ci", "health": "health", "home": "home",
                "session": "auth", "metrics": "observability"}.get(seg, seg)
    return "core"


def _security_for(endpoint: str) -> list:
    if endpoint in _PUBLIC_ENDPOINTS:
        return []
    if endpoint in _APIKEY_ENDPOINTS or endpoint.startswith(_APIKEY_PREFIXES):
        return [{"apiKeyAuth": []}, {"bearerAuth": []}]
    return [{"cookieAuth": []}]


def _params_for(rule) -> list:
    # rule.arguments is a SET (hash-randomized order across processes), which
    # made the generated spec non-deterministic and broke --check. Extract path
    # params in their order of appearance in the rule instead — deterministic
    # and matches the path.
    params = []
    seen = set()
    for m in re.finditer(r"<(?:[^:<>]+:)?([^<>]+)>", str(rule.rule)):
        arg = m.group(1)
        if arg in seen:
            continue
        seen.add(arg)
        conv = rule._converters.get(arg)
        schema = {"type": "integer"} if conv and "Integer" in type(conv).__name__ else {"type": "string"}
        params.append({"name": arg, "in": "path", "required": True, "schema": schema})
    return params


def build_spec(app) -> dict:
    ok = {"description": "Success",
          "content": {"application/json": {"schema": {"$ref": "#/components/schemas/SuccessEnvelope"}}}}
    err = {"description": "Error",
           "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}}}

    paths: dict = {}
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: str(r.rule)):
        endpoint = rule.endpoint
        # Document the canonical API only; the /api/* legacy routes are 307
        # redirect shims to their /api/v1 equivalents.
        if not (endpoint.startswith("api_v1.") or endpoint.startswith("enterprise_api.")):
            continue
        methods = sorted(m for m in rule.methods if m not in ("HEAD", "OPTIONS"))
        if not methods:
            continue
        # Flask path param syntax -> OpenAPI {name}
        oapi_path = re.sub(r"<(?:[^:<>]+:)?([^<>]+)>", r"{\1}", str(rule.rule))
        item = paths.setdefault(oapi_path, {})
        params = _params_for(rule)
        for method in methods:
            op = {
                "tags": [_tag_for(str(rule.rule))],
                "summary": _humanize(endpoint),
                "operationId": f"{method.lower()}_{endpoint.replace('.', '_')}",
                "security": _security_for(endpoint),
                "responses": {"200": ok, "400": err, "401": err, "403": err, "404": err},
            }
            if params:
                op["parameters"] = params
            if method in ("POST", "PUT", "PATCH"):
                op["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object"}}},
                }
            item[method.lower()] = op

    return {
        "openapi": "3.0.3",
        "info": {
            "title": "Clone Lens API",
            "version": "1.0.0",
            "description": (
                "Complete, auto-generated surface of the Clone Lens REST API "
                "(core v1 + enterprise). Regenerate with `python "
                "tools/generate_openapi.py`. The /api/* (unversioned) paths are "
                "307 redirects to their /api/v1 equivalents and are omitted here."
            ),
        },
        "servers": [{"url": "/", "description": "Same-origin (no CORS by design)"}],
        "tags": [{"name": t} for t in sorted({op["tags"][0]
                  for pi in paths.values() for op in pi.values()})],
        "components": {
            "securitySchemes": {
                "cookieAuth": {"type": "apiKey", "in": "cookie", "name": "session",
                               "description": "Flask-Login session cookie. Mutating requests also require the X-CSRF-Token header."},
                "apiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"},
                "bearerAuth": {"type": "http", "scheme": "bearer"},
            },
            "schemas": {
                "SuccessEnvelope": {
                    "type": "object",
                    "properties": {"success": {"type": "boolean", "example": True}},
                    "additionalProperties": True,
                },
                "ErrorEnvelope": {
                    "type": "object",
                    "properties": {
                        "success": {"type": "boolean", "example": False},
                        "message": {"type": "string"},
                        "code": {"type": "string"},
                    },
                },
            },
        },
        "paths": paths,
    }


def _make_app():
    os.environ.setdefault("FLASK_ENV", "testing")
    from backend.app_factory import create_app
    return create_app({
        "TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "openapi-gen", "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
    })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if openapi.yaml is stale")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "docs", "openapi.yaml"))
    args = parser.parse_args()

    spec = build_spec(_make_app())
    rendered = yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=100)
    out_path = os.path.abspath(args.out)

    if args.check:
        existing = open(out_path, encoding="utf-8").read() if os.path.exists(out_path) else ""
        if existing.strip() != rendered.strip():
            print("docs/openapi.yaml is out of date; run: python tools/generate_openapi.py", file=sys.stderr)
            return 1
        print("docs/openapi.yaml is up to date.")
        return 0

    # Write LF explicitly (repo .gitattributes normalizes to LF) so the file is
    # byte-identical across platforms and `--check` is stable in CI.
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(rendered)
    print(f"Wrote {out_path} ({len(spec['paths'])} paths).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
