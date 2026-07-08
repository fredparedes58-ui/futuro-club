/**
 * VITAS · Test del eval harness de salidas LLM (MLOps)
 *
 * Determinista (sin API): corre los validadores anti-alucinación sobre fixtures
 * BUENOS (deben pasar) y MALOS (deben cazarse). Es el guard-rail en CI contra
 * regresiones en los agentes y en los propios validadores.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateReport,
  checkNoFamousComparison,
  checkNoFabricatedApprox,
  checkNoContractualLanguage,
  checkConfidenceCalibration,
  checkNumericRanges,
} from "@/lib/evals/outputValidators";

// Reporte honesto y limpio (lo que un buen agente produce con datos escasos).
const CLEAN_REPORT = {
  executive_summary: "Mediocampista sub-13 con lectura de juego prometedora. Evaluación parcial por datos limitados.",
  honesty_note: "Con los datos disponibles no se puede evaluar velocidad ni resistencia; el score es orientativo.",
  strengths: [{ title: "Posicionamiento", evidence: "Se ubica bien entre líneas (observado en vídeo)" }],
  comparable_pro: "Perfil tipo mediocentro organizador",
  vsi_score: 61,
  confidence_score: 45,
  data_completeness: 40,
  not_evaluated: ["velocidad", "resistencia"],
};

describe("outputValidators · reporte limpio", () => {
  it("un reporte honesto no dispara violaciones críticas", () => {
    const r = evaluateReport(CLEAN_REPORT, {
      requiredFields: ["executive_summary", "honesty_note", "confidence_score"],
      ignoreFields: ["comparable_pro"],
    });
    expect(r.critical).toBe(0);
    expect(r.passed).toBe(true);
  });
});

describe("outputValidators · caza alucinaciones", () => {
  it("detecta comparación con futbolista famoso", () => {
    const v = checkNoFamousComparison({ summary: "Es el próximo Messi de la cantera." });
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.rule === "no_famous_comparison")).toBe(true);
  });

  it("detecta cifras fabricadas con muletillas", () => {
    const v = checkNoFabricatedApprox({ note: "Corre aproximadamente 32 km/h en sprint." });
    expect(v.some((x) => x.rule === "no_fabricated_approx")).toBe(true);
  });

  it("detecta lenguaje contractual/económico prohibido", () => {
    const v = checkNoContractualLanguage({ note: "Su cláusula de traspaso rondaría los millones de euros." });
    expect(v.some((x) => x.rule === "no_contractual_language")).toBe(true);
  });

  it("detecta VSI fuera de rango", () => {
    const v = checkNumericRanges({ vsi_score: 140 });
    expect(v.some((x) => x.rule === "vsi_range" && x.severity === "critical")).toBe(true);
  });

  it("detecta sobreconfianza (confianza alta con pocos datos)", () => {
    const v = checkConfidenceCalibration({ confidence_score: 92, data_completeness: 20, not_evaluated: ["a", "b", "c", "d"] });
    expect(v.some((x) => x.rule === "overconfident")).toBe(true);
  });
});

describe("outputValidators · evaluateReport integral", () => {
  it("un reporte alucinado acumula varias violaciones y NO pasa", () => {
    const HALLUCINATED = {
      executive_summary: "El próximo Cristiano Ronaldo. Corre aproximadamente 35 km/h. Su fichaje valdría millones de euros.",
      vsi_score: 99,
      confidence_score: 95,
      data_completeness: 10,
      not_evaluated: ["velocidad", "resistencia", "técnica", "táctica"],
    };
    const r = evaluateReport(HALLUCINATED, { requiredFields: ["executive_summary", "honesty_note"] });
    expect(r.passed).toBe(false);
    expect(r.critical).toBeGreaterThan(0); // falta honesty_note
    expect(r.violations.some((v) => v.rule === "no_famous_comparison")).toBe(true);
    expect(r.violations.some((v) => v.rule === "no_fabricated_approx")).toBe(true);
    expect(r.violations.some((v) => v.rule === "no_contractual_language")).toBe(true);
    expect(r.violations.some((v) => v.rule === "overconfident")).toBe(true);
  });

  it("ignoreFields excluye un campo diseñado (comparable_pro con nombre de pro)", () => {
    const report = { executive_summary: "Buen perfil.", comparable_pro: "Estilo Xavi Hernández" };
    const withIgnore = evaluateReport(report, { ignoreFields: ["comparable_pro"] });
    const without = evaluateReport(report, {});
    expect(without.violations.some((v) => v.rule === "no_famous_comparison")).toBe(true);
    expect(withIgnore.violations.some((v) => v.rule === "no_famous_comparison")).toBe(false);
  });

  it("skip desactiva una regla para agentes que la violan por diseño (best-match)", () => {
    const report = { rival_profile: "Comparable a Iniesta por su pausa." };
    const skipped = evaluateReport(report, { skip: ["no_famous_comparison"] });
    expect(skipped.violations.some((v) => v.rule === "no_famous_comparison")).toBe(false);
  });

  it("marca salida degradada (fallback) como warning", () => {
    const r = evaluateReport({ executive_summary: "x" }, { source: "fallback_schema_error" });
    expect(r.violations.some((v) => v.rule === "is_fallback")).toBe(true);
  });
});

describe("outputValidators · multi-categoría (C3)", () => {
  const SENIOR_CLEAN = {
    executive_summary: "Mediocentro de 26 años en buen momento de forma. Nivel actual competitivo para la categoría; encaje natural en el rol de organizador.",
    strengths: [{ title: "Circulación", evidence: "92% de pases completados en el clip analizado" }],
    confidence_score: 55,
    data_completeness: 50,
    not_evaluated: ["duelo aéreo"],
  };

  it("reporte sénior limpio pasa (sin framing juvenil)", () => {
    const r = evaluateReport(SENIOR_CLEAN, { category: "senior", requiredFields: ["executive_summary"] });
    expect(r.critical).toBe(0);
    expect(r.passed).toBe(true);
  });

  it("caza biología juvenil en reporte sénior como CRÍTICO (PHV en un adulto = fabricación)", () => {
    const r = evaluateReport(
      { executive_summary: "Está en plena ventana PHV y su maduración sugiere margen de crecimiento." },
      { category: "senior" },
    );
    expect(r.violations.some((v) => v.rule === "no_youth_framing" && v.severity === "critical")).toBe(true);
    expect(r.passed).toBe(false);
  });

  it("caza framing de audiencia juvenil en sénior como warning (padres/desarrollo)", () => {
    const r = evaluateReport(
      { executive_summary: "Nota para los padres: el jugador muestra gran potencial de desarrollo." },
      { category: "senior" },
    );
    const hits = r.violations.filter((v) => v.rule === "no_youth_framing");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((v) => v.severity === "warning")).toBe(true);
  });

  it("en senior la regla contractual se salta automáticamente (mercado legítimo en pro)", () => {
    const report = { executive_summary: "Su valor de mercado actual justifica una renovación de contrato." };
    const senior = evaluateReport(report, { category: "senior" });
    const youth = evaluateReport(report, {});
    expect(youth.violations.some((v) => v.rule === "no_contractual_language")).toBe(true);
    expect(senior.violations.some((v) => v.rule === "no_contractual_language")).toBe(false);
  });

  it("en youth (default) no_youth_framing NO corre (los reportes juveniles hablan de PHV legítimamente)", () => {
    const r = evaluateReport({ executive_summary: "En ventana PHV; nota para los padres incluida." }, {});
    expect(r.violations.some((v) => v.rule === "no_youth_framing")).toBe(false);
  });
});
