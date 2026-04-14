/**
 * VITAS · Tests — PlayerService
 * Verifica: CRUD, updatePHV, updateMetrics, sort, seedIfEmpty
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PlayerService } from "@/services/real/playerService";
import type { CreatePlayerInput } from "@/services/real/playerService";

// ── Datos de prueba ──────────────────────────────────────────────────────────

const samplePlayer: CreatePlayerInput = {
  name: "Test Player",
  age: 15,
  position: "RW",
  foot: "right",
  height: 172,
  weight: 62,
  competitiveLevel: "Regional",
  minutesPlayed: 840,
  metrics: { speed: 80, technique: 74, vision: 71, stamina: 76, shooting: 78, defending: 45 },
  gender: "M",
};

beforeEach(() => {
  localStorage.clear();
});

// ─── CRUD ───────────────────────────────────────────────────────────────────

describe("PlayerService", () => {
  describe("create", () => {
    it("crea un jugador con ID generado", () => {
      const player = PlayerService.create(samplePlayer);
      expect(player.id).toBeDefined();
      expect(player.id).toMatch(/^p\d+(_\d+)?$/);
      expect(player.name).toBe("Test Player");
    });

    it("calcula VSI al crear", () => {
      const player = PlayerService.create(samplePlayer);
      expect(player.vsi).toBeGreaterThan(0);
      expect(player.vsiHistory).toHaveLength(1);
      expect(player.vsiHistory[0]).toBe(player.vsi);
    });

    it("asigna createdAt y updatedAt", () => {
      const player = PlayerService.create(samplePlayer);
      expect(player.createdAt).toBeTruthy();
      expect(player.updatedAt).toBeTruthy();
    });
  });

  describe("getAll", () => {
    it("retorna array vacío sin jugadores", () => {
      expect(PlayerService.getAll()).toEqual([]);
    });

    it("retorna todos los jugadores creados", () => {
      PlayerService.create(samplePlayer);
      PlayerService.create({ ...samplePlayer, name: "Otro Jugador" });
      expect(PlayerService.getAll()).toHaveLength(2);
    });
  });

  describe("getById", () => {
    it("retorna jugador existente", () => {
      const created = PlayerService.create(samplePlayer);
      const found = PlayerService.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Test Player");
    });

    it("retorna null para ID inexistente", () => {
      expect(PlayerService.getById("no-existe")).toBeNull();
    });
  });

  describe("delete", () => {
    it("elimina jugador existente", () => {
      const player = PlayerService.create(samplePlayer);
      const deleted = PlayerService.delete(player.id);
      expect(deleted).toBe(true);
      expect(PlayerService.getById(player.id)).toBeNull();
    });

    it("retorna false para ID inexistente", () => {
      expect(PlayerService.delete("no-existe")).toBe(false);
    });
  });

  describe("updateMetrics", () => {
    it("actualiza métricas y recalcula VSI", async () => {
      const player = PlayerService.create(samplePlayer);
      const newMetrics = { speed: 90, technique: 85, vision: 80, stamina: 75, shooting: 70, defending: 65 };
      const updated = await PlayerService.updateMetrics(player.id, newMetrics);
      expect(updated).not.toBeNull();
      expect(updated!.metrics.speed).toBe(90);
      expect(updated!.vsi).not.toBe(player.vsi);
    });

    it("agrega nuevo VSI al historial (máx 10)", async () => {
      const player = PlayerService.create(samplePlayer);
      const newMetrics = { speed: 90, technique: 85, vision: 80, stamina: 75, shooting: 70, defending: 65 };
      const updated = await PlayerService.updateMetrics(player.id, newMetrics);
      expect(updated!.vsiHistory).toHaveLength(2);
    });

    it("retorna null para ID inexistente", async () => {
      const result = await PlayerService.updateMetrics("no-existe", samplePlayer.metrics);
      expect(result).toBeNull();
    });
  });

  describe("updatePHV", () => {
    it("persiste category, offset y adjustedVSI", async () => {
      const player = PlayerService.create(samplePlayer);
      const updated = await PlayerService.updatePHV(player.id, "late", -1.5, 72.5);
      expect(updated).not.toBeNull();
      expect(updated!.phvCategory).toBe("late");
      expect(updated!.phvOffset).toBe(-1.5);
      expect(updated!.vsi).toBe(72.5);
    });

    it("retorna null para ID inexistente", async () => {
      const result = await PlayerService.updatePHV("no-existe", "ontme", 0, 70);
      expect(result).toBeNull();
    });
  });

  describe("sort", () => {
    it("ordena por VSI ascendente", () => {
      const p1 = PlayerService.create({ ...samplePlayer, name: "Alfa", metrics: { ...samplePlayer.metrics, speed: 90 } });
      const p2 = PlayerService.create({ ...samplePlayer, name: "Beta", metrics: { ...samplePlayer.metrics, speed: 40 } });
      const all = PlayerService.getAll();
      const sorted = PlayerService.sort(all, "vsi", "asc");
      expect(sorted[0].vsi).toBeLessThanOrEqual(sorted[1].vsi);
    });

    it("ordena por nombre descendente", () => {
      PlayerService.create({ ...samplePlayer, name: "Zebra" });
      PlayerService.create({ ...samplePlayer, name: "Alfa" });
      const all = PlayerService.getAll();
      const sorted = PlayerService.sort(all, "name", "desc");
      expect(sorted[0].name).toBe("Zebra");
    });

    it("ordena por edad", () => {
      PlayerService.create({ ...samplePlayer, name: "Joven", age: 12 });
      PlayerService.create({ ...samplePlayer, name: "Mayor", age: 18 });
      const all = PlayerService.getAll();
      const sorted = PlayerService.sort(all, "age", "asc");
      expect(sorted[0].age).toBe(12);
    });
  });

  describe("getAllVSIs", () => {
    it("retorna array de VSIs", () => {
      PlayerService.create(samplePlayer);
      PlayerService.create({ ...samplePlayer, name: "Otro" });
      const vsis = PlayerService.getAllVSIs();
      expect(vsis).toHaveLength(2);
      vsis.forEach((v) => expect(v).toBeGreaterThan(0));
    });
  });

  describe("seedIfEmpty", () => {
    it("no siembra si ya hay jugadores", () => {
      PlayerService.create(samplePlayer);
      const countBefore = PlayerService.getAll().length;
      PlayerService.seedIfEmpty();
      expect(PlayerService.getAll().length).toBe(countBefore);
    });
  });
});
