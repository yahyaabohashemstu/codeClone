import { test, expect } from "@playwright/test";

/**
 * Smoke E2E: unauthenticated public surface + navigation into auth.
 * Run against a live app (see playwright.config.ts). These assertions avoid
 * needing seeded credentials so they pass on a fresh deployment.
 */

test("home page loads and links to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Clone Lens/i);
  // The home page has a call-to-action that reaches the auth flow.
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /login|sign in/i })).toBeVisible();
});

test("login page can switch to sign-up", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /sign up/i }).click();
  await expect(page.getByText(/create your account/i)).toBeVisible();
});

test("public legal + status pages render", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /terms of service/i })).toBeVisible();
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: /system status/i })).toBeVisible();
});
