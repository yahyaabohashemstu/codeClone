# Clone Lens — Production Deployment Runbook

This is the exact, ordered path from a fresh server to a live SaaS with a domain,
HTTPS, transactional email, and Stripe billing. The application code is already
wired for all of it — you only supply accounts and credentials.

Everything is driven by environment variables (see `.env.example` for the full
list). Nothing below requires editing source code.

---

## 0. Prerequisites

- A host with Docker + Docker Compose (any VPS, or a PaaS like Coolify).
- A domain you control (e.g. `clonelens.com`).
- ~2 GB RAM (the GraphCodeBERT model loads into memory).

Generate the two secrets you'll need:

```bash
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"
python -c "import secrets; print('ENTERPRISE_DATA_KEY=' + secrets.token_urlsafe(32))"
```

Keep `ENTERPRISE_DATA_KEY` safe and **never change it** once enterprise data
exists — rotating it makes existing encrypted data unrecoverable.

---

## 1. Domain + HTTPS (do this first)

The bundled Caddy stack obtains and renews a Let's Encrypt certificate
automatically. TLS must exist before Stripe (webhooks require https) and before
secure cookies work.

1. **Point DNS** at your host: an `A` record (and `AAAA` if you have IPv6) for
   your domain → the server's public IP. Wait for it to propagate.

2. **Create `docker/.env`:**

   ```ini
   SITE_ADDRESS=clonelens.com
   APP_BASE_URL=https://clonelens.com
   SECRET_KEY=<from step 0>
   ENTERPRISE_DATA_KEY=<from step 0>
   MISTRAL_API_KEY=<optional, for AI narratives>
   ```

3. **Launch:**

   ```bash
   docker compose -f docker/docker-compose.caddy.yml up -d --build
   ```

   Caddy serves ports 80/443 and reverse-proxies to the app. The compose file
   already sets `TRUST_PROXY_HEADERS=1` and `SESSION_COOKIE_SECURE=1`, so the
   https scheme, secure cookies, and per-client rate limiting all work.

4. **Verify:** open `https://clonelens.com` — you should see the app with a
   valid certificate. Check readiness:

   ```bash
   curl https://clonelens.com/api/v1/health/readiness
   ```

   `database: true` confirms it's live. `rateLimitBackend`, `billingConfigured`,
   `emailProvider`, `sentryConfigured` show what's still to configure.

> **Local test without a domain:** set `SITE_ADDRESS=localhost` — Caddy issues a
> local self-signed cert so you can exercise the full HTTPS path on your machine.

### First admin login

On first boot with no users, a random admin password is written inside the
container to `/app/instance/bootstrap_admin_credentials.txt`:

```bash
docker compose -f docker/docker-compose.caddy.yml exec app cat /app/instance/bootstrap_admin_credentials.txt
```

Log in, then create your real account via the signup page.

---

## 2. Transactional email (SMTP)

Needed for email verification and password-reset links. Until configured, the
app uses the `console` provider (links are printed to the server logs — fine for
testing, not for real users).

1. **Pick a provider** and get SMTP credentials. Common choices (all have free
   tiers): SendGrid, Mailgun, Amazon SES, Postmark, Resend.

2. **Add to `docker/.env`:**

   ```ini
   EMAIL_PROVIDER=smtp
   EMAIL_FROM=no-reply@clonelens.com
   SMTP_HOST=smtp.your-provider.com
   SMTP_PORT=587
   SMTP_USERNAME=<provider username / "apikey">
   SMTP_PASSWORD=<provider password / API key>
   SMTP_USE_TLS=1
   # Optional: force new users to confirm their email before first login
   REQUIRE_EMAIL_VERIFICATION=1
   ```

3. **Redeploy** and **send a test email** to yourself:

   ```bash
   docker compose -f docker/docker-compose.caddy.yml up -d
   docker compose -f docker/docker-compose.caddy.yml exec app python manage.py send-test-email you@example.com
   ```

   It prints `sent` on success. If it fails, re-check host/port/credentials —
   the command never raises, it reports the outcome.

> Verify your sending domain (SPF/DKIM) with your provider or mail will land in
> spam. Only enable `REQUIRE_EMAIL_VERIFICATION=1` once email delivery works,
> or new users can't get their verification link.

---

## 3. Billing (Stripe)

Until `STRIPE_SECRET_KEY` is set, the Billing page shows "checkout not enabled",
the upgrade buttons return a friendly 503, and everyone stays on the free plan
(monthly analysis quotas still apply: free=50, pro=1000, team=unlimited).

### 3a. Start in test mode

1. Create a free account at <https://stripe.com>. Stay in **Test mode** while
   setting up.

2. **Create the products/prices** (Dashboard → Products). Create a recurring
   monthly price for **Pro** and **Team**; copy each `price_...` id.

