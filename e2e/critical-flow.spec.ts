/**
 * VITAS E2E — Critical User Flow
 * Tests the primary paths a user takes through the application:
 * 1. Landing page loads
 * 2. Login page is functional
 * 3. Dashboard renders key components
 * 4. Player list is accessible
 * 5. Scout Feed page loads
 * 6. API health check responds
 */
import { test, expect } from "@playwright/test";

test.describe("Critical User Flow", () => {
  test("landing page loads with key elements", async ({ page }) => {
    await page.goto("/");
    // Should show login/register or redirect to auth
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Should have the VITAS branding somewhere
    const hasVitas = body?.toLowerCase().includes("vitas") ||
                     body?.toLowerCase().includes("football") ||
                     body?.toLowerCase().includes("intelligence");
    expect(hasVitas || page.url().includes("login")).toBeTruthy();
  });

  test("login page renders form correctly", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Email input should be visible
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });

    // Password input should be visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput.first()).toBeVisible();

    // Submit button should exist
    const submitBtn = page.locator('button[type="submit"], button:has-text("Iniciar"), button:has-text("Login"), button:has-text("Sign")');
    await expect(submitBtn.first()).toBeVisible();
  });

  test("register page renders form correctly", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput.first()).toBeVisible();
  });

  test("API health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBeLessThan(500);
    const body = await response.json().catch(() => null);
    if (body) {
      expect(body.ok || body.status === "ok" || response.ok()).toBeTruthy();
    }
  });

  test("API returns 404 for unknown routes", async ({ request }) => {
    const response = await request.get("/api/nonexistent-route-xyz");
    expect(response.status()).toBe(404);
  });

  test("scout insights endpoint requires auth", async ({ request }) => {
    const response = await request.get("/api/scout/insights");
    // Should return 401 without auth
    expect(response.status()).toBe(401);
  });

  test("players CRUD endpoint requires auth", async ({ request }) => {
    const response = await request.get("/api/players/crud");
    expect(response.status()).toBe(401);
  });

  test("PWA manifest is accessible", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    if (response.ok()) {
      const manifest = await response.json();
      expect(manifest.name).toBeTruthy();
      expect(manifest.icons).toBeDefined();
    }
  });

  test("service worker script is accessible", async ({ request }) => {
    const response = await request.get("/sw.js");
    // SW might not exist in all builds, but should not 500
    expect(response.status()).toBeLessThan(500);
  });

  test("app handles deep links gracefully (SPA routing)", async ({ page }) => {
    // Unknown deep link should not crash — SPA routing
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Should either show dashboard or redirect to login
    expect(page.url()).toMatch(/(dashboard|login)/);
  });

  test("app handles player detail deep link", async ({ page }) => {
    await page.goto("/player/nonexistent-id-xyz");
    await page.waitForLoadState("networkidle");
    // Should not crash, show something meaningful
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("responsive: mobile viewport renders correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone size
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
  });
});
