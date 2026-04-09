/**
 * VITAS · Tests — AgentService
 * Verifica: estructura del servicio y mocks de dependencias
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
  SUPABASE_CONFIGURED: false,
}));

// Mock agentResilience — resilientCall wraps fn() and returns structured result
vi.mock("@/services/real/agentResilience", () => ({
  resilientCall: vi.fn(async (options: any) => {
    try {
      const result = await options.fn();
      return {
        success: true,
        data: result,
        attempts: 1,
        circuitState: "closed",
        tokenBudgetStatus: "ok",
        durationMs: 100,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        attempts: 1,
        circuitState: "closed",
        tokenBudgetStatus: "ok",
        durationMs: 100,
      };
    }
  }),
  AGENT_CIRCUITS: {
    "phv-calculator": { agentName: "phv-calculator", failureThreshold: 5, cooldownMs: 30000, timeoutMs: 10000 },
    "scout-insight": { agentName: "scout-insight", failureThreshold: 5, cooldownMs: 30000, timeoutMs: 10000 },
    "role-profile": { agentName: "role-profile", failureThreshold: 4, cooldownMs: 60000, timeoutMs: 15000 },
    "tactical-label": { agentName: "tactical-label", failureThreshold: 5, cooldownMs: 30000, timeoutMs: 10000 },
  },
  tokenBudget: {
    checkBudget: vi.fn().mockReturnValue({ allowed: true, status: "ok" }),
    recordUsage: vi.fn(),
    estimateTokens: vi.fn().mockReturnValue(500),
  },
  circuitBreaker: {
    canCall: vi.fn().mockReturnValue({ allowed: true }),
    getStatus: vi.fn().mockReturnValue({ state: "closed" }),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  },
}));

// Mock agentTracer with all methods used by callAgent
vi.mock("@/services/real/agentTracer", () => ({
  agentTracer: {
    startTrace: vi.fn().mockReturnValue("trace-123"),
    completeTrace: vi.fn(),
    failTrace: vi.fn(),
    endTrace: vi.fn(),
    recordError: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { AgentService } from "@/services/real/agentService";
import type { PHVInput } from "@/agents/contracts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentService", () => {
  describe("calculatePHV", () => {
    it("envía request y retorna resultado exitoso", async () => {
      const mockResponse = {
        success: true,
        data: {
          category: "late" as const,
          offset: -1.2,
          adjustedVSI: 72.5,
          interpretation: "Madurador tardío",
          recommendations: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const input: PHVInput = {
        playerId: "p1",
        height: 165,
        weight: 55,
        sittingHeight: 82,
        age: 14,
        gender: "M",
        currentVSI: 68,
        metrics: { speed: 70, technique: 65, vision: 60, stamina: 70, shooting: 55, defending: 50 },
      };

      const result = await AgentService.calculatePHV(input);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("retorna error cuando la API falla", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal Server Error" }),
      });

      const input: PHVInput = {
        playerId: "p1",
        height: 165,
        weight: 55,
        sittingHeight: 82,
        age: 14,
        gender: "M",
        currentVSI: 68,
        metrics: { speed: 70, technique: 65, vision: 60, stamina: 70, shooting: 55, defending: 50 },
      };

      const result = await AgentService.calculatePHV(input);
      // callAgent catches the error from resilientCall and returns success: false
      expect(result.success).toBe(false);
    });
  });

  describe("estructura de endpoints", () => {
    it("AgentService tiene los métodos principales", () => {
      expect(typeof AgentService.calculatePHV).toBe("function");
      expect(typeof AgentService.buildRoleProfile).toBe("function");
      expect(typeof AgentService.generateScoutInsight).toBe("function");
      expect(typeof AgentService.labelTactical).toBe("function");
    });
  });
});
