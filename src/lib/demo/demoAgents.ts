/**
 * VITAS · Respuestas de agente de EJEMPLO para el DEMO (piso piloto)
 *
 * En el demo no hay claves de IA (Anthropic/Gemini) ni sesión → las llamadas a
 * los agentes (`/api/agents/*`) no deben salir a la red (fallarían con 401 y
 * costarían). Este módulo devuelve respuestas DETERMINISTAS de ejemplo, sin
 * red y sin coste, derivadas de los datos que ya trae la petición. `agentService`
 * las usa cuando `IS_DEMO`. La UI las muestra bajo el banner «Datos de ejemplo».
 *
 * Sólo se rellenan las superficies visibles del demo (scout-insight, role-profile).
 * Para el resto se devuelve un fallo elegante → el consumidor muestra su estado
 * honesto de «no disponible» (sin error ni llamada real).
 */

import type { AgentResponse } from "@/agents/contracts";

const METRIC_ES: Record<string, string> = {
  speed: "velocidad", technique: "técnica", vision: "visión de juego",
  stamina: "resistencia", shooting: "definición", defending: "trabajo defensivo",
};

function topMetric(metrics: Record<string, number> | undefined): { key: string; label: string; value: number } {
  const m = metrics ?? {};
  const entries = Object.keys(METRIC_ES).map((k) => ({ key: k, label: METRIC_ES[k], value: m[k] ?? 0 }));
  return entries.sort((a, b) => b.value - a.value)[0] ?? { key: "technique", label: "técnica", value: 60 };
}

function scoutInsight(input: unknown): Record<string, unknown> {
  const p = (input as { player?: Record<string, unknown> })?.player ?? {};
  const name = (p.name as string) ?? "Jugador";
  const metrics = p.recentMetrics as Record<string, number> | undefined;
  const top = topMetric(metrics);
  return {
    playerId: (p.id as string) ?? "demo",
    type: "general",
    headline: `${name.split(" ")[0]} destaca en ${top.label}`.slice(0, 80),
    body: `Rendimiento de ejemplo: ${name} muestra un nivel destacado en ${top.label}. Insight orientativo generado con datos de ejemplo del demo.`.slice(0, 400),
    metric: top.label,
    metricValue: `${Math.round(top.value)}`,
    urgency: "low",
    tags: ["ejemplo", top.key],
    timestamp: "2026-09-01T10:00:00.000Z",
    actionItems: ["Dar continuidad de minutos", "Trabajar el punto débil identificado"],
    benchmark: "Referencia de ejemplo para su categoría",
  };
}

function roleProfile(input: unknown): Record<string, unknown> {
  const p = (input as { player?: Record<string, unknown> })?.player ?? {};
  const m = (p.metrics as Record<string, number>) ?? {};
  const position = (p.position as string) ?? "Mediocentro";
  const off = ((m.shooting ?? 0) + (m.vision ?? 0)) / 2;
  const def = m.defending ?? 0;
  const tec = m.technique ?? 0;
  const fis = ((m.speed ?? 0) + (m.stamina ?? 0)) / 2;
  const raw = { ofensivo: off, defensivo: def, tecnico: tec, fisico: fis, mixto: (off + def + tec + fis) / 4 };
  const total = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
  const dist = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((v / total) * 100)]));
  const dominant = (Object.entries(raw).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixto") as
    "ofensivo" | "defensivo" | "tecnico" | "fisico" | "mixto";
  const avg = Math.round((off + def + tec + fis) / 4);
  const cap = (base: number) => ({ current: base, p6m: Math.min(99, base + 4), p18m: Math.min(99, base + 9) });
  const top = topMetric(m);
  const secondary = (p.secondaryPositions as string[]) ?? [];

  return {
    playerId: (p.id as string) ?? "demo",
    dominantIdentity: dominant,
    identityDistribution: dist,
    topPositions: [
      { code: position.slice(0, 3).toUpperCase(), fit: 85, confidence: 0.72 },
      ...secondary.slice(0, 2).map((s) => ({ code: s.slice(0, 3).toUpperCase(), fit: 70, confidence: 0.6 })),
    ].slice(0, 5),
    topArchetypes: [
      { code: dominant, fit: 82, stability: "en_desarrollo" as const },
    ],
    capabilities: {
      tactical: cap(Math.round((m.vision ?? 55))),
      technical: cap(Math.round(tec || 55)),
      physical: cap(Math.round(fis || 55)),
    },
    strengths: [`${METRIC_ES[top.key] ?? "técnica"} por encima de la media`, "Buena lectura para su edad"],
    risks: ["Consolidar bajo presión competitiva"],
    gaps: ["Datos de vídeo pendientes (demo)"],
    overallConfidence: 0.68,
    summary: `Perfil de rol de ejemplo (${position}) con identidad ${dominant}. Nivel base ~${avg}. Datos de ejemplo del demo.`.slice(0, 400),
  };
}

/** Respuesta de agente de ejemplo para el demo, sin red. */
export function demoAgentResponse(endpoint: string, input: unknown): AgentResponse<unknown> {
  switch (endpoint) {
    case "scout-insight":
      return { success: true, data: scoutInsight(input), agentName: endpoint };
    case "role-profile":
      return { success: true, data: roleProfile(input), agentName: endpoint };
    default:
      // Superficie no cubierta por el demo: fallo elegante (el consumidor muestra
      // su estado honesto de «no disponible», sin llamada real ni error de red).
      return { success: false, error: "No disponible en la demo", agentName: endpoint };
  }
}
