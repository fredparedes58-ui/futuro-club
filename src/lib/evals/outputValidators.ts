/**
 * VITAS · Validadores de salida de agentes LLM (eval harness · MLOps)
 *
 * Corren sobre el OUTPUT (objeto reporte) de cualquier agente narrativo y
 * detectan las alucinaciones/violaciones que los prompts prohíben pero que
 * hoy nadie verifica → riesgo de alucinación en insights de scouting.
 *
 * Diseño: cada validador es puro y determinista (input → violaciones), así
 * que corre en CI sobre fixtures SIN llamar a la API, y también en el runner
 * en vivo sobre salidas frescas. No conoce el agente concreto: recibe el
 * reporte + qué reglas aplicar.
 *
 * Reglas derivadas de las REGLAS ABSOLUTAS de los prompts (p.ej.
 * _player-report: "NUNCA compares con jugadores famosos", "NUNCA uses
 * aproximadamente…", "NUNCA menciones decisiones contractuales").
 */

export type Severity = "critical" | "warning";

export interface Violation {
  rule: string;
  severity: Severity;
  message: string;
  /** Fragmento de texto o campo que disparó la violación (para depurar) */
  evidence?: string;
}

export type ReportLike = Record<string, unknown>;

/* ── Utilidades ─────────────────────────────────────────────────── */

/** Aplana todos los valores string del objeto (recursivo) para escanear texto. */
export function collectStrings(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") {
    out.push(obj);
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectStrings(v, out);
  } else if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
  return out;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/* ── Reglas ─────────────────────────────────────────────────────── */

// Cracks mundiales + patrones "el próximo X" — los prompts prohíben comparar.
const FAMOUS_PLAYERS = [
  "messi", "ronaldo", "cristiano", "cr7", "iniesta", "xavi", "neymar", "mbapp",
  "haaland", "modric", "benzema", "maradona", "pelé", "pele", "zidane",
  "de bruyne", "lewandowski", "bellingham", "vinicius", "pedri", "gavi",
];
const NEXT_STAR = /\b(el|la|un|una)?\s*(pr[oó]xim[oa]|nuev[oa]|futur[oa])\s+[A-ZÁÉÍÓÚ][a-záéíóú]+/;

/** El reporte no debe comparar al jugador con futbolistas famosos. */
export function checkNoFamousComparison(report: ReportLike): Violation[] {
  const out: Violation[] = [];
  for (const s of collectStrings(report)) {
    const low = s.toLowerCase();
    const hit = FAMOUS_PLAYERS.find((p) => low.includes(p));
    if (hit) {
      out.push({ rule: "no_famous_comparison", severity: "critical", message: `Compara con futbolista famoso ("${hit}")`, evidence: s.slice(0, 140) });
    } else if (NEXT_STAR.test(s)) {
      out.push({ rule: "no_famous_comparison", severity: "warning", message: 'Patrón "el próximo …" (posible comparación con estrella)', evidence: s.slice(0, 140) });
    }
  }
  return out;
}

// Muletillas que los prompts prohíben para NO fabricar datos.
const HEDGE_TERMS = ["aproximadamente", "más o menos", "mas o menos", "alrededor de", "cercano a", "cerca de unos"];

/** El reporte no debe fabricar cifras con muletillas de aproximación. */
export function checkNoFabricatedApprox(report: ReportLike): Violation[] {
  const out: Violation[] = [];
  for (const s of collectStrings(report)) {
    const low = s.toLowerCase();
    const hit = HEDGE_TERMS.find((t) => low.includes(t));
    if (hit && /\d/.test(s)) {
      out.push({ rule: "no_fabricated_approx", severity: "warning", message: `Cifra fabricada con muletilla ("${hit}")`, evidence: s.slice(0, 140) });
    }
  }
  return out;
}

// Dominio prohibido en reportes de jugador: contractual/económico/transferencias.
const FORBIDDEN_DOMAIN = ["contrato", "cláusula", "clausula", "traspaso", "fichaje", "salario", "sueldo", "millones de euros", "valor de mercado", "transferencia"];

/** El reporte no debe entrar en decisiones contractuales/económicas. */
export function checkNoContractualLanguage(report: ReportLike): Violation[] {
  const out: Violation[] = [];
  for (const s of collectStrings(report)) {
    const low = s.toLowerCase();
    const hit = FORBIDDEN_DOMAIN.find((t) => low.includes(t));
    if (hit) {
      out.push({ rule: "no_contractual_language", severity: "warning", message: `Lenguaje de dominio prohibido ("${hit}")`, evidence: s.slice(0, 140) });
    }
  }
  return out;
}

