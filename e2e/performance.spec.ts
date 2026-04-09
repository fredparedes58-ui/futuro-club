import { test, expect } from "@playwright/test";

test.describe("Performance & Health", () => {
  test("landing page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });

  test("no console errors on landing page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForTimeout(2000);
    // Filter out known non-critical errors (e.g., favicon, third-party)
    const critical = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("manifest") && !e.includes("net::"),
    );
    expect(critical).toHaveLength(0);
  });

  test("API health: main endpoint responds", async ({ request }) => {
    const base = process.env.E2E_BASE_URL ?? "https://futuro-club.vercel.app";
    const res = await request.get(`${base}/api/fixtures/live`);
    // Should respond (200 or 4xx) but not 5xx
    expect(res.status()).toBeLessThan(500);
  });

  test("static assets load correctly", async ({ page }) => {
    const failedRequests: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().includes("assets/")) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto("/");
    await page.waitForTimeout(3000);
    expect(failedRequests).toHaveLength(0);
  });
});
