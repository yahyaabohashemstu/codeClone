# Changelog

All notable changes to the Clone Lens platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed — ML core

- **Semantic encoder upgraded GraphCodeBERT → UniXcoder** (`microsoft/unixcoder-base`,
  Apache‑2.0). The swap is a *surgical port* onto the existing engine: the
  sliding‑window full‑file coverage, masked‑mean pooling, GPU support, and the
  single‑inference thread lock are all preserved (a raw merge of the model branch
  would have regressed those). UniXcoder gives a real clone/non‑clone decision
  boundary (smoke: renamed‑clone ≈ 0.60 vs unrelated ≈ 0.20, versus GraphCodeBERT
  where non‑clones reached 0.77–0.98). The semantic‑clone threshold default moves
  0.985 → 0.80.

> **Honesty caveat (not yet closed):** `evaluation/results/*` still reflects
> GraphCodeBERT and must be re‑run with UniXcoder on a **held‑out split** before
> the 0.80 threshold and any accuracy numbers are treated as validated. Type‑4 /
> cross‑language detection remains advisory until that measurement exists.

### Fixed — deployment integrity

- `billingConfigured` readiness now reports true only when Stripe is configured
  **and** the `stripe` package is importable (was a lie on an image built without
  the optional dependency). Added `stripe_service.billing_operational()`.
- The production images (root `Dockerfile` and `docker/Dockerfile.backend`) now
  **bake `requirements-optional.txt`** (Stripe, Sentry, Prometheus) so setting the
  corresponding env vars actually works at runtime.
- `ci.yml` now builds the **root deployment `Dockerfile`** (the artifact that
  actually ships) and **validates** `docker-compose.coolify.yml` /
  `docker-compose.prod.yml` via `docker compose config`; HF model cache key
  updated to UniXcoder with a `restore-keys` fallback.

---

## [1.0.0-hardened] — 2026-07-06

Release-hardening pass driven by an adversarial, multi-dimension audit (security,
multi-tenancy, database/query performance, engine concurrency & memory,
rate-limiting, billing correctness, infrastructure, frontend, and observability).
Every finding below was **independently verified with a concrete reproduction**
before it was fixed. **17 findings confirmed, 0 false positives.**

**Validation:** 366 backend/enterprise tests pass (359 prior + 7 new regression
tests); frontend `build` + `tsc --noEmit` + `eslint` + 24 Vitest tests pass.

> **Operator action required:** finding SEC-005 adds the `user.last_totp_step`
> column. Fresh databases and SQLite pick it up automatically; **existing
> PostgreSQL deployments must run `alembic upgrade head`** (migration
> `c4f2a9b1d7e3`). Three new optional tuning variables are documented in
> `.env.example`.

### Security

- **SEC-001 (High) — Account tokens no longer leak to application logs.** The
  default `console` email provider wrote the full message body — including
  single-use password-reset and email-verification bearer links — to the logger
  at INFO. Bodies are now suppressed unless running under `app.debug`, and
  `ProductionConfig` **refuses to boot** when `EMAIL_PROVIDER=console`, forcing a
  real transport (`smtp`) or an explicit `disabled` in production.
- **SEC-002 (Medium) — Recovery-code consumption is now atomic.** A
  read-modify-write race let two concurrent requests redeem the *same* one-time
  recovery code. Consumption now uses a compare-and-swap
  (`UPDATE … WHERE recovery_codes_json = <old>`), so at most one racing request
  succeeds.
- **SEC-005 (Low) — TOTP replay closed.** A captured `{challenge-token, code}`
  pair could be replayed within the code's ~90 s window to mint additional
  sessions. Login now records the accepted TOTP time-step
  (`user.last_totp_step`) and rejects any step already used.
- **SEC-006 (Low) — Username-enumeration timing oracle reduced.** The
  valid-username login-failure path performed two DB commits the
  non-existent-username path did not. Collapsed to a single commit
  (`record_audit(commit=False)`) while preserving brute-force-lockout integrity.

### Infrastructure

- **INF-001 (Medium) — Content-Security-Policy now served on the SPA document in
  the Nginx production stack.** In the `docker-compose.prod.yml` topology Nginx
  serves `index.html` itself, so Flask's `after_request` CSP (which only runs on
  proxied `/api/*` responses) never reached the HTML document. `docker/nginx.conf`
  now emits the identical CSP, restoring `script-src 'self'` XSS containment
  advertised in the README.

