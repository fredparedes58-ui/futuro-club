import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads and shows hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/VITAS/i);
    // Main CTA or heading should be visible
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("PWA manifest is accessible", async ({ page }) => {
    const res = await page.goto("/manifest.webmanifest");
    expect(res?.status()).toBe(200);
    const manifest = await res?.json();
    expect(manifest.name).toContain("VITAS");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test("service worker registers", async ({ page }) => {
    await page.goto("/");
    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    expect(swRegistered).toBe(true);
  });
});
