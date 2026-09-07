/**
 * VITAS · Respuestas de agente de EJEMPLO para el DEMO (piso piloto)
 *
 * En el demo no hay claves de IA (Anthropic/Gemini) ni sesión → las llamadas a
 * los agentes (`/api/agents/*`) no deben salir a la red (fallarían con 401 y
 * costarían). Este módulo devuelve respuestas DETERMINISTAS de ejemplo, sin
 * red y sin coste, derivadas de los datos que ya trae la petición. `agentService`
 * las usa cuando `IS_DEMO`. La UI las muestra bajo el banner «Datos de ejemplo».
 *
 * MULTI-IDIOMA (sin ternarios es/en): los textos se eligen con `pickLocale` desde
 * mapas por idioma → añadir un idioma = añadir su clave (si falta, cae al idioma
 * por defecto). `agentService` inyecta `locale`; si faltara, se usa i18n.
 *
 * Sólo se rellenan las superficies visibles del demo (scout-insight, role-profile).
 * Para el resto se devuelve un fallo elegante → el consumidor muestra su estado
 * honesto de «no disponible» (sin error ni llamada real).
 */

import type { AgentResponse } from "@/agents/contracts";
import i18n from "@/i18n";
import { normalizeLocale, pickLocale, type ReportLocale } from "@/lib/shared/locale";

const METRIC_LABELS: Partial<Record<ReportLocale, Record<string, string>>> = {
  es: {
    speed: "velocidad", technique: "técnica", vision: "visión de juego",
    stamina: "resistencia", shooting: "definición", defending: "trabajo defensivo",
  },
  en: {
    speed: "speed", technique: "technique", vision: "game vision",
    stamina: "stamina", shooting: "finishing", defending: "defensive work",
  },
};

/** Etiqueta de identidad dominante para MOSTRAR (el valor enum no se traduce). */
const IDENTITY_LABELS: Partial<Record<ReportLocale, Record<string, string>>> = {
  es: { ofensivo: "ofensiva", defensivo: "defensiva", tecnico: "técnica", fisico: "física", mixto: "mixta" },
  en: { ofensivo: "attacking", defensivo: "defensive", tecnico: "technical", fisico: "physical", mixto: "mixed" },
};

function metricLabels(locale: ReportLocale): Record<string, string> {
  return pickLocale(locale, METRIC_LABELS);
}

function topMetric(
  metrics: Record<string, number> | undefined,
  locale: ReportLocale,
): { key: string; label: string; value: number } {
  const labels = metricLabels(locale);
  const m = metrics ?? {};
  const entries = Object.keys(labels).map((k) => ({ key: k, label: labels[k], value: m[k] ?? 0 }));
  return entries.sort((a, b) => b.value - a.value)[0] ?? { key: "technique", label: labels.technique, value: 60 };
}

function scoutInsight(input: unknown, locale: ReportLocale): Record<string, unknown> {
  const p = (input as { player?: Record<string, unknown> })?.player ?? {};
  const name = (p.name as string) ?? pickLocale(locale, { es: "Jugador", en: "Player" });
  const first = name.split(" ")[0];
  const metrics = p.recentMetrics as Record<string, number> | undefined;
  const top = topMetric(metrics, locale);
  const headline = pickLocale(locale, {
    es: `${first} destaca en ${top.label}`,
    en: `${first} stands out in ${top.label}`,
  });
  const body = pickLocale(locale, {
    es: `Rendimiento de ejemplo: ${name} muestra un nivel destacado en ${top.label}. Insight orientativo generado con datos de ejemplo del demo.`,
    en: `Example performance: ${name} shows a strong level in ${top.label}. Indicative insight generated with the demo's example data.`,
  });
  return {
    playerId: (p.id as string) ?? "demo",
    type: "general",
    headline: headline.slice(0, 80),
    body: body.slice(0, 400),
    metric: top.label,
    metricValue: `${Math.round(top.value)}`,
    urgency: "low",
    tags: [pickLocale(locale, { es: "ejemplo", en: "example" }), top.key],
    timestamp: "2026-09-01T10:00:00.000Z",
    actionItems: pickLocale(locale, {
      es: ["Dar continuidad de minutos", "Trabajar el punto débil identificado"],
      en: ["Maintain playing time", "Work on the identified weak point"],
    }),
    benchmark: pickLocale(locale, {
      es: "Referencia de ejemplo para su categoría",
      en: "Example benchmark for their age group",
    }),
  };
}

function roleProfile(input: unknown, locale: ReportLocale): Record<string, unknown> {
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
  const top = topMetric(m, locale);
  const secondary = (p.secondaryPositions as string[]) ?? [];
  const dominantLabel = pickLocale(locale, IDENTITY_LABELS)[dominant] ?? dominant;

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
    strengths: pickLocale(locale, {
      es: [`${top.label} por encima de la media`, "Buena lectura para su edad"],
      en: [`${top.label} above average`, "Good game reading for their age"],
    }),
    risks: pickLocale(locale, {
      es: ["Consolidar bajo presión competitiva"],
      en: ["Consolidate under competitive pressure"],
    }),
    gaps: pickLocale(locale, {
      es: ["Datos de vídeo pendientes (demo)"],
      en: ["Video data pending (demo)"],
    }),
    overallConfidence: 0.68,
    summary: pickLocale(locale, {
      es: `Perfil de rol de ejemplo (${position}) con identidad ${dominantLabel}. Nivel base ~${avg}. Datos de ejemplo del demo.`,
      en: `Example role profile (${position}) with ${dominantLabel} identity. Base level ~${avg}. Demo example data.`,
    }).slice(0, 400),
  };
}

/** Respuesta de agente de ejemplo para el demo, sin red. */
export function demoAgentResponse(endpoint: string, input: unknown): AgentResponse<unknown> {
  const locale = normalizeLocale((input as { locale?: unknown })?.locale ?? i18n.language);
  switch (endpoint) {
    case "scout-insight":
      return { success: true, data: scoutInsight(input, locale), agentName: endpoint };
    case "role-profile":
      return { success: true, data: roleProfile(input, locale), agentName: endpoint };
    default:
      // Superficie no cubierta por el demo: fallo elegante (el consumidor muestra
      // su estado honesto de «no disponible», sin llamada real ni error de red).
      return {
        success: false,
        error: pickLocale(locale, { es: "No disponible en la demo", en: "Not available in the demo" }),
        agentName: endpoint,
      };
  }
}
