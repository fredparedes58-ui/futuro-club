/**
 * VITAS · Tests FASE 2 — validación Zod de la salida del LLM
 *
 * Contrato: shape basura ({}, {raw}, disculpas del modelo, tipos incorrectos)
 * NO pasa; salidas legítimas (mínimas o completas, incluso con campos extra)
 * SÍ pasan. Si esto se cumple, los 4 agentes caen a su fallback marcado con
 * source "fallback_schema_error" en vez de entregar basura a la UI.
 */
import { describe, it, expect } from "vitest";
import {
  teamReportOutputSchema,
  rivalScoutOutputSchema,
  coachingAssistantOutputSchema,
  valuationOutputSchema,
  validateLLMReport,
} from "../_outputSchemas";

describe("validateLLMReport — atrapa basura", () => {
  it("rechaza objeto vacío {} en los 4 schemas", () => {
    for (const schema of [teamReportOutputSchema, rivalScoutOutputSchema, coachingAssistantOutputSchema, valuationOutputSchema]) {
      const r = validateLLMReport(schema, {});
      expect(r.ok).toBe(false);
    }
  });

  it("rechaza el blob {raw: texto} (coaching-assistant, respuesta sin JSON)", () => {
    const r = validateLLMReport(coachingAssistantOutputSchema, { raw: "Lo siento, no puedo generar el informe." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toContain("sessionSummary");
  });

  it("rechaza campo núcleo con tipo incorrecto (number en vez de string)", () => {
    const r = validateLLMReport(teamReportOutputSchema, { executive_summary: 42 });
    expect(r.ok).toBe(false);
  });

  it("rechaza campo núcleo vacío (string de longitud 0)", () => {
    const r = validateLLMReport(valuationOutputSchema, { evaluacionGeneral: "" });
    expect(r.ok).toBe(false);
  });

  it("rechaza null y arrays como raíz", () => {
    expect(validateLLMReport(rivalScoutOutputSchema, null).ok).toBe(false);
    expect(validateLLMReport(rivalScoutOutputSchema, ["a", "b"]).ok).toBe(false);
  });
});

describe("validateLLMReport — acepta salidas legítimas", () => {
  it("acepta la salida MÍNIMA de cada agente (solo campo núcleo)", () => {
    expect(validateLLMReport(teamReportOutputSchema, { executive_summary: "Partido igualado." }).ok).toBe(true);
    expect(validateLLMReport(rivalScoutOutputSchema, { rival_profile: "Equipo de presión alta." }).ok).toBe(true);
    expect(validateLLMReport(coachingAssistantOutputSchema, { sessionSummary: "Buena sesión técnica." }).ok).toBe(true);
    expect(validateLLMReport(valuationOutputSchema, { evaluacionGeneral: "Jugador con potencial sólido." }).ok).toBe(true);
  });

  it("acepta la salida COMPLETA del prompt de team-report", () => {
    const full = {
      executive_summary: "Resumen del partido.",
      tactical_overview: { home: { style: "posesión", strengths: ["s1"], weaknesses: ["w1"] }, away: { style: "contra", strengths: [], weaknesses: [] } },
      key_battles: ["mediocampo"],
      momentum_shifts: ["min 60"],
      recommendations: { home: ["r1"], away: ["r2"] },
      overall_rating: { home: 7.5, away: 6.8 },
    };
    expect(validateLLMReport(teamReportOutputSchema, full).ok).toBe(true);
  });

  it("NO recorta campos extra (passthrough — el prompt puede evolucionar)", () => {
    const r = validateLLMReport(teamReportOutputSchema, { executive_summary: "ok", campo_futuro: "nuevo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.report as Record<string, unknown>).campo_futuro).toBe("nuevo");
  });

  it("acepta phvAlerts null (coaching-assistant lo emite como string[] | null)", () => {
    const r = validateLLMReport(coachingAssistantOutputSchema, { sessionSummary: "ok", phvAlerts: null });
    expect(r.ok).toBe(true);
  });

  it("los issues de fallo son compactos y con path (para logs)", () => {
    const r = validateLLMReport(valuationOutputSchema, { tierAnalisis: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.length).toBeLessThan(500);
      expect(r.issues).toMatch(/evaluacionGeneral/);
    }
  });
});
