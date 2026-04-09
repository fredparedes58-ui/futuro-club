import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/pulse");
    // Should redirect to login page
    await page.waitForURL(/\/(login|register|$)/);
    const url = page.url();
    expect(url).toMatch(/login|register/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    // Should show email and password inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"], input[name="email"]', "fake@test.com");
    await page.fill('input[type="password"]', "wrongpassword123");
    await page.click('button[type="submit"]');
    // Should show an error toast or message
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body?.toLowerCase()).toMatch(/(error|invalid|incorrec|no válid)/i);
  });
});
