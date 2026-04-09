/**
 * VITAS · Tests — MatchEventsService
 * Verifica: create, getByPlayerId, count, delete, estructura de eventos
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MatchEventsService, type CreateMatchEventInput } from "@/services/real/matchEventsService";

// ── Datos de prueba ──────────────────────────────────────────────────────────

const sampleEvent: CreateMatchEventInput = {
  playerId: "p1",
  type: "pass",
  result: "success",
  minute: 23,
  matchDate: "2026-04-01",
  xZone: "middle",
};

const shotEvent: CreateMatchEventInput = {
  playerId: "p1",
  type: "shot",
  result: "success",
  minute: 45,
  matchDate: "2026-04-01",
  xZone: "offensive",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MatchEventsService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("create", () => {
    it("crea evento con estructura correcta", () => {
      const event = MatchEventsService.create(sampleEvent);
      expect(event.id).toBeDefined();
      expect(event.id).toMatch(/^evt_/);
      expect(event.playerId).toBe("p1");
      expect(event.type).toBe("pass");
      expect(event.result).toBe("success");
      expect(event.minute).toBe(23);
      expect(event.createdAt).toBeTruthy();
    });

    it("valida datos con schema Zod", () => {
      expect(() =>
        MatchEventsService.create({
          ...sampleEvent,
          minute: 0, // min es 1, debe fallar
        })
      ).toThrow();
    });

    it("genera IDs únicos para cada evento", () => {
      const e1 = MatchEventsService.create(sampleEvent);
      const e2 = MatchEventsService.create({ ...sampleEvent, minute: 30 });
      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe("getByPlayerId", () => {
    it("retorna eventos filtrados por jugador", () => {
      MatchEventsService.create(sampleEvent);
      MatchEventsService.create({ ...sampleEvent, playerId: "p2" });
      MatchEventsService.create({ ...shotEvent });

      const p1Events = MatchEventsService.getByPlayerId("p1");
      expect(p1Events).toHaveLength(2);
      expect(p1Events.every(e => e.playerId === "p1")).toBe(true);
    });

    it("retorna array vacío para jugador sin eventos", () => {
      expect(MatchEventsService.getByPlayerId("inexistente")).toEqual([]);
    });

    it("ordena por minuto descendente", () => {
      MatchEventsService.create({ ...sampleEvent, minute: 10 });
      MatchEventsService.create({ ...sampleEvent, minute: 80 });
      MatchEventsService.create({ ...sampleEvent, minute: 45 });

      const events = MatchEventsService.getByPlayerId("p1");
      expect(events[0].minute).toBe(80);
      expect(events[1].minute).toBe(45);
      expect(events[2].minute).toBe(10);
    });
  });

  describe("delete", () => {
    it("elimina evento existente", () => {
      const event = MatchEventsService.create(sampleEvent);
      const deleted = MatchEventsService.delete(event.id);
      expect(deleted).toBe(true);
      expect(MatchEventsService.getAll()).toHaveLength(0);
    });

    it("retorna false para ID inexistente", () => {
      expect(MatchEventsService.delete("no-existe")).toBe(false);
    });
  });

  describe("count", () => {
    it("cuenta eventos por jugador", () => {
      MatchEventsService.create(sampleEvent);
      MatchEventsService.create(shotEvent);
      MatchEventsService.create({ ...sampleEvent, playerId: "p2" });

      expect(MatchEventsService.count("p1")).toBe(2);
      expect(MatchEventsService.count("p2")).toBe(1);
      expect(MatchEventsService.count("p99")).toBe(0);
    });
  });

  describe("deleteByPlayerId", () => {
    it("elimina todos los eventos de un jugador", () => {
      MatchEventsService.create(sampleEvent);
      MatchEventsService.create(shotEvent);
      MatchEventsService.create({ ...sampleEvent, playerId: "p2" });

      MatchEventsService.deleteByPlayerId("p1");
      expect(MatchEventsService.getAll()).toHaveLength(1);
      expect(MatchEventsService.getAll()[0].playerId).toBe("p2");
    });
  });

  describe("tipos de evento", () => {
    it("acepta todos los tipos de evento válidos", () => {
      const types = ["pass", "shot", "dribble", "tackle", "press", "cross", "header"] as const;
      for (const type of types) {
        expect(() =>
          MatchEventsService.create({ ...sampleEvent, type, minute: 10 })
        ).not.toThrow();
      }
    });
  });
});
