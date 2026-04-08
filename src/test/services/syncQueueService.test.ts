/**
 * VITAS · Tests — SyncQueueService
 * Verifica: enqueue, dequeue, dedup, pruneStale, timestamps
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SyncQueueService } from "@/services/real/syncQueueService";

describe("SyncQueueService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("enqueue & getQueue", () => {
    it("encola un item nuevo", () => {
      SyncQueueService.enqueue("create", "player", "p1", { name: "Test" });
      const queue = SyncQueueService.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].action).toBe("create");
      expect(queue[0].entity).toBe("player");
      expect(queue[0].entityId).toBe("p1");
    });

    it("encola multiples items diferentes", () => {
      SyncQueueService.enqueue("create", "player", "p1", { name: "A" });
      SyncQueueService.enqueue("create", "player", "p2", { name: "B" });
      expect(SyncQueueService.getQueue()).toHaveLength(2);
    });

    it("pendingCount refleja la cola", () => {
      expect(SyncQueueService.pendingCount()).toBe(0);
      SyncQueueService.enqueue("create", "player", "p1", {});
      expect(SyncQueueService.pendingCount()).toBe(1);
    });
  });

  describe("dedup logic", () => {
    it("update sobre mismo entity reemplaza datos", () => {
      SyncQueueService.enqueue("update", "player", "p1", { name: "V1" });
      SyncQueueService.enqueue("update", "player", "p1", { name: "V2" });
      const queue = SyncQueueService.getQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0].data as Record<string, unknown>).name).toBe("V2");
    });

    it("update sobre create mantiene action 'create' y merge data", () => {
      SyncQueueService.enqueue("create", "player", "p1", { name: "A", age: 15 });
      SyncQueueService.enqueue("update", "player", "p1", { name: "B", vsi: 70 });
      const queue = SyncQueueService.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].action).toBe("create");
      const data = queue[0].data as Record<string, unknown>;
      expect(data.name).toBe("B"); // update gana
      expect(data.age).toBe(15);   // create data preservada
      expect(data.vsi).toBe(70);   // update data agregada
    });

    it("delete sobre create elimina de la cola", () => {
      SyncQueueService.enqueue("create", "player", "p1", { name: "A" });
      SyncQueueService.enqueue("delete", "player", "p1", null);
      expect(SyncQueueService.getQueue()).toHaveLength(0);
    });

    it("delete sobre update reemplaza con delete", () => {
      SyncQueueService.enqueue("update", "player", "p1", { name: "A" });
      SyncQueueService.enqueue("delete", "player", "p1", null);
      const queue = SyncQueueService.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].action).toBe("delete");
    });
  });

  describe("dequeue", () => {
    it("remueve un item por ID", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      const id = SyncQueueService.getQueue()[0].id;
      SyncQueueService.dequeue(id);
      expect(SyncQueueService.getQueue()).toHaveLength(0);
    });

    it("no falla con ID inexistente", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      SyncQueueService.dequeue("nonexistent");
      expect(SyncQueueService.getQueue()).toHaveLength(1);
    });
  });

  describe("incrementRetry", () => {
    it("incrementa el conteo de retries", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      const id = SyncQueueService.getQueue()[0].id;
      SyncQueueService.incrementRetry(id);
      SyncQueueService.incrementRetry(id);
      expect(SyncQueueService.getQueue()[0].retries).toBe(2);
    });
  });

  describe("pruneStale", () => {
    it("remueve items con >5 retries", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      const id = SyncQueueService.getQueue()[0].id;
      for (let i = 0; i < 6; i++) SyncQueueService.incrementRetry(id);

      const pruned = SyncQueueService.pruneStale();
      expect(pruned).toBe(1);
      expect(SyncQueueService.getQueue()).toHaveLength(0);
    });

    it("preserva items con <=5 retries", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      const id = SyncQueueService.getQueue()[0].id;
      for (let i = 0; i < 5; i++) SyncQueueService.incrementRetry(id);

      const pruned = SyncQueueService.pruneStale();
      expect(pruned).toBe(0);
      expect(SyncQueueService.getQueue()).toHaveLength(1);
    });
  });

  describe("timestamps", () => {
    it("guarda y recupera timestamp por entidad", () => {
      const now = new Date().toISOString();
      SyncQueueService.setTimestamp("player", now);
      expect(SyncQueueService.getLastSync("player")).toBe(now);
      expect(SyncQueueService.getLastSync("video")).toBeNull();
    });

    it("resetTimestamps limpia todo", () => {
      SyncQueueService.setTimestamp("player", "2024-01-01");
      SyncQueueService.setTimestamp("video", "2024-01-01");
      SyncQueueService.resetTimestamps();
      expect(SyncQueueService.getLastSync("player")).toBeNull();
      expect(SyncQueueService.getLastSync("video")).toBeNull();
    });
  });

  describe("clearQueue", () => {
    it("limpia toda la cola", () => {
      SyncQueueService.enqueue("create", "player", "p1", {});
      SyncQueueService.enqueue("create", "player", "p2", {});
      SyncQueueService.clearQueue();
      expect(SyncQueueService.getQueue()).toHaveLength(0);
    });
  });

  describe("getStatus", () => {
    it("retorna estado completo", () => {
      const status = SyncQueueService.getStatus();
      expect(status).toHaveProperty("pending");
      expect(status).toHaveProperty("online");
      expect(status).toHaveProperty("lastPlayers");
      expect(status).toHaveProperty("lastVideos");
    });
  });
});