3. **Get your keys** (Dashboard → Developers → API keys): the **Secret key**
   (`sk_test_...`).

4. **Add to `docker/.env`:**

   ```ini
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_PRO=price_...
   STRIPE_PRICE_TEAM=price_...
   ```

5. **Configure the webhook** (Dashboard → Developers → Webhooks → Add endpoint):
   - Endpoint URL: `https://clonelens.com/api/v1/billing/webhook`
   - Events — subscribe to **all seven**; the handler acts on each, and omitting
     the invoice/refund events leaves the admin payments ledger / LTV empty:
     `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`,
     `invoice.payment_failed`, `charge.refunded`
   - **Enable the Customer portal** (Settings → Billing → Customer portal → Save)
     *in this same mode*, or "Manage subscription" fails with
     "No configuration provided". Portal config is per-mode (test vs live).
   - Copy the signing secret (`whsec_...`) into `docker/.env`:

     ```ini
     STRIPE_WEBHOOK_SECRET=whsec_...
     ```

6. **Install the optional dependency** and redeploy. The `stripe` package is in
   `requirements-optional.txt`; the bundled image already installs
   `requirements.txt` only, so add it to your image or install at build time:

   ```bash
   # simplest: append optional deps before building
   cat requirements-optional.txt >> requirements.txt   # or manage separately
   docker compose -f docker/docker-compose.caddy.yml up -d --build
   ```

7. **Test the flow** with a Stripe test card (`4242 4242 4242 4242`, any future
   expiry/CVC): sign in → Billing → Choose **Pro** → complete checkout. You are
   returned to `/billing?status=success`; the webhook upgrades your plan. Use
   **Manage subscription** to open the Stripe portal and cancel (which downgrades
   you back to free).

   Locally you can forward webhooks with the Stripe CLI:

   ```bash
   stripe listen --forward-to https://clonelens.com/api/v1/billing/webhook
   stripe trigger checkout.session.completed
   ```

### 3b. Go live

No code changes — the same env vars with **live** values, in this order:

1. **Activate the account** (Stripe → *Activate your account*: business details,
   identity, payout bank). Live charges are refused until this is complete.
2. Switch the dashboard to **Live mode** and **recreate** the products/prices
   there — test prices/keys do not carry over. Copy the live `price_...` ids.
3. Set live values in `docker/.env`: `STRIPE_SECRET_KEY=sk_live_...`, live
   `STRIPE_PRICE_PRO`/`STRIPE_PRICE_TEAM` (and live `STRIPE_PRICE_API_*` only if
   you sell the metered public API), plus the live `STRIPE_WEBHOOK_SECRET` from
   step 4.
4. Add a **live** webhook endpoint (`https://clonelens.com/api/v1/billing/webhook`)
   with the **same seven events**, and **enable the Customer portal in Live mode**.
   Its `whsec_...` differs from the test one.
5. **Confirm the `stripe` package is in the running image** (step 6 above). With
   the key set but the package missing, readiness reports billing configured while
   every checkout/webhook raises — a readiness lie.
6. Redeploy; check `/api/v1/health/readiness` → `billingConfigured: true`; then run
   **one real** low-price checkout end to end, confirm the plan upgrades and a row
   lands in the admin payments ledger, and **refund it** to confirm the ledger
   folds the refund back.

### 3c. Lemon Squeezy (Merchant of Record — for regions Stripe can't onboard, e.g. Türkiye)

Stripe locks an account to its signup country and needs a local entity + bank;
where that's impossible, sell through **Lemon Squeezy** — a Merchant of Record
that remits global tax/VAT and pays out locally. The app supports both providers;
Lemon Squeezy is auto-selected when `LEMONSQUEEZY_API_KEY` is set (or force it
with `BILLING_PROVIDER=lemonsqueezy`). It needs **no extra package** — the
integration is plain JSON over `requests`, already a core dependency, so the
readiness trap that bites Stripe (package missing from the image) cannot happen.

**Build the whole thing in test mode.** A new store is in test mode by default and
stays there until identity verification completes, so this is the real order of
work, not a rehearsal. Two facts decide everything below:

- A plan maps to a **variant** (the priced row of a product), never to the product
  itself. `LEMONSQUEEZY_VARIANT_PRO` wants a *variant* id.
- **Test mode has its own products.** Going live swaps the variant ids; the API key
  and store id do not change.

1. **Products** (test mode on): create Pro and Team as *subscription* products at
   the prices shown on the public rate card ($19 and $99 monthly), and **publish**
   them — an unpublished product cannot be checked out even in test mode.
2. **Variant ids:** open a product → its variant; the id is the trailing number of
   the URL (`.../products/<product>/variants/<variant>`).