### Performance

- **PERF-001 (Medium) — `GET /api/v1/history` no longer loads blob columns.**
  The list view projected every `code1/code2/metrics/analysis_text/snapshot_json`
  Text blob just to render a one-line source label; it now selects only the
  summary columns plus a 400-char source head.
- **PERF-002 (Medium) — Enterprise threshold recalibration N+1 removed.**
  `recalibrate_thresholds` issued one `CodeArtifact` query per feedback row on the
  synchronous feedback endpoint; artifact language families are now batch-loaded
  in a single `IN` query.
- **PERF-003 (Medium) — Workspace analytics bounded.**
  `build_workspace_analytics` loaded *all* artifacts and matches on every request;
  it now uses SQL aggregates for exact counts/spread/clone-type distributions and
  caps the cluster graph & repository heatmap to the top 2 000 matches.
- **PERF-004 (Medium) — Enterprise vector-index cache is LRU-bounded.** The
  process-global per-workspace embedding-matrix cache never evicted, leaking RAM
  across tenants. It is now an LRU capped by
  `ENTERPRISE_MAX_CACHED_WORKSPACE_INDEXES` (default 16).
- **PERF-005 (Low) — `GET /api/v1/analytics` snapshot scan capped.** The
  clone-type distribution parsed `snapshot_json` for a user's entire history; it
  now scans only the most recent 1 000 analyses. Lightweight distributions remain
  exact.
- **PERF-006 (Low) — Admin user list no longer full-scans subscriptions.**
  `admin_users` replaced `Subscription.query.all()` with a lookup scoped to the
  current page.
- **PERF-007 (Low) — Analysis-context cache bounded by bytes.** The per-user LRU
  cache counted entries only, so large ZIP-derived sources could blow far past the
  intended memory ceiling. Added a total-byte budget (`MAX_CACHE_BYTES`, default
  512 MB).
- **PERF-008 (Low) — Diff viewer no longer rebuilds row arrays on every scroll
  frame.** `DiffViewer.tsx` wraps the flat per-side row construction in `useMemo`,
  so scrolling only recomputes viewport indices.

### Reliability & Abuse-resistance

- **REL-001 (Low) — First-request subscription race fixed.** Two concurrent
  first-time requests could both insert a `Subscription` and one crashed with an
  uncaught `IntegrityError` (HTTP 500). `get_or_create_subscription` now catches
  it, rolls back, and reuses the winner's row.
- **ABUSE-001 (Medium) — Enterprise scan triggers are capped.** The unthrottled
  manual/GraphQL scan-trigger endpoints could enqueue unbounded git clones. A
  per-repository in-flight cap (`ENTERPRISE_MAX_ACTIVE_SCANS_PER_REPO`, default 5)
  now returns HTTP 429 beyond the limit.
- **ABUSE-002 (Low) — `POST /api/v1/ci/check` rate-limit keyed by credential.**
  The compute-heavy CI endpoint was throttled by client IP despite authenticating
  by API key; the limit is now keyed on a non-secret fingerprint of the presented
  credential, defeating IP rotation and stopping shared-NAT runners from
  throttling each other.
- **ABUSE-003 (Low) — `GET /api/v1/analysis/diff` protected.** Added an explicit
  rate limit and a 20 000-line cap on the quadratic `difflib` comparison to remove
  a CPU-exhaustion vector on large stored sources.

### Tooling & housekeeping

- Added regression tests (`tests/backend/test_audit_remediation.py`) pinning the
  TOTP-replay, production email guard, console-body suppression, and CI rate-key
  behaviours.
- Documented `MAX_CACHE_BYTES`, `ENTERPRISE_MAX_CACHED_WORKSPACE_INDEXES`, and
  `ENTERPRISE_MAX_ACTIVE_SCANS_PER_REPO` in `.env.example`.
- Ignore local tooling binaries (`*.exe`) and TypeScript build cache
  (`*.tsbuildinfo`); removed obsolete UI/UX design-note text files.
- Added a production deployment workflow (`.github/workflows/production-deploy.yml`).

---

[1.0.0-hardened]: https://github.com/yahyaabohashemstu/codeClone/releases/tag/v1.0.0-hardened
