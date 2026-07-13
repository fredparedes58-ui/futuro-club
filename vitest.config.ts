import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: [
        "src/services/real/**",
        "src/services/errorDiagnosticService.ts",
        "src/hooks/**",
      ],
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
      ],
      // Ratchet alineado a la cobertura real (~29% de src/services/real +
      // src/hooks). Bloquea regresiones desde el nivel actual; subir al añadir
      // tests. La CI (ci.yml) usa estos mismos valores. Meta histórica 50/55/40
      // nunca se cumplió (deuda desde Sprint 11).
      thresholds: {
        statements: 28,
        branches: 24,
        functions: 28,
        lines: 29,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