3. **API key:** Settings → API → create a key.
4. **Store id:** Settings → Stores — the numeric id, not the subdomain.
5. **Add to `docker/.env`:**

   ```ini
   BILLING_PROVIDER=lemonsqueezy
   LEMONSQUEEZY_API_KEY=...
   LEMONSQUEEZY_STORE_ID=<numeric store id>
   LEMONSQUEEZY_VARIANT_PRO=<test-mode variant id>
   LEMONSQUEEZY_VARIANT_TEAM=<test-mode variant id>
   ```

6. **Webhook** (Settings → Webhooks → new):
   - URL: `https://clonelens.com/api/v1/billing/webhook`
   - Signing secret: any random 6–40 character string; put the same value in
     `docker/.env` as `LEMONSQUEEZY_WEBHOOK_SECRET`. Every request is verified as
     an HMAC-SHA256 of the raw body against the `X-Signature` header, and a
     mismatch answers 400 — so a wrong secret reads in the logs exactly like an
     attack. Check this first when webhooks "silently do nothing".
   - Events: `subscription_created`, `subscription_updated`,
     `subscription_cancelled`, `subscription_expired`, `subscription_resumed`,
     `subscription_paused`, `subscription_unpaused`, `order_created`,
     `order_refunded`, `subscription_payment_success`,
     `subscription_payment_failed`, `subscription_payment_refunded`.

     `subscription_updated` is a catch-all carrying the whole current object, so
     the plan state would survive on it alone; the rest keep the payment ledger
     and the churn history complete.
7. **Delivering webhooks before deploy:** Lemon Squeezy can only POST to a public
   URL. While working locally, point the webhook at a tunnel
   (`cloudflared tunnel --url http://localhost:5000`, or `ngrok http 5000`) and
   repoint it at the real domain afterwards.
8. **Run a test purchase:** sign in → Billing → Pro → pay with a test card (Visa
   `4242 4242 4242 4242`, any future expiry such as `12/35`, any CVC). Then check,
   in order:
   - you land back on `/billing?status=success` and the plan reads **Pro**;
   - the charge appears in the admin payments ledger;
   - **Manage subscription** opens the Lemon Squeezy customer portal;
   - upgrading to Team changes the subscription **in place** (Lemon Squeezy
     prorates) rather than opening a second checkout;
   - refunding the order in the dashboard folds the ledger row to `refunded`
     while keeping the original charge amount.

   In test mode every receipt email goes to you and your team regardless of the
   address entered at checkout — do not read that as the app's own mail failing.
9. **Cancel is not expiry.** Cancelling in the portal keeps the plan: Lemon Squeezy
   grants a grace period the customer has already paid for, and the account only
   drops to free once the subscription reaches `expired`. This is deliberate —
   confirm it rather than filing it as a bug.
10. **Go live** after identity verification activates the store: turn test mode
    off, recreate and publish the two products in live mode, and swap **only**
    `LEMONSQUEEZY_VARIANT_PRO` / `_TEAM` to the live variant ids. Add a live
    webhook — test-mode webhooks do not fire for live orders — and set its secret.
    Then run one real low-price checkout end to end and refund it.

### Comping / adjusting a plan manually

```bash
docker compose -f docker/docker-compose.caddy.yml exec app python manage.py set-plan <username> team
docker compose -f docker/docker-compose.caddy.yml exec app python manage.py show-plan <username>
```

---

## 4. Optional: error tracking (Sentry)

```ini
SENTRY_DSN=https://...@oXXX.ingest.sentry.io/XXX
```

Add `sentry-sdk[flask]` (in `requirements-optional.txt`) to the image, redeploy.
Readiness will report `sentryConfigured: true`.

---

## 5. Go-live checklist

- [ ] `https://<domain>` loads with a valid certificate.
- [ ] `/api/v1/health/readiness` → `database: true`.
- [ ] Changed the bootstrap admin password / created your own admin.
- [ ] `manage.py send-test-email` arrives in a real inbox (not spam).
- [ ] Signup → verification email → login works end-to-end.
- [ ] Password reset email works end-to-end.
- [ ] Stripe test checkout upgrades the plan; portal cancel downgrades it.
- [ ] `SESSION_COOKIE_SECURE=1` and `TRUST_PROXY_HEADERS=1` are set (the Caddy
      compose file does this automatically).
- [ ] `ENTERPRISE_DATA_KEY` is backed up somewhere safe.
- [ ] The `app-instance` volume (SQLite DB + keys) is included in your backups,
      or you moved to Postgres via `DATABASE_URL`.

---

## 6. Deploying on Coolify (managed DB + GitHub CI/CD)

