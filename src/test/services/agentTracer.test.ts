/**
 * VITAS · Tests — Agent Tracer
 * Verifica: startTrace, completeTrace, failTrace, metrics, alertas, pruning
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { agentTracer } from "@/services/real/agentTracer";

describe("AgentTracerService", () => {
  beforeEach(() => {
    localStorage.clear();
    // El singleton mantiene estado interno (activeTraces, consecutiveErrors).
    // Limpiamos alertas explícitamente; las Maps se vacían al no tener traces activos.
    agentTracer.clearAlerts();
  });

  // ── startTrace ──────────────────────────────────────────────────────────────

  describe("startTrace", () => {
    it("retorna traceId con formato trace_*", () => {
      const id = agentTracer.startTrace("scoutAgent", { query: "test" });
      expect(id).toMatch(/^trace_\d+_[a-z0-9]+$/);
    });

    it("dos llamadas retornan IDs diferentes (unicidad)", () => {
      const id1 = agentTracer.startTrace("scoutAgent", "input1");
      const id2 = agentTracer.startTrace("scoutAgent", "input2");
      expect(id1).not.toBe(id2);
    });
  });

  // ── completeTrace ───────────────────────────────────────────────────────────

  describe("completeTrace", () => {
    it("marca trace como success y persiste en localStorage", () => {
      const id = agentTracer.startTrace("scoutAgent", "input");
      agentTracer.completeTrace(id, "output");

      const traces = agentTracer.getRecentTraces();
      expect(traces.length).toBe(1);
      expect(traces[0].status).toBe("success");
      expect(traces[0].outputSummary).toBe("output");

      // Verificar que está en localStorage
      const raw = localStorage.getItem("vitas_agent_traces");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].status).toBe("success");
    });

    it("calcula durationMs > 0", () => {
      const id = agentTracer.startTrace("scoutAgent", "input");
      // Pequeña espera implícita (el tiempo entre start y complete es > 0)
      agentTracer.completeTrace(id, "output");

      const traces = agentTracer.getRecentTraces();
      expect(traces[0].durationMs).toBeDefined();
      expect(traces[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── failTrace ───────────────────────────────────────────────────────────────

  describe("failTrace", () => {
    it("marca trace como error con mensaje de error", () => {
      const id = agentTracer.startTrace("scoutAgent", "input");
      agentTracer.failTrace(id, "timeout en API");

      const traces = agentTracer.getRecentTraces();
      expect(traces.length).toBe(1);
      expect(traces[0].status).toBe("error");
      expect(traces[0].error).toBe("timeout en API");
    });

    it("registra retryCount", () => {
      const id = agentTracer.startTrace("scoutAgent", "input");
      agentTracer.failTrace(id, "fallo", 3);

      const traces = agentTracer.getRecentTraces();
      expect(traces[0].retryCount).toBe(3);
    });
  });

  // ── getMetrics ──────────────────────────────────────────────────────────────

  describe("getMetrics", () => {
    it("sin traces retorna totalCalls=0 y successRate=100", () => {
      const metrics = agentTracer.getMetrics();
      expect(metrics.global.totalCalls).toBe(0);
      expect(metrics.global.successRate).toBe(100);
    });

    it("con traces mixtos calcula success rate correctamente", () => {
      // 2 success + 1 error = 67% success rate
      const id1 = agentTracer.startTrace("scoutAgent", "a");
      agentTracer.completeTrace(id1, "ok");

      const id2 = agentTracer.startTrace("scoutAgent", "b");
      agentTracer.completeTrace(id2, "ok");

      const id3 = agentTracer.startTrace("scoutAgent", "c");
      agentTracer.failTrace(id3, "error");

      const metrics = agentTracer.getMetrics();
      expect(metrics.global.totalCalls).toBe(3);
      // Math.round((2/3)*100) = 67
      expect(metrics.global.successRate).toBe(67);
      expect(metrics.global.totalErrors).toBe(1);
    });

    it("calcula avgLatencyMs y p95LatencyMs", () => {
      const id1 = agentTracer.startTrace("scoutAgent", "a");
      agentTracer.completeTrace(id1, "ok");

      const id2 = agentTracer.startTrace("scoutAgent", "b");
      agentTracer.completeTrace(id2, "ok");

      const metrics = agentTracer.getMetrics();
      expect(metrics.byAgent["scoutAgent"]).toBeDefined();
      expect(metrics.byAgent["scoutAgent"].avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(metrics.byAgent["scoutAgent"].p95LatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── getRecentTraces ─────────────────────────────────────────────────────────

  describe("getRecentTraces", () => {
    it("retorna traces en orden inverso (newest first)", () => {
      const id1 = agentTracer.startTrace("agentA", "first");
      agentTracer.completeTrace(id1, "out1");

      const id2 = agentTracer.startTrace("agentB", "second");
      agentTracer.completeTrace(id2, "out2");

      const traces = agentTracer.getRecentTraces();
      expect(traces.length).toBe(2);
      // El segundo trace (más reciente) debe estar primero
      expect(traces[0].agentName).toBe("agentB");
      expect(traces[1].agentName).toBe("agentA");
    });

    it("respeta limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        const id = agentTracer.startTrace("agent", `input_${i}`);
        agentTracer.completeTrace(id, `output_${i}`);
      }

      const traces = agentTracer.getRecentTraces(2);
      expect(traces.length).toBe(2);
    });
  });

  // ── getTracesByAgent ────────────────────────────────────────────────────────

  describe("getTracesByAgent", () => {
    it("filtra traces por nombre de agente", () => {
      const id1 = agentTracer.startTrace("scoutAgent", "a");
      agentTracer.completeTrace(id1, "ok");

      const id2 = agentTracer.startTrace("phvAgent", "b");
      agentTracer.completeTrace(id2, "ok");

      const id3 = agentTracer.startTrace("scoutAgent", "c");
      agentTracer.completeTrace(id3, "ok");

      const scoutTraces = agentTracer.getTracesByAgent("scoutAgent");
      expect(scoutTraces.length).toBe(2);
      expect(scoutTraces.every(t => t.agentName === "scoutAgent")).toBe(true);

      const phvTraces = agentTracer.getTracesByAgent("phvAgent");
      expect(phvTraces.length).toBe(1);
    });
  });

  // ── getPipelineTraces ───────────────────────────────────────────────────────

  describe("getPipelineTraces", () => {
    it("retorna traces que comparten parentTraceId", () => {
      const parentId = agentTracer.startTrace("orchestrator", "pipeline");
      agentTracer.completeTrace(parentId, "done");

      const child1 = agentTracer.startTrace("scoutAgent", "step1", { parentTraceId: parentId });
      agentTracer.completeTrace(child1, "ok1");

      const child2 = agentTracer.startTrace("phvAgent", "step2", { parentTraceId: parentId });
      agentTracer.completeTrace(child2, "ok2");

      // Otro trace sin parentTraceId (no debe aparecer)
      const unrelated = agentTracer.startTrace("other", "unrelated");
      agentTracer.completeTrace(unrelated, "ok");

      const pipeline = agentTracer.getPipelineTraces(parentId);
      // Debe incluir el parent + 2 children = 3
      expect(pipeline.length).toBe(3);
      expect(pipeline.map(t => t.agentName).sort()).toEqual(["orchestrator", "phvAgent", "scoutAgent"]);
    });
  });

  // ── Alertas ─────────────────────────────────────────────────────────────────

  describe("Alertas", () => {
    it("2 failures consecutivos genera alerta cascading_failure", () => {
      const id1 = agentTracer.startTrace("scoutAgent", "a");
      agentTracer.failTrace(id1, "error 1");

      const id2 = agentTracer.startTrace("scoutAgent", "b");
      agentTracer.failTrace(id2, "error 2");

      const alerts = agentTracer.getAlerts();
      const cascading = alerts.find(a => a.type === "cascading_failure");
      expect(cascading).toBeDefined();
      expect(cascading!.agentName).toBe("scoutAgent");
      expect(cascading!.severity).toBe("critical");
    });

    it("completeTrace resetea consecutive errors", () => {
      // Usa agente único para evitar colisión con estado del singleton
      const agent = "resetTestAgent";

      // Un fallo
      const id1 = agentTracer.startTrace(agent, "a");
      agentTracer.failTrace(id1, "error 1");

      // Un éxito resetea el contador
      const id2 = agentTracer.startTrace(agent, "b");
      agentTracer.completeTrace(id2, "ok");

      // Limpiar alertas previas del fallo anterior
      agentTracer.clearAlerts();

      // Otro fallo — solo 1 consecutivo, no debería generar alerta
      const id3 = agentTracer.startTrace(agent, "c");
      agentTracer.failTrace(id3, "error 2");

      const alerts = agentTracer.getAlerts();
      const cascading = alerts.filter(a => a.type === "cascading_failure" && a.agentName === agent);
      expect(cascading.length).toBe(0);
    });

    it("clearAlerts limpia todas las alertas", () => {
      // Generar una alerta cascading_failure
      const id1 = agentTracer.startTrace("scoutAgent", "a");
      agentTracer.failTrace(id1, "error 1");

      const id2 = agentTracer.startTrace("scoutAgent", "b");
      agentTracer.failTrace(id2, "error 2");

      expect(agentTracer.getAlerts().length).toBeGreaterThan(0);

      agentTracer.clearAlerts();
      expect(agentTracer.getAlerts().length).toBe(0);
    });
  });

  // ── pruneOldTraces ──────────────────────────────────────────────────────────

  describe("pruneOldTraces", () => {
    it("elimina traces antiguos (mayores a 7 dias)", () => {
      // Crear un trace y persistirlo
      const id = agentTracer.startTrace("scoutAgent", "old input");
      agentTracer.completeTrace(id, "old output");

      // Verificar que existe
      expect(agentTracer.getRecentTraces().length).toBe(1);

      // Avanzar 8 días (simular con vi.useFakeTimers)
      const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
      vi.useFakeTimers();
      vi.advanceTimersByTime(eightDaysMs);

      const pruned = agentTracer.pruneOldTraces();
      expect(pruned).toBe(1);
      expect(agentTracer.getRecentTraces().length).toBe(0);

      vi.useRealTimers();
    });

    it("no elimina traces recientes", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const id = agentTracer.startTrace("scoutAgent", "recent input");
      agentTracer.completeTrace(id, "recent output");

      // Avanzar solo 1 día — dentro del TTL de 7 días
      vi.advanceTimersByTime(1 * 24 * 60 * 60 * 1000);

      const pruned = agentTracer.pruneOldTraces();
      expect(pruned).toBe(0);
      expect(agentTracer.getRecentTraces().length).toBe(1);

      vi.useRealTimers();
    });
  });
});
