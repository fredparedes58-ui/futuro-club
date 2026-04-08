/**
 * VITAS Agent Service — Frontend Client (v2: Resilient)
 *
 * Llama a las Vercel API routes de cada agente con:
 * - Circuit breakers (fail fast si el agente está caído)
 * - Token budget monitoring (previene context overflow)
 * - Retry con feedback estructurado (3 intentos máx)
 * - Tracing completo (observabilidad)
 * - Output validation (schema enforcement)
 *
 * La API key NUNCA está en el frontend — vive en Vercel env vars.
 */

import type {
  PHVInput, PHVOutput,
  ScoutInsightInput, ScoutInsightOutput,
  RoleProfileInput, RoleProfileOutput,
  TacticalLabelInput, TacticalLabelOutput,
  AgentResponse,
} from "@/agents/contracts";
import {
  PHVOutputSchema,
  ScoutInsightOutputSchema,
  RoleProfileOutputSchema,
  TacticalLabelOutputSchema,
} from "@/agents/contracts";
import { supabase } from "@/lib/supabase";
import { agentTracer } from "./agentTracer";
import { resilientCall, AGENT_CIRCUITS, tokenBudget } from "./agentResilience";

const BASE = "/api/agents";

// ── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // No session available — request will proceed without auth
  }
  return headers;
}

// ── Core call (con tracing integrado) ────────────────────────────────────────

async function callAgent<TInput, TOutput>(
  endpoint: string,
  input: TInput,
  options: {
    /** Zod schema para validar output */
    validateSchema?: { safeParse: (data: unknown) => { success: boolean } };
    /** Trace ID padre (para pipelines multi-agente) */
    parentTraceId?: string;
    /** Modelo usado (para métricas) */
    model?: string;
    /** Tokens estimados */
    estimatedTokens?: number;
  } = {}
): Promise<AgentResponse<TOutput>> {
  const circuit = AGENT_CIRCUITS[endpoint] ?? {
    agentName: endpoint,
    failureThreshold: 4,
    cooldownMs: 60_000,
    timeoutMs: 30_000,
  };

  // Start trace
  const traceId = agentTracer.startTrace(endpoint, input, {
    parentTraceId: options.parentTraceId,
    model: options.model ?? "claude-haiku-4-5",
    temperature: 0,
    tags: ["agent-call", endpoint],
  });

  const result = await resilientCall<AgentResponse<TOutput>>({
    fn: async (feedback) => {
      const headers = await getAuthHeaders();

      // Si hay feedback de retry previo, adjuntarlo al body
      const body = feedback
        ? { ...input, _retryFeedback: feedback }
        : input;

      const res = await fetch(`${BASE}/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const response = await res.json() as AgentResponse<TOutput>;

      if (!response.success) {
        throw new Error(response.error ?? "Agent returned success=false");
      }

      return response;
    },

    circuit,
    maxRetries: 3,
    estimatedTokens: options.estimatedTokens ?? tokenBudget.estimateTokens(JSON.stringify(input)),

    validateOutput: (response) => {
      if (!response.success || !response.data) return false;

      // Si hay schema Zod, validar
      if (options.validateSchema) {
        const parsed = options.validateSchema.safeParse(response.data);
        return parsed.success;
      }

      return true;
    },

    onRetry: (attempt, error) => {
      console.warn(`[AgentService] ${endpoint} retry ${attempt}: ${error}`);
    },

    onCircuitOpen: (agentName) => {
      console.error(`[AgentService] Circuit OPEN para ${agentName}. Llamadas bloqueadas temporalmente.`);
    },
  });

  // Complete trace
  if (result.success && result.data) {
    agentTracer.completeTrace(traceId, result.data, {
      tokensUsed: result.data.tokensUsed,
    });
    return result.data;
  } else {
    agentTracer.failTrace(traceId, result.error ?? "Unknown error", result.attempts);
    return {
      success: false,
      error: result.error,
      agentName: endpoint,
    };
  }
}

// ── API Pública ──────────────────────────────────────────────────────────────

export const AgentService = {
  /**
   * Calcula la maduración biológica PHV del jugador
   * Determinista: fórmula Mirwald vía Claude (temperature=0, seed fijo)
   */
  async calculatePHV(input: PHVInput, parentTraceId?: string): Promise<AgentResponse<PHVOutput>> {
    return callAgent<PHVInput, PHVOutput>("phv-calculator", input, {
      validateSchema: PHVOutputSchema,
      parentTraceId,
      model: "claude-haiku-4-5",
      estimatedTokens: 800,
    });
  },

  /**
   * Genera un insight de scouting para el ScoutFeed
   * Determinista: Claude sigue el contrato estrictamente (temperature=0)
   */
  async generateScoutInsight(input: ScoutInsightInput, parentTraceId?: string): Promise<AgentResponse<ScoutInsightOutput>> {
    return callAgent<ScoutInsightInput, ScoutInsightOutput>("scout-insight", input, {
      validateSchema: ScoutInsightOutputSchema,
      parentTraceId,
      model: "claude-haiku-4-5",
      estimatedTokens: 1000,
    });
  },

  /**
   * Construye el perfil de rol táctico completo del jugador
   * Determinista: Claude razona sobre métricas (temperature=0)
   */
  async buildRoleProfile(input: RoleProfileInput, parentTraceId?: string): Promise<AgentResponse<RoleProfileOutput>> {
    return callAgent<RoleProfileInput, RoleProfileOutput>("role-profile", input, {
      validateSchema: RoleProfileOutputSchema,
      parentTraceId,
      model: "claude-haiku-4-5",
      estimatedTokens: 2000,
    });
  },

  /**
   * Etiqueta detecciones de YOLO con contexto PHV y táctico
   * Determinista: reglas fijas en el prompt (temperature=0)
   */
  async labelTactical(input: TacticalLabelInput, parentTraceId?: string): Promise<AgentResponse<TacticalLabelOutput>> {
    return callAgent<TacticalLabelInput, TacticalLabelOutput>("tactical-label", input, {
      validateSchema: TacticalLabelOutputSchema,
      parentTraceId,
      model: "claude-haiku-4-5",
      estimatedTokens: 1500,
    });
  },

  /**
   * Obtiene métricas de observabilidad de todos los agentes.
   */
  getMetrics() {
    return agentTracer.getMetrics();
  },

  /**
   * Obtiene traces recientes para debugging.
   */
  getRecentTraces(limit?: number) {
    return agentTracer.getRecentTraces(limit);
  },

  /**
   * Obtiene alertas activas (cascading failures, injection, etc).
   */
  getAlerts() {
    return agentTracer.getAlerts();
  },

  /**
   * Obtiene estado del token budget.
   */
  getTokenBudget() {
    return tokenBudget.getStatus();
  },
};
