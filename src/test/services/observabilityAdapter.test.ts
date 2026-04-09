/**
 * VITAS · Tests — Observability Adapter
 * Verifica: dual-write, feedback, provider registration, error isolation
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock agentTracer para aislar el adapter
vi.mock("@/services/real/agentTracer", () => {
  const traces: any[] = [];
  const alerts: any[] = [];
  let traceCounter = 0;

  return {
    agentTracer: {
      startTrace: vi.fn((_name: string, _input: unknown, _opts?: any) => {
        traceCounter++;
        return `trace_mock_${traceCounter}`;
      }),
      completeTrace: vi.fn(),
      failTrace: vi.fn(),
      getMetrics: vi.fn(() => ({
        byAgent: {},
        global: {
          totalCalls: 0,
          successRate: 100,
          avgLatencyMs: 0,
          totalTokensUsed: 0,
          totalErrors: 0,
          cascadingFailures: 0,
          ragInjectionBlocks: 0,
        },
        alerts: [],
        computedAt: new Date().toISOString(),
      })),
      getRecentTraces: vi.fn(() => traces),
      getAlerts: vi.fn(() => alerts),
      clearAlerts: vi.fn(),
    },
    // Re-export types
    AgentTrace: {},
    AgentMetrics: {},
    TracerAlert: {},
  };
});

import { observability } from "@/services/real/observabilityAdapter";
import type { ObservabilityProvider } from "@/services/real/observabilityAdapter";
import { agentTracer } from "@/services/real/agentTracer";

describe("ObservabilityAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("startTrace", () => {
    it("delega a agentTracer y retorna traceId", () => {
      const id = observability.startTrace("phvAgent", { age: 14 });

      expect(id).toMatch(/^trace_mock_/);
      expect(agentTracer.startTrace).toHaveBeenCalledWith(
        "phvAgent",
        { age: 14 },
        expect.any(Object)
      );
    });

    it("retorna string no vacío", () => {
      const id = observability.startTrace("scoutAgent", "test");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("completeTrace", () => {
    it("delega completeTrace a agentTracer", () => {
      const id = observability.startTrace("phvAgent", "input");
      observability.completeTrace(id, { result: "ok" });

      expect(agentTracer.completeTrace).toHaveBeenCalled();
    });
  });

  describe("failTrace", () => {
    it("delega failTrace a agentTracer", () => {
      const id = observability.startTrace("phvAgent", "input");
      observability.failTrace(id, "timeout", 2);

      expect(agentTracer.failTrace).toHaveBeenCalled();
    });
  });

  describe("recordFeedback", () => {
    it("almacena feedback en localStorage", () => {
      const id = observability.startTrace("scoutAgent", "input");
      observability.recordFeedback(id, 4, "Buen reporte");

      const raw = localStorage.getItem("vitas_feedback");
      expect(raw).not.toBeNull();

      const feedbacks = JSON.parse(raw!);
      expect(feedbacks.length).toBe(1);
      expect(feedbacks[0].score).toBe(4);
      expect(feedbacks[0].comment).toBe("Buen reporte");
    });

    it("acumula múltiples feedbacks", () => {
      observability.recordFeedback("trace1", 5, "Excelente");
      observability.recordFeedback("trace2", 2, "Mejorable");

      const feedbacks = JSON.parse(localStorage.getItem("vitas_feedback")!);
      expect(feedbacks.length).toBe(2);
    });
  });

  describe("getFeedback", () => {
    it("retorna array de feedback almacenado", () => {
      localStorage.setItem("vitas_feedback", JSON.stringify([
        { traceId: "t1", score: 5, comment: "ok", timestamp: "2025-01-01" },
      ]));

      const feedback = observability.getFeedback();
      expect(feedback.length).toBe(1);
      expect(feedback[0].score).toBe(5);
    });

    it("retorna array vacío si no hay feedback", () => {
      const feedback = observability.getFeedback();
      expect(feedback).toEqual([]);
    });
  });

  describe("getMetrics", () => {
    it("retorna métricas del provider local", () => {
      const metrics = observability.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.global).toBeDefined();
      expect(metrics.global.totalCalls).toBe(0);
    });
  });

  describe("getRecentTraces", () => {
    it("retorna array (delegado a agentTracer)", () => {
      const traces = observability.getRecentTraces(10);
      expect(Array.isArray(traces)).toBe(true);
    });
  });

  describe("getAlerts", () => {
    it("retorna array (delegado a agentTracer)", () => {
      const alerts = observability.getAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe("getActiveProviders", () => {
    it("incluye provider local", () => {
      const providers = observability.getActiveProviders();
      expect(providers).toContain("local");
    });
  });

  describe("registerProvider", () => {
    it("agrega provider habilitado", () => {
      const mockProvider: ObservabilityProvider = {
        name: "test-provider",
        enabled: true,
        startTrace: vi.fn(() => "test-id"),
        completeTrace: vi.fn(),
        failTrace: vi.fn(),
      };

      observability.registerProvider(mockProvider);
      const providers = observability.getActiveProviders();
      expect(providers).toContain("test-provider");
    });
  });

  describe("error isolation", () => {
    it("fallo en un provider no afecta a otros", () => {
      const failingProvider: ObservabilityProvider = {
        name: "failing",
        enabled: true,
        startTrace: vi.fn(() => { throw new Error("provider crash"); }),
        completeTrace: vi.fn(),
        failTrace: vi.fn(),
      };

      observability.registerProvider(failingProvider);

      // No debería lanzar excepción
      expect(() => {
        const id = observability.startTrace("agent", "input");
        expect(id).toBeTruthy(); // Local provider sigue funcionando
      }).not.toThrow();
    });
  });
});
