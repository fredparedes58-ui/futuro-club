import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["api/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["api/**/*.ts"],
      exclude: ["api/**/__tests__/**", "api/**/*.test.ts"],
      thresholds: {
        statements: 40,
      },
    },
  },
});
