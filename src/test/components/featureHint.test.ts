/**
 * Tests para FeatureHint y WelcomeGuide helpers
 * Sprint 6E — Verificar lógica de hints y guide.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSeenHints, markHintSeen, resetAllHints } from "@/components/FeatureHint";

// ── Mock: localStorage ──────────────────────────────────────────────────────
const mockStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

// ── Mock: Supabase ──────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({}) },
  SUPABASE_CONFIGURED: false,
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("FeatureHint helpers", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe("getSeenHints", () => {
    it("devuelve Set vacío si no hay datos", () => {
      const seen = getSeenHints();
      expect(seen.size).toBe(0);
    });

    it("devuelve hints guardados", () => {
      mockStorage.set("feature_hints_seen", JSON.stringify(["hint-a", "hint-b"]));
      const seen = getSeenHints();
      expect(seen.has("hint-a")).toBe(true);
      expect(seen.has("hint-b")).toBe(true);
      expect(seen.size).toBe(2);
    });

    it("maneja JSON inválido sin error", () => {
      mockStorage.set("feature_hints_seen", "not-json");
      const seen = getSeenHints();
      expect(seen.size).toBe(0);
    });
  });

  describe("markHintSeen", () => {
    it("agrega un hint nuevo", () => {
      markHintSeen("test-hint");
      const seen = getSeenHints();
      expect(seen.has("test-hint")).toBe(true);
    });

    it("es idempotente", () => {
      markHintSeen("test-hint");
      markHintSeen("test-hint");
      const seen = getSeenHints();
      expect(seen.size).toBe(1);
    });

    it("preserva hints anteriores", () => {
      markHintSeen("hint-1");
      markHintSeen("hint-2");
      const seen = getSeenHints();
      expect(seen.has("hint-1")).toBe(true);
      expect(seen.has("hint-2")).toBe(true);
    });
  });

  describe("resetAllHints", () => {
    it("elimina todos los hints vistos", () => {
      markHintSeen("hint-1");
      markHintSeen("hint-2");
      resetAllHints();
      expect(getSeenHints().size).toBe(0);
    });

    it("no falla si no hay hints", () => {
      expect(() => resetAllHints()).not.toThrow();
    });
  });
});
