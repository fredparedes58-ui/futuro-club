/**
 * Tests para DemoDataService
 * Sprint 6E — Verificar seed de datos demo, idempotencia, y purge.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DemoDataService } from "@/services/real/demoDataService";
import { PlayerService } from "@/services/real/playerService";

// ── Mock: Supabase ──────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({}) },
  SUPABASE_CONFIGURED: false,
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("DemoDataService", () => {
  beforeEach(() => {
    // Usar localStorage nativo de jsdom
    localStorage.clear();
  });

  describe("isSeeded", () => {
    it("devuelve false si nunca se ejecutó seed", () => {
      expect(DemoDataService.isSeeded()).toBe(false);
    });

    it("devuelve true después de seed", () => {
      DemoDataService.seed();
      expect(DemoDataService.isSeeded()).toBe(true);
    });
  });

  describe("seed", () => {
    it("crea 3 jugadores demo", () => {
      const created = DemoDataService.seed();
      expect(created).toBe(3);
      const all = PlayerService.getAll();
      expect(all.length).toBe(3);
    });

    it("es idempotente — segunda llamada no crea más", () => {
      DemoDataService.seed();
      const second = DemoDataService.seed();
      expect(second).toBe(0);
      expect(PlayerService.getAll().length).toBe(3);
    });

    it("no sobreescribe jugadores existentes", () => {
      PlayerService.create({
        name: "Jugador Real",
        age: 14,
        position: "Portero",
        gender: "M",
        foot: "right",
        height: 170,
        weight: 60,
        competitiveLevel: "Regional",
        minutesPlayed: 0,
        metrics: { speed: 50, technique: 50, vision: 50, stamina: 50, shooting: 50, defending: 50 },
      });
      const created = DemoDataService.seed();
      expect(created).toBe(0); // No crea demos si ya hay jugadores
      expect(PlayerService.getAll().length).toBe(1); // Solo el real
    });

    it("jugadores demo tienen VSI calculado (>0)", () => {
      DemoDataService.seed();
      const players = PlayerService.getAll();
      for (const p of players) {
        expect(p.vsi).toBeGreaterThan(0);
      }
    });

    it("jugadores demo tienen nombres distintos", () => {
      DemoDataService.seed();
      const names = PlayerService.getAll().map((p) => p.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(3);
    });

    it("jugadores demo tienen posiciones variadas", () => {
      DemoDataService.seed();
      const positions = PlayerService.getAll().map((p) => p.position);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(3);
    });

    it("jugadores demo tienen edades entre 8 y 21", () => {
      DemoDataService.seed();
      for (const p of PlayerService.getAll()) {
        expect(p.age).toBeGreaterThanOrEqual(8);
        expect(p.age).toBeLessThanOrEqual(21);
      }
    });
  });

  describe("purge", () => {
    it("elimina solo jugadores demo y preserva los reales", () => {
      // Seed crea 3 jugadores demo con IDs únicos
      DemoDataService.seed();

      // Agregar jugador real
      PlayerService.create({
        name: "Mi Jugador", age: 15, position: "Pivote", gender: "M",
        foot: "right", height: 168, weight: 58, competitiveLevel: "Regional",
        minutesPlayed: 100,
        metrics: { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 },
      });
      expect(PlayerService.getAll().length).toBe(4);

      // Verificar IDs únicos (fix del bug Date.now() colisión)
      const ids = PlayerService.getAll().map(p => p.id);
      expect(new Set(ids).size).toBe(4);

      // Purge elimina solo los demos
      const removed = DemoDataService.purge();
      expect(removed).toBe(3);

      const remaining = PlayerService.getAll();
      expect(remaining.length).toBe(1);
      expect(remaining[0].name).toBe("Mi Jugador");
    });

    it("devuelve 0 si no hay demos", () => {
      expect(DemoDataService.purge()).toBe(0);
    });
  });

  describe("getDemoPlayerNames", () => {
    it("devuelve 3 nombres", () => {
      const names = DemoDataService.getDemoPlayerNames();
      expect(names.length).toBe(3);
      expect(names.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    });
  });

  describe("count", () => {
    it("devuelve 3", () => {
      expect(DemoDataService.count).toBe(3);
    });
  });

  describe("markSeeded", () => {
    it("marca como seeded sin crear datos", () => {
      DemoDataService.markSeeded();
      expect(DemoDataService.isSeeded()).toBe(true);
      expect(PlayerService.getAll().length).toBe(0);
    });
  });
});
