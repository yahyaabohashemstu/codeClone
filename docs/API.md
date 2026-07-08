# CodeClone Public API Reference

CodeClone exposes a small, stable HTTP API so you can run clone/similarity
detection **programmatically** — from a CI/CD pipeline, a grading script, or any
backend service — without the web UI.

- **Base URL:** `https://<your-codeclone-host>` (your deployed instance; e.g. `https://codeclone.example.com`)
- **API prefix:** all endpoints live under `/api/v1`
- **Content type:** `application/json` for every request and response
- **Transport:** HTTPS only in production

There are two groups of endpoints:

| Group | Auth | Who calls it |
|---|---|---|
| **Key management** (`/api/v1/api-keys`) | Session cookie (logged-in web user) | The web app (Settings → API Keys) |
| **Public API** (`/api/v1/ci/*`) | **API key** (header) | Your scripts, CI runners, services |

---

## 1. Authentication

The public API authenticates with an **API key**, not a session cookie (CI
environments are stateless). Present the key in **either** header:

```
Authorization: Bearer csk_xxxxxxxx.<secret>
```
or
```
X-API-Key: csk_xxxxxxxx.<secret>
```

### Key format & storage

A per-user key looks like:

```
csk_1a2b3c4d.Xy8f...<43-char url-safe secret>
```

- `csk_` — fixed prefix identifying a CodeClone user key.
- `1a2b3c4d` — an 8-hex **public prefix** (used for lookup and rate-limiting; safe to log).
- `.` — separator.
- `<secret>` — a 256-bit URL-safe random secret.

The server stores **only** `SHA-256(prefix:secret)` — never the plaintext. The
full token is therefore shown **exactly once**, at creation time. If you lose
it, revoke the key and create a new one.

### Key kinds accepted by the public API

| Prefix | Kind | Source | Scope |
|---|---|---|---|
| `csk_` | Per-user key | Web app → Settings → API Keys | `ci:check` |
| `epk_` | Enterprise key | Enterprise workspace credentials | Key's stored scopes |
| *(no prefix)* | Static CI token | `CI_API_KEY` env var on the server | `ci:check` |

All three are accepted on `POST /api/v1/ci/check`. The endpoint requires the
`ci:check` scope (per-user and static keys always have it).

---

## 2. Managing API keys

These endpoints are called by the **web app** while you are logged in (session
cookie + CSRF). Create and revoke keys from **Settings → API Keys** in the UI —
the raw examples below document the underlying contract.

### `GET /api/v1/api-keys` — list your keys

Secrets are never returned.

```json
{
  "success": true,
  "items": [
    {
      "id": 12,
      "name": "github-actions",
      "prefix": "csk_1a2b3c4d",
      "createdAt": "2026-07-08T12:00:00+00:00",
      "lastUsedAt": "2026-07-08T13:45:10+00:00",
      "revoked": false
    }
  ]
}
```

### `POST /api/v1/api-keys` — create a key

Request body (optional):

```json
{ "name": "github-actions" }
```

Response `201 Created` — the full `token` is present **only in this response**:

```json
{
  "success": true,
  "token": "csk_1a2b3c4d.Xy8f...secret...",
  "item": { "id": 12, "name": "github-actions", "prefix": "csk_1a2b3c4d", "revoked": false }
}
```

Limits: max **20 active keys** per user (revoke some first, else `400`);
rate-limited to **10 creations/minute**.

### `DELETE /api/v1/api-keys/{id}` — revoke a key

```json
{ "success": true }
```

Revocation is immediate and irreversible; a revoked key stops authenticating on
the next request. Returns `404` if the key does not exist or is not yours.

---

## 3. Public API endpoints

### `GET /api/v1/ci/languages` — supported languages

No authentication required.

```json
{
  "success": true,
  "languages": ["python","c","java","javascript","ruby","go","typescript",
                "php","kotlin","r","rust","scala","elixir","haskell","perl"]
}
```

### `POST /api/v1/ci/check` — run a similarity check

Runs clone-detection on one or more code **pairs** and returns a pass/fail
verdict against a threshold. This is the primary API.

**Authentication:** required (API key header).
**Rate limit:** 60 requests/minute, keyed on your API key (not your IP).

