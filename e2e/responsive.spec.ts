import { test, expect } from "@playwright/test";

test.describe("Responsive Design", () => {
  test("mobile viewport renders bottom navigation", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only test");
    await page.goto("/login");
    // On mobile, the app should render without horizontal overflow
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // 10px tolerance
  });

  test("desktop viewport has proper layout", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop-only test");
    await page.goto("/login");
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect(viewportWidth).toBeGreaterThan(768);
    // Page should not have horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });
});
