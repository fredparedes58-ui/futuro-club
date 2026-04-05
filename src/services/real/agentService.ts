/**
 * VITAS Agent Service — Frontend Client
 * Llama a las Vercel API routes de cada agente.
 * La API key NUNCA está en el frontend — vive en Vercel env vars.
 */

import type {
  PHVInput, PHVOutput,
  ScoutInsightInput, ScoutInsightOutput,
  RoleProfileInput, RoleProfileOutput,
  TacticalLabelInput, TacticalLabelOutput,
  AgentResponse,
} from "@/agents/contracts";
import { supabase } from "@/lib/supabase";

const BASE = "/api/agents";

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

async function callAgent<TInput, TOutput>(
  endpoint: string,
  input: TInput
): Promise<AgentResponse<TOutput>> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    return { success: false, error: err.error, agentName: endpoint };
  }

  return res.json() as Promise<AgentResponse<TOutput>>;
}

export const AgentService = {
  /**
   * Calcula la maduración biológica PHV del jugador
   * Determinista: fórmula Mirwald vía Claude
   */
  async calculatePHV(input: PHVInput): Promise<AgentResponse<PHVOutput>> {
    return callAgent<PHVInput, PHVOutput>("phv-calculator", input);
  },

  /**
   * Genera un insight de scouting para el ScoutFeed
   * Creativo pero estructurado: Claude sigue el contrato estrictamente
   */
  async generateScoutInsight(input: ScoutInsightInput): Promise<AgentResponse<ScoutInsightOutput>> {
    return callAgent<ScoutInsightInput, ScoutInsightOutput>("scout-insight", input);
  },

  /**
   * Construye el perfil de rol táctico completo del jugador
   * Analítico: Claude razona sobre métricas y devuelve estructura tipada
   */
  async buildRoleProfile(input: RoleProfileInput): Promise<AgentResponse<RoleProfileOutput>> {
    return callAgent<RoleProfileInput, RoleProfileOutput>("role-profile", input);
  },

  /**
   * Etiqueta detecciones de Roboflow con contexto PHV y táctico (Fase 2)
   * Determinista: reglas fijas en el prompt
   */
  async labelTactical(input: TacticalLabelInput): Promise<AgentResponse<TacticalLabelOutput>> {
    return callAgent<TacticalLabelInput, TacticalLabelOutput>("tactical-label", input);
  },
};
