/**
 * VITAS · Decision-Making Score (Sprint 1.1)
 *
 * Compositor determinista que une las señales cognitivas ya medidas por
 * VITAS en UN score 0-100 vendible con breakdown. "Aire limpio" competitivo:
 * aiScout no puede medir nada de esto porque solo graba drills aislados.
 *
 * Componentes (todos opcionales — los pesos se renormalizan sobre lo
 * disponible y la confianza refleja cuántas fuentes reales hay):
 *
 *   scanIQ           — Scan IQ calibrado por edad (scanIQ.ts / detector real)
 *   decisionSpeed    — BPE decisionSpeed 0-100 (temporalEventLinker)
 *   pressureComposure— BPE clutchFactor 0-100 (rendimiento bajo presión)
 *   tacticalAwareness— dimensión `inteligenciaTactica` del análisis de video
 *                      (escala 0-10 → 0-100)
 *
 * Sin llamadas a IA: coste cero por cómputo, reproducible, explicable
 * (cada punto del score es trazable a su fuente — anti caja-negra).
 */

// ── Configuración (ajustable sin tocar la lógica) ─────────────────────
export const DM_WEIGHTS = {
  scanIQ: 0.35,
  decisionSpeed: 0.35,
  pressureComposure: 0.15,
  tacticalAwareness: 0.15,
} as const;

export type DMComponentKey = keyof typeof DM_WEIGHTS;

export const DM_COMPONENT_LABELS: Record<DMComponentKey, string> = {
  scanIQ: "Scan IQ (exploración visual)",
  decisionSpeed: "Velocidad de decisión",
  pressureComposure: "Temple bajo presión",
  tacticalAwareness: "Lectura táctica",
};

/** Umbral mínimo de componentes para emitir score (si no, null). */
const MIN_COMPONENTS = 2;

// ── Tipos ─────────────────────────────────────────────────────────────
export interface DMScoreInput {
  /** 0-100, ya calibrado por edad. */
  scanIQ?: number | null;
  /** 0-100 (BPE). */
  decisionSpeed?: number | null;
  /** 0-100 (BPE clutchFactor). */
  pressureComposure?: number | null;
  /** 0-100 (video-intelligence `inteligenciaTactica` × 10). */
  tacticalAwareness?: number | null;
  /** Fuente por componente ("real" | "mock" | "bpe" | "video") — para confianza. */
  sources?: Partial<Record<DMComponentKey, string>>;
}

export interface DMScoreBreakdownItem {
  key: DMComponentKey;
  label: string;
  value: number;
  /** Peso efectivo tras renormalizar (0-1). */
  weight: number;
  source: string;
}

export interface DMScoreResult {
  /** 0-100, null si hay menos de MIN_COMPONENTS señales. */
  score: number | null;
  breakdown: DMScoreBreakdownItem[];
  missing: DMComponentKey[];
  /** 0-1: nº de componentes y calidad de fuentes (real > mock). */
  confidence: number;
  /** Narrativa ES lista para UI/PDF. */
  narrative: string;
  headline: string;
}

// ── Compositor ────────────────────────────────────────────────────────
export function computeDMScore(input: DMScoreInput): DMScoreResult {
  const sources = input.sources ?? {};
  const entries: Array<{ key: DMComponentKey; value: number }> = [];

  (Object.keys(DM_WEIGHTS) as DMComponentKey[]).forEach((key) => {
    const v = input[key];
    if (typeof v === "number" && isFinite(v)) {
      entries.push({ key, value: Math.max(0, Math.min(100, v)) });
    }
  });

  const missing = (Object.keys(DM_WEIGHTS) as DMComponentKey[]).filter(
    (k) => !entries.some((e) => e.key === k),
  );

  if (entries.length < MIN_COMPONENTS) {
    return {
      score: null,
      breakdown: [],
      missing,
      confidence: 0,
      headline: "Decision-Making Score no disponible",
      narrative:
        "Se necesitan al menos 2 señales cognitivas (Scan IQ, velocidad de decisión, temple o lectura táctica). Analiza un video o genera el perfil mental para activarlo.",
    };
  }

  // Renormalizar pesos sobre los componentes disponibles
  const totalWeight = entries.reduce((s, e) => s + DM_WEIGHTS[e.key], 0);
  const breakdown: DMScoreBreakdownItem[] = entries.map((e) => ({
    key: e.key,
    label: DM_COMPONENT_LABELS[e.key],
    value: Math.round(e.value),
    weight: Math.round((DM_WEIGHTS[e.key] / totalWeight) * 100) / 100,
    source: sources[e.key] ?? "desconocida",
  }));

  const score = Math.round(
    breakdown.reduce((s, b) => s + b.value * b.weight, 0),
  );

  // Confianza: base por cobertura de componentes + bonus por fuentes reales
  const coverage = entries.length / Object.keys(DM_WEIGHTS).length; // 0.5-1
  const realCount = breakdown.filter((b) => b.source === "real" || b.source === "video").length;
  const realBonus = (realCount / entries.length) * 0.25;
  const confidence = Math.round(Math.min(1, coverage * 0.75 + realBonus) * 100) / 100;

  // Narrativa
  const best = [...breakdown].sort((a, b) => b.value - a.value)[0];
  const worst = [...breakdown].sort((a, b) => a.value - b.value)[0];
  const level =
    score >= 80 ? "élite para su edad" :
    score >= 65 ? "por encima de la media" :
    score >= 45 ? "en desarrollo" : "área prioritaria de trabajo";

  const missingTxt = missing.length
    ? ` Faltan señales de: ${missing.map((m) => DM_COMPONENT_LABELS[m]).join(", ")} — el score se refinará al añadirlas.`
    : "";

  return {
    score,
    breakdown,
    missing,
    confidence,
    headline: `Decision-Making ${score}/100 · ${level}`,
    narrative:
      `Toma de decisiones ${level} (${score}/100). Su punto más fuerte es ${best.label.toLowerCase()} (${best.value}) y su mayor margen está en ${worst.label.toLowerCase()} (${worst.value}).` +
      ` Este score mide lo que los tests físicos aislados no ven: cómo procesa el juego real.${missingTxt}`,
  };
}