#### Request body

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `pairs` | array | ✅ | — | 1–**50** pairs |
| `threshold` | number | — | `80.0` | 0–100. A pair is a **violation** when its combined similarity ≥ threshold |
| `language` | string | — | `"python"` | Must be one of the supported languages |
| `pairs[].code_a` | string | ✅ | — | Source A. Max **512 KB** (UTF-8) |
| `pairs[].code_b` | string | ✅ | — | Source B. Max **512 KB** (UTF-8) |
| `pairs[].label_a` | string | — | `source_a_<i>` | Human label for A (e.g. a file path) |
| `pairs[].label_b` | string | — | `source_b_<i>` | Human label for B |

```json
{
  "threshold": 80.0,
  "language": "python",
  "pairs": [
    {
      "label_a": "student-A/sort.py",
      "label_b": "student-B/sort.py",
      "code_a": "def sort(arr):\n    return sorted(arr)\n",
      "code_b": "def sort(lst):\n    return sorted(lst)\n"
    }
  ]
}
```

#### Response body

```json
{
  "success": true,
  "verdict": "fail",
  "threshold": 80.0,
  "language": "python",
  "total_pairs": 1,
  "violations": 1,
  "duration_ms": 842,
  "results": [
    {
      "label_a": "student-A/sort.py",
      "label_b": "student-B/sort.py",
      "combined_similarity": 91.4,
      "text_similarity": 78.2,
      "token_similarity": 88.0,
      "graph_similarity": 95.1,
      "ai_similarity": 84.7,
      "is_violation": true,
      "clone_types_detected": ["exact", "structural", "semantic"]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `verdict` | `"fail"` if **any** pair is a violation, else `"pass"` |
| `violations` | Count of pairs at or above the threshold |
| `duration_ms` | Server-side analysis time |
| `results[].combined_similarity` | Weighted overall score, **0–100** |
| `results[].text_similarity` / `token_similarity` / `graph_similarity` / `ai_similarity` | Per-dimension sub-scores, 0–100 |
| `results[].is_violation` | `combined_similarity >= threshold` |
| `results[].clone_types_detected` | Any of: `exact`, `near_miss`, `parameterized`, `function`, `non_contiguous`, `structural`, `reordered`, `function_reordered`, `gapped`, `intertwined`, `semantic` |

If a single pair fails to analyze, that entry contains `{"error": "...",
"code": "pair_analysis_failed", "is_violation": false}` instead of scores; the
rest of the batch still succeeds.

#### HTTP status codes

| Status | Meaning |
|---|---|
| `200 OK` | Check completed, `verdict: "pass"` (no violations) |
| `422 Unprocessable Entity` | Check completed, `verdict: "fail"` (**≥1 violation**) — a policy result, not an error |
| `400 Bad Request` | Malformed request (see error codes) |
| `401 Unauthorized` | Missing/invalid API key |
| `403 Forbidden` | Key lacks the `ci:check` scope |
| `429 Too Many Requests` | Rate limit exceeded |

> **CI tip:** treat **`422`** as "similarity gate failed" — fail the build.
> Treat `200` as "clean". Treat `4xx`/`5xx` other than 422 as a real error.

---

## 4. Errors

Every error response has this shape:

```json
{ "success": false, "error": "Human-readable message.", "code": "machine_code" }
```

| `code` | Status | Cause |
|---|---|---|
| `authentication_required` | 401 | No/invalid API key |
| `insufficient_scope` | 403 | Key cannot call `ci:check` |
| `invalid_request` | 400 | Body is not a JSON object |
| `invalid_threshold` | 400 | `threshold` not a number in 0–100 |
| `unsupported_language` | 400 | `language` not supported |
| `missing_pairs` | 400 | `pairs` missing or empty |
| `too_many_pairs` | 400 | More than 50 pairs |
| `invalid_pair` | 400 | A pair is not an object |
| `empty_code` | 400 | A pair is missing `code_a`/`code_b` |
| `code_too_large` | 400 | A source exceeds 512 KB |

---

## 5. Limits (summary)

| Limit | Value |
|---|---|
| Pairs per request | 50 |
| Source size | 512 KB each |
| `ci/check` rate limit | 60 / minute / key |
| Key creation rate limit | 10 / minute |
| Active keys per user | 20 |
| Default threshold | 80 % |
| Supported languages | 15 (see `GET /api/v1/ci/languages`) |

---

## 5b. Usage-based billing

The public API is **metered**: every code pair analyzed via `POST /api/v1/ci/check`
counts toward your plan's monthly allowance, and usage beyond it is billed as
overage. (Interactive web-UI analyses are billed separately under your plan quota
and are **not** counted here.)

| Plan | Included API pairs / month |
|---|---|
| Free | 200 |
| Pro | 20,000 |
| Team | 200,000 |

Overage is **$2.00 per 1,000 pairs** beyond the included allowance (operator-configurable
via `API_OVERAGE_CENTS_PER_1000_PAIRS`). Only per-user `csk_` keys are metered —
enterprise and static CI tokens are not.

Track current-period usage and the estimated cost in the app under **API Keys →
Usage & Billing**, or programmatically:

### `GET /api/v1/api-keys/usage` (session auth)

```json
{
  "success": true,
  "plan": "pro", "planName": "Pro", "period": "2026-07",
  "calls": 128, "pairs": 24500,
  "includedPairs": 20000, "remainingIncluded": 0,
  "overagePairs": 4500, "ratePer1000Cents": 200,
  "estimatedCostCents": 900, "lastCallAt": "2026-07-08T13:00:00+00:00"
}
```

---

## 6. Examples

### cURL

```bash
curl -sS -X POST "https://YOUR_HOST/api/v1/ci/check" \
  -H "Authorization: Bearer csk_1a2b3c4d.YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "threshold": 85,
        "language": "python",
        "pairs": [
          {"label_a":"a.py","label_b":"b.py",
           "code_a":"def f(x):\n  return x*2\n",
           "code_b":"def g(y):\n  return y*2\n"}
        ]
      }'
