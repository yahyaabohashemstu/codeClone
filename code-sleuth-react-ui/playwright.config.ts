import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Runs against a live app.
 *
 * Prerequisites (one-time): `npx playwright install chromium`.
 *
 * By default it expects the app on http://localhost:5000 (the same-origin
 * Flask-served build, e.g. from `python wsgi.py` at the repo root). Override
 * with E2E_BASE_URL. Set E2E_START=1 to have Playwright build+serve the SPA
 * via `vite preview` on :4173 instead (API calls then need a backend proxy).
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:5000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