This is the recommended production path: **GitHub tests, builds, and pushes one
image; Coolify pulls it and deploys behind its built-in Traefik** (automatic TLS,
health-gated rollout). The heavy `torch`/`transformers` build never runs on your
Hetzner box, and the database is a Coolify-managed resource with automatic
backups.

**Pieces:**
- [`Dockerfile`](../Dockerfile) — single container: builds the SPA and serves it
  + `/api` from one Waitress process on `:5000` (same-origin, no CORS).
- [`docker-compose.coolify.yml`](../docker-compose.coolify.yml) — app services
  only (`migrate` one-shot, `app`, `worker`); pulls the GHCR image; injects
  `DATABASE_URL` / `REDIS_URL`.
- [`.github/workflows/production-deploy.yml`](../.github/workflows/production-deploy.yml)
  — test → build → push to GHCR → trigger the Coolify webhook.

**Steps:**

1. **Managed resources.** In Coolify create a **PostgreSQL** and a **Redis**
   resource. Copy their internal connection URLs
   (`postgresql://user:pass@host:5432/db`, `redis://host:6379/0`).

2. **Registry access.** The image is pushed to
   `ghcr.io/<owner>/<repo>` (lowercased). Either make that GHCR package
   **public**, or add GHCR credentials under Coolify → Registries.

3. **Create the application.** New Resource → **Docker Compose** → your Git repo
   and the `release/**` branch → compose file `docker-compose.coolify.yml`.
   Attach your **domain to the `app` service on port 5000** (Coolify wires
   Traefik + Let's Encrypt automatically). Add a **persistent volume** for
   `app-instance` (`/app/instance`).

4. **Environment variables** (Coolify → the app's Environment tab). Required:

   ```ini
   SECRET_KEY=<from step 0>
   ENTERPRISE_DATA_KEY=<from step 0>
   DATABASE_URL=<managed Postgres URL from step 1>
   REDIS_URL=<managed Redis URL from step 1>
   APP_BASE_URL=https://app.yourdomain.com
   EMAIL_PROVIDER=smtp        # or 'disabled'. NEVER 'console' — the app refuses
   EMAIL_FROM=no-reply@yourdomain.com
   SMTP_HOST=...              # + SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD
   # Optional: MISTRAL_API_KEY, STRIPE_SECRET_KEY/…, APP_IMAGE (override registry),
   # IMAGE_TAG (pin a specific sha-… tag instead of latest for a controlled rollback)
   ```

5. **Wire the deploy trigger.** Copy the app's **Deploy Webhook** from Coolify.
   In GitHub → Settings → Environments → **`production`**, add secrets
   `COOLIFY_WEBHOOK_URL` and `COOLIFY_TOKEN`.

6. **Ship it.** Push to `release/**` (or tag `vX.Y.Z`). GitHub runs the suite,
   builds the image, pushes `:latest` + `:sha-…` to GHCR, then pings Coolify.
   Coolify pulls the image, the `migrate` service runs `alembic upgrade head`,
   and `app` + `worker` roll out behind Traefik once healthy.

**Notes for this topology:**
- Traefik is exactly **one** proxy hop, so `TRUST_PROXY_HEADERS=1` (set in the
  compose) is correct — per-client rate limiting and the `https` scheme resolve
  properly. Do **not** raise it.
- **Migrations run on the host**, not in CI (a GitHub runner can't reach the
  Coolify-internal DB). The current migration only *adds* a nullable column, so
  it applies safely while the previous release is still serving.
- **Rollback:** set `IMAGE_TAG` to a previous `sha-…` tag in Coolify and redeploy.
- **Scale out:** add replicas of the `app` service — task/progress state is
  already shared via `REDIS_URL`. Keep it **one Waitress process per container**
  (do not switch to multi-process Gunicorn: each process would reload the ~500 MB
  model and fragment the in-process caches).

---

## Notes & limits

- **Scale:** the default is a single app process (Waitress) with in-process
  task state — correct and optimal for one replica. To run **multiple backend
  replicas** behind a load balancer, set `REDIS_URL` and
  `COORDINATION_BACKEND=redis`: background-task state and progress are then
  shared through Redis so a poll that lands on a different replica still sees
  the right progress/result. (Each analysis still executes on the replica that
  received it; a replica crash mid-analysis means the user retries — a full
  re-queueing worker system is the next step beyond this.) Rate limiting also
  uses `REDIS_URL` when set.
- **Database:** defaults to SQLite in the persisted `app-instance` volume. For
  higher load, set `DATABASE_URL=postgresql://...` (the `psycopg2-binary` driver
  is already in `requirements.txt`). New columns are applied automatically on
  boot; a full migration tool (Alembic) is the recommended next step for complex
  schema changes.
- **Detection scope:** strong on Type-1/2/3 clones; Type-4 / cross-language are
  advisory only (see `evaluation/` and the README).
