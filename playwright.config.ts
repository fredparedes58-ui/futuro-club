import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  /* Start local dev server for E2E tests */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        port: 5200,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
