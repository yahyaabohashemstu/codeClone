# Testing

## Backend (pytest)

```bash
pip install -r requirements-dev.txt
pytest tests/ -q
# with coverage (CI gate is --cov-fail-under=45):
pytest tests/ --cov=backend --cov=enterprise_platform --cov-report=term-missing
```

The suite covers auth (incl. 2FA, lockout, logout-all), billing/quotas, Stripe
(offline via injected fake), SMTP path, coordination (memory + Redis via
fakeredis), migrations (drift check), admin/API-keys, GDPR export/delete,
detection accuracy (regression gate), and the enterprise encryption/scan-claim
paths.

## Frontend unit tests (Vitest + Testing Library)

```bash
cd code-sleuth-react-ui
npm run test          # run once (CI)
npm run test:watch    # watch mode
```

Config: `vitest.config.ts` (jsdom, `src/test/setup.ts`). Tests live next to the
code as `*.test.ts(x)` under `src/`.

## End-to-end (Playwright)

E2E needs a running app and a one-time browser install:

```bash
cd code-sleuth-react-ui
npx playwright install chromium      # one-time
# point at a running app (default http://localhost:5000):
E2E_BASE_URL=http://localhost:5000 npm run e2e
```

`e2e/smoke.spec.ts` exercises the public surface (home → login → sign-up toggle,
and the Terms/Privacy/Status pages) without needing seeded credentials. E2E is
not run in the default CI pipeline (it requires a live server + browser
download); wire it into a dedicated job or a pre-release check.
```
