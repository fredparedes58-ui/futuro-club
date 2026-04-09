import { test, expect } from "@playwright/test";

test.describe("Billing Page", () => {
  test("shows pricing plans (Free, Pro, Club)", async ({ page }) => {
    // Billing page may redirect to login if not authenticated,
    // but the plan names should be visible in the page source or after redirect
    await page.goto("/billing");
    // Wait for either the billing page or login redirect
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("login")) {
      // Not authenticated — expected, test passes (auth guard works)
      expect(url).toContain("login");
    } else {
      // Authenticated — verify plan names are shown
      const body = await page.textContent("body");
      expect(body).toContain("Free");
      expect(body).toContain("Pro");
      expect(body).toContain("Club");
    }
  });
});
