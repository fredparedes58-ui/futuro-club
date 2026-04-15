/**
 * Tests for edge-compatible report quality check.
 * Validates dimension score scale (0-10), VSI adjustment coherence,
 * and age-projection plausibility.
 */
import { describe, it, expect } from "vitest";
import { checkPlayerReportQuality, checkTeamReportQuality } from "../../../api/_lib/reportQualityCheck";

// ── Helper: build a valid report ────────────────────────────────────────

function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    estadoActual: {
      resumenEjecutivo: "Jugador con buena técnica.",
      nivelActual: "medio_alto",
      dimensiones: {
        velocidadDecision:   { score: 7, observacion: "Buena" },
        tecnicaConBalon:     { score: 8, observacion: "Destacada" },
        inteligenciaTactica: { score: 6, observacion: "Promedio alto" },
        capacidadFisica:     { score: 5, observacion: "Promedio" },
        liderazgoPresencia:  { score: 4, observacion: "En desarrollo" },
        eficaciaCompetitiva: { score: 6, observacion: "Buena" },
      },
      ajusteVSIVideoScore: 3,
    },
    evaluacionPsicologica: {
      concentracion: 70,
      resistenciaMental: 65,
      motivacion: 80,
      adaptabilidad: 60,
      liderazgo: 50,
    },
    adnFutbolistico: {
      estiloJuego: "Asociativo",
      arquetipoTactico: "Creador",
    },
    planDesarrollo: {
      objetivo6meses: "Mejorar defensa 1v1",
      objetivo18meses: "Titular sub-16",
    },
    confianza: 0.78,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("checkPlayerReportQuality", () => {
  it("validates a correct report as valid", () => {
    const result = checkPlayerReportQuality(makeReport(), 14);
    expect(result.valid).toBe(true);
    expect(result.qualityScore).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.feedbackForAgent).toBeUndefined();
  });

  // ── Dimension scale validation (0-10) ──────────────────────────────

  it("accepts dimension scores in 0-10 range", () => {
    const report = makeReport();
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(true);
  });

  it("rejects dimension scores > 10", () => {
    const report = makeReport({
      estadoActual: {
        resumenEjecutivo: "Test",
        dimensiones: {
          velocidadDecision:   { score: 85 }, // Wrong! Should be 0-10
          tecnicaConBalon:     { score: 70 },
          inteligenciaTactica: { score: 60 },
          capacidadFisica:     { score: 50 },
          liderazgoPresencia:  { score: 40 },
          eficaciaCompetitiva: { score: 55 },
        },
        ajusteVSIVideoScore: 3,
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("0-10"))).toBe(true);
  });

  it("rejects negative dimension scores", () => {
    const report = makeReport({
      estadoActual: {
        resumenEjecutivo: "Test",
        dimensiones: {
          velocidadDecision: { score: -1 },
          tecnicaConBalon: { score: 5 },
          inteligenciaTactica: { score: 5 },
          capacidadFisica: { score: 5 },
          liderazgoPresencia: { score: 5 },
          eficaciaCompetitiva: { score: 5 },
        },
        ajusteVSIVideoScore: 0,
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("0-10"))).toBe(true);
  });

  // ── VSI adjustment coherence ───────────────────────────────────────

  it("accepts ajusteVSI in valid range (-15 to +15)", () => {
    const report = makeReport();
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(true);
  });

  it("rejects ajusteVSI outside -15 to +15", () => {
    const report = makeReport({
      estadoActual: {
        ...makeReport().estadoActual,
        ajusteVSIVideoScore: 20,
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("rango permitido"))).toBe(true);
  });

  it("flags negative VSI adjustment with high dimension avg", () => {
    const report = makeReport({
      estadoActual: {
        resumenEjecutivo: "Elite player",
        dimensiones: {
          velocidadDecision:   { score: 9 },
          tecnicaConBalon:     { score: 8 },
          inteligenciaTactica: { score: 8 },
          capacidadFisica:     { score: 7 },
          liderazgoPresencia:  { score: 8 },
          eficaciaCompetitiva: { score: 9 },
        },
        ajusteVSIVideoScore: -12, // Very negative with high avg (~8.2)
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("incoherente") && i.includes("negativo"))).toBe(true);
  });

  it("flags positive VSI adjustment with low dimension avg", () => {
    const report = makeReport({
      estadoActual: {
        resumenEjecutivo: "Weak player",
        dimensiones: {
          velocidadDecision:   { score: 2 },
          tecnicaConBalon:     { score: 3 },
          inteligenciaTactica: { score: 2 },
          capacidadFisica:     { score: 3 },
          liderazgoPresencia:  { score: 2 },
          eficaciaCompetitiva: { score: 3 },
        },
        ajusteVSIVideoScore: 12, // Very positive with low avg (~2.5)
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("incoherente") && i.includes("positivo"))).toBe(true);
  });

  it("allows moderate VSI adjustment with mid-range dimensions", () => {
    const report = makeReport({
      estadoActual: {
        resumenEjecutivo: "Average player",
        dimensiones: {
          velocidadDecision:   { score: 5 },
          tecnicaConBalon:     { score: 5 },
          inteligenciaTactica: { score: 5 },
          capacidadFisica:     { score: 5 },
          liderazgoPresencia:  { score: 5 },
          eficaciaCompetitiva: { score: 5 },
        },
        ajusteVSIVideoScore: -5, // Moderate negative with avg=5
      },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(true);
  });

  // ── Missing fields ─────────────────────────────────────────────────

  it("detects missing required top-level fields", () => {
    const result = checkPlayerReportQuality({}, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
    expect(result.issues.some(i => i.includes("estadoActual"))).toBe(true);
    expect(result.issues.some(i => i.includes("confianza"))).toBe(true);
  });

  it("detects missing resumenEjecutivo", () => {
    const report = makeReport({
      estadoActual: { dimensiones: { velocidadDecision: { score: 5 } } },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.issues.some(i => i.includes("resumenEjecutivo"))).toBe(true);
  });

  it("detects missing dimensiones", () => {
    const report = makeReport({
      estadoActual: { resumenEjecutivo: "Test" },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.issues.some(i => i.includes("dimensiones"))).toBe(true);
  });

  // ── Age-projection realism ────────────────────────────────────────

  it("flags ambitious projections for very young players (< 12)", () => {
    const report = makeReport({
      planDesarrollo: {
        objetivo6meses: "Llegar a primera división profesional",
      },
    });
    const result = checkPlayerReportQuality(report, 10);
    expect(result.issues.some(i => i.includes("ambiciosa"))).toBe(true);
  });

  it("allows normal projections for young players", () => {
    const report = makeReport({
      planDesarrollo: {
        objetivo6meses: "Mejorar regate en banda",
        objetivo18meses: "Titular en sub-14",
      },
    });
    const result = checkPlayerReportQuality(report, 11);
    expect(result.issues.filter(i => i.includes("ambiciosa"))).toHaveLength(0);
  });

  // ── Confianza range ────────────────────────────────────────────────

  it("rejects confidence outside 0-1", () => {
    const report = makeReport({ confianza: 1.5 });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("Confianza"))).toBe(true);
  });

  it("accepts confidence at boundaries", () => {
    const report0 = makeReport({ confianza: 0 });
    expect(checkPlayerReportQuality(report0, 14).valid).toBe(true);

    const report1 = makeReport({ confianza: 1 });
    expect(checkPlayerReportQuality(report1, 14).valid).toBe(true);
  });

  // ── Psychological values ───────────────────────────────────────────

  it("rejects psychological values outside 0-100", () => {
    const report = makeReport({
      evaluacionPsicologica: { concentracion: 150 },
    });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("psicológicos"))).toBe(true);
  });

  // ── Quality score calculation ──────────────────────────────────────

  it("reduces quality score by 15 per issue", () => {
    const report = makeReport({ confianza: 2 }); // 1 issue
    const result = checkPlayerReportQuality(report, 14);
    expect(result.qualityScore).toBe(85);
  });

  it("generates feedbackForAgent when invalid", () => {
    const report = makeReport({ confianza: 2 });
    const result = checkPlayerReportQuality(report, 14);
    expect(result.feedbackForAgent).toBeDefined();
    expect(result.feedbackForAgent).toContain("VALIDACIÓN SEMÁNTICA FALLIDA");
  });

  it("quality score never goes below 0", () => {
    const result = checkPlayerReportQuality({}, 14); // Many missing fields
    expect(result.qualityScore).toBeGreaterThanOrEqual(0);
  });
});

describe("checkTeamReportQuality", () => {
  function makeTeamReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      resumenEjecutivo: "Buen equipo",
      formacion: "4-3-3",
      jugadores: [
        { nombre: "Player 1", velocidadMaxKmh: 28 },
        { nombre: "Player 2", velocidadMaxKmh: 30 },
      ],
      evaluacionGeneral: { nota: 7 },
      posesion: { porcentaje: 55 },
      confianza: 0.8,
      ...overrides,
    };
  }

  it("validates correct team report", () => {
    const result = checkTeamReportQuality(makeTeamReport());
    expect(result.valid).toBe(true);
  });

  it("flags unrealistic player speed > 38 km/h", () => {
    const result = checkTeamReportQuality(makeTeamReport({
      jugadores: [{ nombre: "Flash", velocidadMaxKmh: 42 }],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("velocidad"))).toBe(true);
  });

  it("flags unrealistic possession", () => {
    const result = checkTeamReportQuality(makeTeamReport({
      posesion: { porcentaje: 95 },
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("Posesión"))).toBe(true);
  });

  it("flags confidence outside 0-1", () => {
    const result = checkTeamReportQuality(makeTeamReport({ confianza: -0.5 }));
    expect(result.valid).toBe(false);
  });

  it("detects missing required fields", () => {
    const result = checkTeamReportQuality({});
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes("resumenEjecutivo"))).toBe(true);
  });
});
