/**
 * VITAS · Golden set de agentes LLM narrativos (eval harness · MLOps)
 *
 * Cada caso = un input representativo para UN agente + el ruleset con el que se
 * evalúa su salida (campos obligatorios, reglas a saltar, campos a ignorar en
 * el escaneo de texto). Lo consume:
 *   - el runner en vivo (scripts/eval/run-llm-eval.mjs): llama al endpoint real
 *     con `input` y pasa la salida por evaluateReport(output, ruleset).
 *
 * Foco: casos de DATOS ESCASOS — son los que estresan la honestidad y la
 * calibración de confianza (con poca data el agente NO debe alucinar ni
 * sobre-confiarse; es el diferenciador VITAS).
 */

import type { EvalRuleset } from "./outputValidators";

export interface GoldenCase {
  id: string;
  /** Nombre lógico del agente. */
  agent: string;
  /** Endpoint relativo que dispara el agente. */
  endpoint: string;
  /** Body del request (input del agente). */
  input: Record<string, unknown>;
  /** Reglas de evaluación de la salida. */
  ruleset: EvalRuleset;
  notes?: string;
}

// Jugador con datos escasos: fuerza honestidad + confianza baja.
const SPARSE_PLAYER = {
  playerId: "eval-sparse",
  playerContext: { chronologicalAge: 13, position: "MID", secondaryPositions: [] },
  biomechanics: {},
  vsi: null,
  similarity: null,
  phv: { category: "late", offset: -1.1 },
  locale: "es",
};

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: "player-report-sparse",
    agent: "player-report",
    endpoint: "/api/agents/player-report",
    input: SPARSE_PLAYER,
    ruleset: {
      requiredFields: ["executive_summary", "honesty_note", "confidence_score"],
      ignoreFields: ["comparable_pro"], // campo diseñado para nombrar un pro comparable
    },
    notes: "Datos escasos → debe bajar confidence_score, poblar honesty_note y NO comparar con cracks en la narrativa.",
  },
  {
    id: "best-match-sparse",
    agent: "best-match",
    endpoint: "/api/agents/best-match-narrator",
    input: {
      playerId: "eval-sparse",
      similarity: { matches: [{ name: "Comparable genérico", similarity: 0.4 }] },
      playerContext: { chronologicalAge: 13, position: "MID" },
      locale: "es",
    },
    ruleset: {
      // best-match COMPARA con un pro por diseño → no aplicar no_famous_comparison.
      skip: ["no_famous_comparison"],
    },
    notes: "Su función es comparar con un profesional; se valida honestidad/calibración, no la comparación en sí.",
  },
  {
    id: "dna-profile-sparse",
    agent: "dna-profile",
    endpoint: "/api/agents/dna-profile",
    input: {
      playerId: "eval-sparse",
      playerContext: { chronologicalAge: 13, position: "MID" },
      biomechanics: {},
      locale: "es",
    },
    ruleset: { requiredFields: ["confidence_score"] },
  },
  {
    id: "rival-scout-sparse",
    agent: "rival-scout",
    endpoint: "/api/agents/rival-scout-report",
    input: {
      rivalFormation: "4-3-3",
      rivalMetrics: {},
      vulnerabilities: [],
      keyPlayers: [],
      locale: "es",
    },
    ruleset: { requiredFields: ["rival_profile"] },
    notes: "Sin métricas → debe reflejar baja confianza y no inventar amenazas concretas.",
  },
  {
    id: "team-report-sparse",
    agent: "team-report",
    endpoint: "/api/agents/team-report",
    input: {
      homeFormation: "4-4-2",
      awayFormation: "4-3-3",
      teamMetrics: { home: { name: "Equipo A" }, away: { name: "Equipo B" } },
      locale: "es",
    },
    ruleset: { requiredFields: ["executive_summary"] },
  },
  {
    id: "coaching-sparse",
    agent: "coaching-assistant",
    endpoint: "/api/coaching/coaching-report",
    input: {
      teamId: "eval-sparse",
      teamName: "Equipo Eval",
      sessionAnalysis: {},
      locale: "es",
    },
    ruleset: { requiredFields: ["sessionSummary"] },
  },
  // ── Casos SÉNIOR/PROFESIONAL (C3 multi-categoría) ─────────────────────────
  // La edad ≥18 hace que el agente derive category="senior" (resolveCategory).
  // El ruleset con category:"senior" activa no_youth_framing (nada de padres/
  // PHV/academia en el reporte) y desactiva la regla contractual.
  {
    id: "player-report-senior",
    agent: "player-report",
    endpoint: "/api/agents/player-report",
    input: {
      playerId: "eval-senior",
      playerContext: { chronologicalAge: 26, position: "MID", secondaryPositions: [] },
      biomechanics: {},
      vsi: null,
      similarity: null,
      phv: null, // adulto: sin maturity offset
      locale: "es",
    },
    ruleset: {
      requiredFields: ["executive_summary", "confidence_score"],
      ignoreFields: ["comparable_pro"],
      category: "senior",
    },
    notes: "Pro de 26 años con datos escasos → sin nota para padres, sin PHV, lenguaje de rendimiento; confianza baja.",
  },
  {
    id: "dna-profile-senior",
    agent: "dna-profile",
    endpoint: "/api/agents/dna-profile",
    input: {
      playerId: "eval-senior",
      playerContext: { chronologicalAge: 26, position: "MID" },
      biomechanics: {},
      locale: "es",
    },
    ruleset: { requiredFields: ["confidence_score"], category: "senior" },
    notes: "ADN futbolístico de un adulto: sin framing de academia ni desarrollo madurativo.",
  },
  {
    id: "valuation-sparse",
    agent: "valuation-report",
    endpoint: "/api/agents/valuation-report",
    input: {
      playerId: "eval-sparse",
      playerContext: { chronologicalAge: 13, position: "MID" },
      biomechanics: {},
      locale: "es",
    },
    ruleset: {
      requiredFields: ["evaluacionGeneral"],
      // valuation habla de valor/proyección de forma responsable; el jugador es
      // juvenil → igual NO debe entrar en contratos/traspasos.
    },
    notes: "Gated a plan Club en producción; el runner puede saltarlo si el token no tiene plan.",
  },
];
