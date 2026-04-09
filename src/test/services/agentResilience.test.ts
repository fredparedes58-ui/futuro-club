/**
 * VITAS · Tests — AgentResilience
 * Verifica: CircuitBreaker, TokenBudget, resilientCall
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  circuitBreaker,
  tokenBudget,
  resilientCall,
  AGENT_CIRCUITS,
} from "@/services/real/agentResilience";
import type { CircuitBreakerConfig, ResilientCallOptions } from "@/services/real/agentResilience";

// ── Helpers ──────────────────────────────────────────────────────────────────

const testCircuit: CircuitBreakerConfig = {
  agentName: "test-agent",
  failureThreshold: 3,
  cooldownMs: 1000,
  timeoutMs: 5000,
};

beforeEach(() => {
  localStorage.clear();
  circuitBreaker.resetAll();
});

// ─── CircuitBreaker ─────────────────────────────────────────────────────────

describe("CircuitBreakerManager", () => {
  describe("estado inicial", () => {
    it("agente nuevo tiene estado closed", () => {
      const status = circuitBreaker.getStatus("nuevo-agente");
      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(0);
    });

    it("canCall permite llamadas en closed", () => {
      const check = circuitBreaker.canCall(testCircuit);
      expect(check.allowed).toBe(true);
    });
  });

  describe("transiciones de estado", () => {
    it("closed → open tras N fallos consecutivos", () => {
      for (let i = 0; i < testCircuit.failureThreshold; i++) {
        circuitBreaker.recordFailure(testCircuit);
      }
      const status = circuitBreaker.getStatus("test-agent");
      expect(status.state).toBe("open");
      expect(status.failureCount).toBe(testCircuit.failureThreshold);
    });

    it("open bloquea llamadas", () => {
      for (let i = 0; i < testCircuit.failureThreshold; i++) {
        circuitBreaker.recordFailure(testCircuit);
      }
      const check = circuitBreaker.canCall(testCircuit);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("OPEN");
    });

    it("recordSuccess resetea a closed", () => {
      // Simular fallos
      for (let i = 0; i < testCircuit.failureThreshold; i++) {
        circuitBreaker.recordFailure(testCircuit);
      }
      expect(circuitBreaker.getStatus("test-agent").state).toBe("open");

      // Éxito
      circuitBreaker.recordSuccess("test-agent");
      const status = circuitBreaker.getStatus("test-agent");
      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(0);
    });

    it("half-open permite una llamada de prueba", () => {
      // Abrir circuito
      for (let i = 0; i < testCircuit.failureThreshold; i++) {
        circuitBreaker.recordFailure(testCircuit);
      }

      // Simular que pasó el cooldown: manipular openedAt
      const status = circuitBreaker.getStatus("test-agent");
      status.openedAt = new Date(Date.now() - testCircuit.cooldownMs - 100).toISOString();
      // Force save via internal mechanism - use canCall which checks cooldown
      localStorage.setItem("vitas_circuit_breakers", JSON.stringify({ "test-agent": status }));
      // Re-load
      circuitBreaker.resetAll();
      // Manually set the circuit with expired cooldown
      const stale = { ...status };
      localStorage.setItem("vitas_circuit_breakers", JSON.stringify({ "test-agent": stale }));
      // Reinitialize
      (circuitBreaker as any).circuits = new Map();
      (circuitBreaker as any).loadAll();

      const check = circuitBreaker.canCall(testCircuit);
      expect(check.allowed).toBe(true);
    });

    it("fallo en half-open vuelve a open", () => {
      // Set circuit to half-open state manually
      const halfOpenStatus = {
        state: "half-open" as const,
        failureCount: 3,
        halfOpenAttempts: 0,
        openedAt: new Date().toISOString(),
      };
      localStorage.setItem("vitas_circuit_breakers", JSON.stringify({ "test-agent": halfOpenStatus }));
      (circuitBreaker as any).circuits = new Map();
      (circuitBreaker as any).loadAll();

      const newState = circuitBreaker.recordFailure(testCircuit);
      expect(newState).toBe("open");
    });
  });

  describe("reset", () => {
    it("reset elimina el circuito", () => {
      circuitBreaker.recordFailure(testCircuit);
      circuitBreaker.reset("test-agent");
      const status = circuitBreaker.getStatus("test-agent");
      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(0);
    });

    it("resetAll limpia todos los circuitos", () => {
      circuitBreaker.recordFailure(testCircuit);
      circuitBreaker.recordFailure({ ...testCircuit, agentName: "otro-agente" });
      circuitBreaker.resetAll();
      expect(Object.keys(circuitBreaker.getAllStatuses())).toHaveLength(0);
    });
  });
});

// ─── TokenBudget ────────────────────────────────────────────────────────────

describe("TokenBudgetService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("estimateTokens calcula ~3.5 chars/token", () => {
    const text = "Hola mundo"; // 10 chars
    const tokens = tokenBudget.estimateTokens(text);
    expect(tokens).toBe(Math.ceil(10 / 3.5));
  });

  it("checkBudget permite llamada con presupuesto disponible", () => {
    const check = tokenBudget.checkBudget(1000);
    expect(check.allowed).toBe(true);
    expect(check.status).toBe("ok");
  });

  it("recordUsage incrementa dailyUsed", () => {
    const before = tokenBudget.getStatus().dailyUsed;
    tokenBudget.recordUsage(5000);
    const after = tokenBudget.getStatus().dailyUsed;
    expect(after).toBe(before + 5000);
  });
});

// ─── resilientCall ──────────────────────────────────────────────────────────

describe("resilientCall", () => {
  beforeEach(() => {
    localStorage.clear();
    circuitBreaker.resetAll();
  });

  it("retorna éxito en primer intento", async () => {
    const result = await resilientCall({
      fn: async () => ({ data: "ok" }),
      circuit: testCircuit,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ data: "ok" });
    expect(result.attempts).toBe(1);
    expect(result.circuitState).toBe("closed");
  });

  it("reintenta tras fallo y tiene éxito", async () => {
    let callCount = 0;
    const result = await resilientCall({
      fn: async () => {
        callCount++;
        if (callCount < 2) throw new Error("fallo temporal");
        return { data: "recovered" };
      },
      circuit: testCircuit,
      maxRetries: 3,
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("falla después de maxRetries", async () => {
    const result = await resilientCall({
      fn: async () => { throw new Error("siempre falla"); },
      circuit: testCircuit,
      maxRetries: 2,
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.error).toContain("siempre falla");
  });

  it("falla rápido si circuit breaker está abierto", async () => {
    // Abrir circuito
    for (let i = 0; i < testCircuit.failureThreshold; i++) {
      circuitBreaker.recordFailure(testCircuit);
    }

    const result = await resilientCall({
      fn: async () => ({ data: "nunca llega" }),
      circuit: testCircuit,
    });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.circuitState).toBe("open");
  });

  it("llama onRetry en cada reintento", async () => {
    const retries: number[] = [];
    await resilientCall({
      fn: async () => { throw new Error("fallo"); },
      circuit: testCircuit,
      maxRetries: 3,
      onRetry: (attempt) => retries.push(attempt),
    });
    expect(retries).toEqual([1, 2]);
  });

  it("timeout produce error de timeout", async () => {
    const shortTimeout: CircuitBreakerConfig = {
      ...testCircuit,
      timeoutMs: 50,
    };
    const result = await resilientCall({
      fn: async () => new Promise((resolve) => setTimeout(() => resolve("tarde"), 200)),
      circuit: shortTimeout,
      maxRetries: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Timeout");
  });

  it("validateOutput rechaza output inválido y reintenta", async () => {
    let callCount = 0;
    const result = await resilientCall({
      fn: async () => {
        callCount++;
        if (callCount < 2) return { bad: true };
        return { good: true };
      },
      circuit: testCircuit,
      maxRetries: 3,
      validateOutput: (output: any) => output.good === true,
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});

// ─── AGENT_CIRCUITS config ──────────────────────────────────────────────────

describe("AGENT_CIRCUITS", () => {
  it("tiene configuración para los 8 agentes", () => {
    const expectedAgents = [
      "phv-calculator", "scout-insight", "role-profile", "tactical-label",
      "video-intelligence", "video-observation", "team-intelligence", "team-observation",
    ];
    for (const agent of expectedAgents) {
      expect(AGENT_CIRCUITS[agent]).toBeDefined();
      expect(AGENT_CIRCUITS[agent].failureThreshold).toBeGreaterThan(0);
      expect(AGENT_CIRCUITS[agent].cooldownMs).toBeGreaterThan(0);
      expect(AGENT_CIRCUITS[agent].timeoutMs).toBeGreaterThan(0);
    }
  });

  it("agentes de video tienen timeout mayor", () => {
    expect(AGENT_CIRCUITS["video-intelligence"].timeoutMs)
      .toBeGreaterThan(AGENT_CIRCUITS["phv-calculator"].timeoutMs);
    expect(AGENT_CIRCUITS["video-observation"].timeoutMs)
      .toBeGreaterThan(AGENT_CIRCUITS["scout-insight"].timeoutMs);
  });

  it("agentes de video son menos tolerantes a fallos", () => {
    expect(AGENT_CIRCUITS["video-intelligence"].failureThreshold)
      .toBeLessThan(AGENT_CIRCUITS["phv-calculator"].failureThreshold);
  });
});