```

### GitHub Actions (fail the build on a violation)

```yaml
- name: Plagiarism gate
  run: |
    HTTP=$(curl -sS -o resp.json -w "%{http_code}" \
      -X POST "https://YOUR_HOST/api/v1/ci/check" \
      -H "Authorization: Bearer ${{ secrets.CODECLONE_API_KEY }}" \
      -H "Content-Type: application/json" \
      --data @pairs.json)
    cat resp.json
    if [ "$HTTP" = "422" ]; then echo "::error::Similarity threshold exceeded"; exit 1; fi
    if [ "$HTTP" != "200" ]; then echo "::error::API error ($HTTP)"; exit 1; fi
```

### Python

```python
import requests

resp = requests.post(
    "https://YOUR_HOST/api/v1/ci/check",
    headers={"X-API-Key": "csk_1a2b3c4d.YOUR_SECRET"},
    json={
        "threshold": 80,
        "language": "python",
        "pairs": [{"label_a": "a.py", "label_b": "b.py",
                   "code_a": open("a.py").read(),
                   "code_b": open("b.py").read()}],
    },
    timeout=60,
)
data = resp.json()
print(data["verdict"], data["results"][0]["combined_similarity"])
if resp.status_code == 422:          # verdict == "fail"
    raise SystemExit("Similarity gate failed")
```

### Node.js

```js
const resp = await fetch("https://YOUR_HOST/api/v1/ci/check", {
  method: "POST",
  headers: {
    "Authorization": "Bearer csk_1a2b3c4d.YOUR_SECRET",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    threshold: 80,
    language: "javascript",
    pairs: [{ label_a: "a.js", label_b: "b.js", code_a, code_b }],
  }),
});
const data = await resp.json();
if (resp.status === 422) process.exit(1); // fail
console.log(data.verdict, data.results[0].combined_similarity);
```

---

## 7. Security notes

- Keys are stored **hashed** (`SHA-256(prefix:secret)`); the plaintext is shown
  once and cannot be recovered. Store it in a secret manager / CI secret.
- Secret comparison is **constant-time** (`hmac.compare_digest`) to resist
  timing attacks.
- The rate limiter keys on the **public prefix**, never the secret, so one
  leaked key can't bypass the cap by rotating IPs, and CI runners behind one NAT
  don't throttle each other.
- **Revoke** a key immediately (UI or `DELETE`) if it is exposed; revocation
  takes effect on the next request.
- `last_used_at` is stamped on every successful call — use it to spot dormant or
  suspicious keys.
- Per-pair analysis errors return a **generic** message; internal exception
  detail is logged server-side only, never leaked to key holders.

---

*Generated for the CodeClone public API. Endpoint source of truth:
`backend/api/v1/ci.py`, `backend/api/v1/api_keys.py`, `backend/models/audit.py`.*