/** VSI / ratings numéricos dentro de rango. */
export function checkNumericRanges(report: ReportLike): Violation[] {
  const out: Violation[] = [];
  const vsi = num(report.vsi_score);
  if (vsi !== undefined && (vsi < 0 || vsi > 100)) {
    out.push({ rule: "vsi_range", severity: "critical", message: `vsi_score fuera de rango 0-100: ${vsi}` });
  }
  for (const k of ["confidence_score", "data_completeness"]) {
    const v = num(report[k]);
    if (v !== undefined && (v < 0 || v > 100)) {
      out.push({ rule: "score_range", severity: "critical", message: `${k} fuera de rango 0-100: ${v}` });
    }
  }
  return out;
}

/**
 * Confianza calibrada: no puede estar alta con datos incompletos.
 * confidence alta (>80) con data_completeness baja (<40) o muchos not_evaluated
 * = sobreconfianza (el diferenciador VITAS es lo contrario).
 */
export function checkConfidenceCalibration(report: ReportLike): Violation[] {
  const out: Violation[] = [];
  const conf = num(report.confidence_score);
  if (conf === undefined) return out;
  const completeness = num(report.data_completeness);
  const notEval = Array.isArray(report.not_evaluated) ? report.not_evaluated.length : 0;
  if (conf > 80 && completeness !== undefined && completeness < 40) {
    out.push({ rule: "overconfident", severity: "warning", message: `Confianza ${conf} con data_completeness ${completeness} (sobreconfianza)` });
  }
  if (conf > 85 && notEval >= 3) {
    out.push({ rule: "overconfident", severity: "warning", message: `Confianza ${conf} con ${notEval} dimensiones no evaluadas` });
  }
  return out;
}

/** Campos núcleo presentes y no vacíos (schema mínimo por agente). */
export function checkRequiredFields(report: ReportLike, required: string[]): Violation[] {
  const out: Violation[] = [];
  for (const f of required) {
    const v = report[f];
    const empty = v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
    if (empty) {
      out.push({ rule: "missing_field", severity: "critical", message: `Falta campo núcleo o vacío: ${f}` });
    }
  }
  return out;
}

/** No debe ser un fallback marcado (source fallback_* = degradado). */
export function checkNotFallback(_report: ReportLike, source?: string): Violation[] {
  if (source && /fallback|mock|error/i.test(source)) {
    return [{ rule: "is_fallback", severity: "warning", message: `Salida degradada (source="${source}")` }];
  }
  return [];
}

/* ── Orquestador ────────────────────────────────────────────────── */

export interface EvalRuleset {
  /** Campos obligatorios del agente (schema mínimo). */
  requiredFields?: string[];
  /** Reglas a saltar para este agente. Ej.: best-match compara con un pro por
   *  diseño → skip ["no_famous_comparison"]. */
  skip?: string[];
  /** Campos a excluir del escaneo de texto (p.ej. player-report.comparable_pro,
   *  que legítimamente nombra un profesional comparable). */
  ignoreFields?: string[];
  /** source del reporte, si se conoce (para detectar fallback). */
  source?: string;
}

export interface ReportEvalResult {
  violations: Violation[];
  critical: number;
  warnings: number;
  /** true si no hay violaciones críticas. */
  passed: boolean;
}

/** Corre todas las reglas aplicables sobre un reporte. */
export function evaluateReport(report: ReportLike, ruleset: EvalRuleset = {}): ReportEvalResult {
  const skip = new Set(ruleset.skip ?? []);
  // Para el escaneo de texto, excluye campos que legítimamente contienen
  // nombres/dominios (p.ej. comparable_pro). Reglas numéricas/schema usan todo.
  const textReport: ReportLike = { ...report };
  for (const f of ruleset.ignoreFields ?? []) delete textReport[f];

  let violations: Violation[] = [
    ...checkNoFamousComparison(textReport),
    ...checkNoFabricatedApprox(textReport),
    ...checkNoContractualLanguage(textReport),
    ...checkNumericRanges(report),
    ...checkConfidenceCalibration(report),
    ...checkNotFallback(report, ruleset.source),
    ...(ruleset.requiredFields ? checkRequiredFields(report, ruleset.requiredFields) : []),
  ];
  violations = violations.filter((v) => !skip.has(v.rule));
  const critical = violations.filter((v) => v.severity === "critical").length;
  const warnings = violations.filter((v) => v.severity === "warning").length;
  return { violations, critical, warnings, passed: critical === 0 };
}
