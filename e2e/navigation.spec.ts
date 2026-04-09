import { test, expect } from "@playwright/test";

test.describe("Navigation & Routing", () => {
  test("404 page shows on unknown route", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toMatch(/(404|no encontrad|not found)/i);
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.locator('a[href*="register"]');
    await expect(registerLink).toBeVisible();
  });

  test("register page has link to login", async ({ page }) => {
    await page.goto("/register");
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink).toBeVisible();
  });

  test("forgot password page is accessible", async ({ page }) => {
    await page.goto("/forgot-password");
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible();
  });
});
