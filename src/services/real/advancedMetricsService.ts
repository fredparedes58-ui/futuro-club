/**
 * VITAS Advanced Metrics Service
 *
 * Implementa todas las fórmulas avanzadas del sistema VITAS:
 *   — RAE  (Relative Age Effect)
 *   — UBI  (Unified Bias Index)
 *   — TruthFilter  (4 casos de corrección VSI)
 *   — VAEP / VAEP-90 (stub — requiere datos de eventos de partido)
 *   — DominantFeatures (del perfil de métricas actual)
 *   — SpeedMs, FieldCoverage, SprintCount (stubs — requieren datos GPS/tracking)
 *   — SPADL (stub — requiere stream de eventos)
 *   — BiomechanicsScore (stub — requiere datos cinemáticos)
 *
 * Las fórmulas marcadas como STUB devuelven `null` cuando no tienen
 * datos de entrada reales (tracking, GPS, eventos de partido).
 * Cuando se conecten los datos reales, solo hay que proveer el input correcto.
 */

import type { Player } from "./playerService";
import type { PlayerMetrics } from "./metricsService";
import type { MatchEvent, EventType, EventZone } from "./matchEventsService";
import type { FieldPosition } from "@/lib/yolo/types";

// ─── Tipos de entrada/salida ──────────────────────────────────────────────────

export interface RAEInput {
  /** Mes de nacimiento (1=enero … 12=diciembre) */
  birthMonth: number;
  /** Año de nacimiento */
  birthYear: number;
  /** Mes de corte de la competición (por defecto enero = 1) */
  cutoffMonth?: number;
}

export interface RAEResult {
  /** Cuartil de nacimiento (Q1=ene-mar … Q4=oct-dic con cutoff enero) */
  birthQuartile: 1 | 2 | 3 | 4;
  /** Ventaja relativa en meses vs. el nacido más tarde del mismo grupo */
  ageAdvantageMonths: number;
  /** Factor de sesgo RAE: 1.0 = sin sesgo; >1 = ventaja; <1 = desventaja */
  raeBiasFactor: number;
  /** Etiqueta semántica */
  label: "early_cohort" | "mid_cohort_early" | "mid_cohort_late" | "late_cohort";
}

export interface UBIResult {
  /** Índice unificado de sesgo (0-1, donde 1 = máximo sesgo combinado) */
  ubi: number;
  /** Componente RAE del sesgo (0-1) */
  raeComponent: number;
  /** Componente PHV del sesgo (0-1) */
  phvComponent: number;
  /** Factor de corrección sugerido para el VSI */
  vsICorrectionFactor: number;
  /** Descripción del sesgo */
  description: string;
}

export type TruthFilterCase = "early_maturers" | "late_maturers" | "ontme_high_rae" | "ontme_low_rae";

export interface TruthFilterResult {
  /** Caso de corrección aplicado */
  filterCase: TruthFilterCase;
  /** VSI original */
  originalVSI: number;
  /** VSI ajustado por sesgo */
  adjustedVSI: number;
  /** Delta de corrección */
  delta: number;
  /** Confianza del ajuste (0-1) */
  confidence: number;
  /** Explicación del ajuste */
  explanation: string;
}

export interface VAEPInput {
  /** Array de acciones SPADL (id, tipo, posX, posY, resultado) */
  actions: SPADLAction[];
  /** Minutos jugados en el partido/muestra */
  minutesPlayed: number;
}

export interface SPADLAction {
  actionId: string;
  type: "pass" | "dribble" | "shot" | "cross" | "tackle" | "interception" | "clearance" | "foul";
  startX: number;   // 0-105 (metros)
  startY: number;   // 0-68 (metros)
  endX: number;
  endY: number;
  result: "success" | "fail";
  /** Probabilidad de gol antes de la acción (xG chain) — requiere modelo externo */
  scoreProbBefore?: number;
  /** Probabilidad de gol después de la acción */
  scoreProbAfter?: number;
  /** Probabilidad de conceder gol antes */
  concedeProbBefore?: number;
  /** Probabilidad de conceder gol después */
  concedeProbAfter?: number;
}

export interface VAEPResult {
  /** Valor total generado en la muestra (suma de deltas) */
  vaepTotal: number | null;
  /** Valor generado por 90 minutos */
  vaep90: number | null;
  /** Acciones con mayor impacto positivo */
  topActions: Array<{ actionId: string; impact: number }>;
  /** Status del cálculo */
  status: "calculated" | "stub_no_data" | "insufficient_data";
  message: string;
}

export interface DominantFeaturesResult {
  /** Top 3 atributos más fuertes */
  dominant: Array<{ key: keyof PlayerMetrics; label: string; value: number; zScore: number }>;
  /** Top 2 áreas de mejora */
  underdeveloped: Array<{ key: keyof PlayerMetrics; label: string; value: number; gap: number }>;
  /** Perfil de juego inferido */
  playStyle: "ofensivo" | "defensivo" | "equilibrado" | "técnico" | "físico";
  /** Índice de especialización (0=generalista, 1=muy especializado) */
  specializationIndex: number;
}

export interface TrackingInput {
  /** Array de posiciones GPS (x, y) muestreadas a 25Hz o similar */
  positions: Array<{ x: number; y: number; timestampMs: number }>;
  minutesPlayed: number;
}

export interface TrackingMetricsResult {
  /** Velocidad máxima en m/s */
  maxSpeedMs: number | null;
  /** Velocidad media en m/s */
  avgSpeedMs: number | null;
  /** Distancia total cubierta en metros */
  totalDistanceM: number | null;
  /** Cobertura de campo como % del área total */
  fieldCoveragePct: number | null;
  /** Número de sprints (>6.5 m/s por más de 1s) */
  sprintCount: number | null;
  /** Distancia en sprint (metros) */
  sprintDistanceM: number | null;
  status: "calculated" | "stub_no_data";
  message: string;
}

export interface BiomechanicsInput {
  /** Ángulos articulares capturados por cámara/sensor */
  jointAngles?: Record<string, number[]>;
  /** Fuerza de impacto en cada zancada (Newton) */
  impactForces?: number[];
  /** Asimetría bilateral (%) */
  bilateralAsymmetry?: number;
}

export interface BiomechanicsResult {
  /** Puntuación de eficiencia biomecánica (0-100) */
  drillScore: number | null;
  /** Riesgo de lesión estimado (0-1) */
  injuryRisk: number | null;
  /** Asimetría detectada */
  asymmetryPct: number | null;
  status: "calculated" | "stub_no_data";
  message: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<keyof PlayerMetrics, string> = {
  speed:     "Velocidad",
  technique: "Técnica",
  vision:    "Visión",
  stamina:   "Resistencia",
  shooting:  "Disparo",
  defending: "Defensa",
};

// Media de referencia del grupo normativo VITAS (actualizar con datos reales)
const NORM_MEAN: PlayerMetrics = {
  speed: 60, technique: 58, vision: 55, stamina: 60, shooting: 52, defending: 56,
};
const NORM_SD: PlayerMetrics = {
  speed: 14, technique: 13, vision: 14, stamina: 13, shooting: 15, defending: 14,
};

// ─── RAE — Relative Age Effect ────────────────────────────────────────────────

export const RAEService = {
  /**
   * Calcula el efecto de edad relativa de un jugador.
   * El cutoff por defecto es enero (mes 1), estándar FIFA.
   *
   * Fórmula:
   *   ageAdvantageMonths = ((birthMonth - cutoffMonth + 12) % 12)
   *   => inverted: cuanto MENOR sea el resultado, más ventaja tiene el jugador
   *   Q1: 0-2 meses tras cutoff (mayor ventaja)
   *   Q4: 9-11 meses tras cutoff (menor ventaja)
   *
   * raeBiasFactor = 1 + (11 - ageAdvantage) * 0.02
   *   => Q1 ≈ 1.22, Q4 ≈ 1.00
   */
  calculate(input: RAEInput): RAEResult {
    const cutoff = input.cutoffMonth ?? 1;
    const relativeMonths = ((input.birthMonth - cutoff + 12) % 12);

    const birthQuartile: 1 | 2 | 3 | 4 =
      relativeMonths <= 2 ? 1 :
      relativeMonths <= 5 ? 2 :
      relativeMonths <= 8 ? 3 : 4;

    const label =
      birthQuartile === 1 ? "early_cohort" :
      birthQuartile === 2 ? "mid_cohort_early" :
      birthQuartile === 3 ? "mid_cohort_late" : "late_cohort";

    // Factor de sesgo: Q1 tiene más presión de selección artificial
    const raeBiasFactor = 1 + (11 - relativeMonths) * 0.02;

    return {
      birthQuartile,
      ageAdvantageMonths: relativeMonths,
      raeBiasFactor: Math.round(raeBiasFactor * 1000) / 1000,
      label,
    };
  },

  /**
   * Aplica corrección RAE al VSI:
   * Los jugadores Q4 (nacidos tarde) son estadísticamente subestimados.
   * Añade hasta +5 puntos VSI a Q4, resta hasta -2 a Q1.
   */
  correctVSI(vsi: number, rae: RAEResult): number {
    const correction =
      rae.birthQuartile === 1 ? -2 :
      rae.birthQuartile === 2 ? 0 :
      rae.birthQuartile === 3 ? +2 : +5;
    return Math.min(100, Math.max(0, Math.round((vsi + correction) * 10) / 10));
  },
};

// ─── UBI — Unified Bias Index ─────────────────────────────────────────────────

export const UBIService = {
  /**
   * Combina sesgo RAE y sesgo PHV en un índice único (0-1).
   *
   * Fórmula:
   *   raeComponent  = (birthQuartile - 1) / 3    → 0=Q1 (sin desventaja), 1=Q4
   *   phvComponent  = clamp(phvOffset / -2, 0, 1) → 0=ontme, 1=late (-2 años)
   *   UBI = 0.55 * raeComponent + 0.45 * phvComponent
   *
   *   vsICorrectionFactor = 1 + UBI * 0.12  (hasta +12% sobre el VSI)
   */
  calculate(
    raeResult: RAEResult | null,
    phvOffset: number | null,
    phvCategory: "early" | "ontme" | "late" | null
  ): UBIResult {
    const raeComp = raeResult ? (raeResult.birthQuartile - 1) / 3 : 0;

    // Sesgo PHV: late maturers (offset muy negativo) son más penalizados
    let phvComp = 0;
    if (phvOffset !== null && phvCategory !== null) {
      if (phvCategory === "late") {
        // offset negativo grande → más sesgo
        phvComp = Math.min(1, Math.max(0, -phvOffset / 2));
      } else if (phvCategory === "early") {
        // early maturers también sufren sesgo inverso (sobreestimados ahora, riesgo futuro)
        phvComp = Math.min(0.5, Math.max(0, phvOffset / 2));
      }
    }

    const ubi = Math.round((0.55 * raeComp + 0.45 * phvComp) * 1000) / 1000;
    const vsICorrectionFactor = Math.round((1 + ubi * 0.12) * 1000) / 1000;

    const description =
      ubi >= 0.7 ? "Sesgo alto — jugador probablemente subestimado. Prioridad de seguimiento." :
      ubi >= 0.4 ? "Sesgo moderado — tener en cuenta al evaluar el VSI." :
      ubi >= 0.2 ? "Sesgo leve — impacto pequeño en la valoración." :
                   "Sin sesgo significativo detectado.";

    return {
      ubi,
      raeComponent: Math.round(raeComp * 1000) / 1000,
      phvComponent: Math.round(phvComp * 1000) / 1000,
      vsICorrectionFactor,
      description,
    };
  },
};

// ─── TruthFilter — 4 casos de corrección VSI ─────────────────────────────────

export const TruthFilterService = {
  /**
   * Determina el caso TruthFilter según la combinación PHV + RAE.
   *
   * Caso 1 — early_maturers:
   *   phvOffset > +0.5 → jugador maduro anticipado.
   *   Corrección: -3 a -8 puntos VSI (sobreestimado por ventaja física).
   *
   * Caso 2 — late_maturers:
   *   phvOffset < -0.5 → jugador en maduración tardía.
   *   Corrección: +3 a +10 puntos VSI (subestimado por desventaja física).
   *
   * Caso 3 — ontme_high_rae (nacido Q1/Q2, maduración normal):
   *   Corrección: -1 a -3 puntos VSI (ligera ventaja por RAE).
   *
   * Caso 4 — ontme_low_rae (nacido Q3/Q4, maduración normal):
   *   Corrección: +1 a +4 puntos VSI (ligera desventaja por RAE).
   */
  detectCase(
    phvOffset: number | null,
    phvCategory: "early" | "ontme" | "late" | null,
    raeResult: RAEResult | null
  ): TruthFilterCase {
    if (phvCategory === "early" || (phvOffset !== null && phvOffset > 0.5)) {
      return "early_maturers";
    }
    if (phvCategory === "late" || (phvOffset !== null && phvOffset < -0.5)) {
      return "late_maturers";
    }
    if (raeResult && raeResult.birthQuartile <= 2) {
      return "ontme_high_rae";
    }
    return "ontme_low_rae";
  },

  apply(
    vsi: number,
    phvOffset: number | null,
    phvCategory: "early" | "ontme" | "late" | null,
    raeResult: RAEResult | null
  ): TruthFilterResult {
    const filterCase = TruthFilterService.detectCase(phvOffset, phvCategory, raeResult);

    let delta = 0;
    let confidence = 0.7;
    let explanation = "";

    switch (filterCase) {
      case "early_maturers": {
        // Magnitud proporcional al offset: más adelantado → mayor corrección
        const magnitude = phvOffset !== null ? Math.min(8, Math.round(phvOffset * 4)) : 3;
        delta = -magnitude;
        confidence = phvOffset !== null ? 0.85 : 0.60;
        explanation = `Madurador temprano (PHV offset +${phvOffset?.toFixed(1) ?? "?"} años). `
          + `El VSI puede estar inflado por ventaja física transitoria. `
          + `Corrección: ${delta} puntos para reflejar potencial real a largo plazo.`;
        break;
      }
      case "late_maturers": {
        const magnitude = phvOffset !== null ? Math.min(10, Math.round(Math.abs(phvOffset) * 4)) : 4;
        delta = +magnitude;
        confidence = phvOffset !== null ? 0.88 : 0.65;
        explanation = `Madurador tardío (PHV offset ${phvOffset?.toFixed(1) ?? "?"} años). `
          + `El VSI subestima el potencial real del jugador. `
          + `Corrección: +${delta} puntos para compensar desventaja física temporal.`;
        break;
      }
      case "ontme_high_rae": {
        const magnitude = raeResult ? (raeResult.birthQuartile === 1 ? 3 : 1) : 1;
        delta = -magnitude;
        confidence = 0.70;
        explanation = `Maduración normal (ontme) pero nacido en Q${raeResult?.birthQuartile ?? "?"} `
          + `(ventaja RAE moderada). Pequeña corrección a la baja sobre el VSI.`;
        break;
      }
      case "ontme_low_rae": {
        const magnitude = raeResult ? (raeResult.birthQuartile === 4 ? 4 : 1) : 1;
        delta = +magnitude;
        confidence = 0.72;
        explanation = `Maduración normal (ontme) pero nacido en Q${raeResult?.birthQuartile ?? "?"} `
          + `(desventaja RAE). Pequeña corrección al alza sobre el VSI.`;
        break;
      }
    }

    const adjustedVSI = Math.min(100, Math.max(0, Math.round((vsi + delta) * 10) / 10));

    return {
      filterCase,
      originalVSI: vsi,
      adjustedVSI,
      delta,
      confidence,
      explanation,
    };
  },
};

// ─── VAEP — Valuing Actions by Estimating Probabilities ──────────────────────

export const VAEPService = {
  /**
   * Calcula el VAEP de cada acción si se dispone de probabilidades xG.
   *
   * Fórmula (Decroos et al., 2019):
   *   VAEP(a) = [P(gol_after) - P(gol_before)] - [P(concede_after) - P(concede_before)]
   *
   * STUB: Si las acciones no tienen scoreProbBefore/After, devuelve status="stub_no_data".
   * Para activar: conectar un modelo xG (p.ej. StatsBomb open data) que rellene
   * las probabilidades en cada SPADLAction.
   */
  calculate(input: VAEPInput): VAEPResult {
    if (!input.actions.length) {
      return {
        vaepTotal: null,
        vaep90: null,
        topActions: [],
        status: "stub_no_data",
        message: "STUB: Se necesitan eventos de partido con probabilidades xG por acción. "
          + "Conectar modelo de valoración de acciones (VAEP/StatsBomb/Wyscout).",
      };
    }

    const hasProbs = input.actions.every(
      (a) => a.scoreProbBefore !== undefined && a.scoreProbAfter !== undefined
        && a.concedeProbBefore !== undefined && a.concedeProbAfter !== undefined
    );

    if (!hasProbs) {
      return {
        vaepTotal: null,
        vaep90: null,
        topActions: [],
        status: "stub_no_data",
        message: "STUB: Acciones detectadas pero sin probabilidades de gol/concesión. "
          + "Proveer scoreProbBefore/After y concedeProbBefore/After en cada SPADLAction.",
      };
    }

    // Cálculo real cuando haya probabilidades
    let total = 0;
    const impacts: Array<{ actionId: string; impact: number }> = [];

    for (const action of input.actions) {
      const scoreGain   = (action.scoreProbAfter!  - action.scoreProbBefore!);
      const concedeGain = (action.concedeProbAfter! - action.concedeProbBefore!);
      const vaep = scoreGain - concedeGain;
      total += vaep;
      impacts.push({ actionId: action.actionId, impact: Math.round(vaep * 1000) / 1000 });
    }

    impacts.sort((a, b) => b.impact - a.impact);
    const vaep90 = input.minutesPlayed > 0
      ? Math.round((total / input.minutesPlayed * 90) * 1000) / 1000
      : null;

    return {
      vaepTotal: Math.round(total * 1000) / 1000,
      vaep90,
      topActions: impacts.slice(0, 5),
      status: "calculated",
      message: `VAEP calculado sobre ${input.actions.length} acciones.`,
    };
  },

  /**
   * Calcula VAEP real desde eventos logueados manualmente por el entrenador.
   * Usa pesos simplificados por tipo de acción y zona del campo.
   */
  calculateFromEvents(events: MatchEvent[], minutesPlayed: number): VAEPResult {
    if (!events.length) {
      return {
        vaepTotal: null,
        vaep90:    null,
        topActions: [],
        status:  "insufficient_data",
        message: "Sin eventos registrados. Usa '+ LOG' para registrar acciones de partido.",
      };
    }

    // Pesos por acción (zona-aware donde aplica)
    type EventKey = `${EventType}_${"success" | "fail"}`;
    type ZoneKey  = EventZone | "default";
    const W: Record<EventKey, number | Record<ZoneKey, number>> = {
      "shot_success":     0.15,
      "shot_fail":       -0.03,
      "pass_success":    { offensive: 0.03, middle: 0.01, defensive: 0.005, default: 0.01 },
      "pass_fail":       -0.015,
      "dribble_success":  0.06,
      "dribble_fail":    -0.02,
      "tackle_success":   0.04,
      "tackle_fail":     -0.015,
      "press_success":    0.025,
      "press_fail":      -0.005,
      "cross_success":    0.08,
      "cross_fail":      -0.02,
      "header_success":   0.05,
      "header_fail":     -0.01,
    };

    const resolveW = (type: EventType, result: "success" | "fail", zone?: EventZone): number => {
      const key = `${type}_${result}` as EventKey;
      const entry = W[key];
      if (typeof entry === "number") return entry;
      return zone ? (entry[zone] ?? entry["default"]) : entry["default"];
    };

    let total = 0;
    const impacts: Array<{ actionId: string; impact: number }> = [];

    for (const evt of events) {
      const impact = resolveW(evt.type, evt.result, evt.xZone);
      total += impact;
      impacts.push({ actionId: evt.id, impact: Math.round(impact * 1000) / 1000 });
    }

    impacts.sort((a, b) => b.impact - a.impact);

    const vaep90 = minutesPlayed > 0
      ? Math.round((total / minutesPlayed) * 90 * 1000) / 1000
      : null;

    return {
      vaepTotal:  Math.round(total * 1000) / 1000,
      vaep90,
      topActions: impacts.slice(0, 5),
      status:     "calculated",
      message:    `VAEP calculado desde ${events.length} evento(s) registrados manualmente.`,
    };
  },

  /**
   * Genera stubs vacíos para la UI mientras no haya datos reales.
   */
  getStub(minutesPlayed: number): VAEPResult {
    return {
      vaepTotal: null,
      vaep90: null,
      topActions: [],
      status: "stub_no_data",
      message: `STUB — ${minutesPlayed} min jugados registrados. `
        + "En espera de integración con proveedor de datos de eventos (StatsBomb / Wyscout / InStat).",
    };
  },
};

// ─── Dominant Features — desde métricas actuales ─────────────────────────────

export const DominantFeaturesService = {
  /**
   * Infiere las características dominantes del jugador a partir de sus métricas.
   * Usa z-scores sobre normas del grupo para identificar outliers positivos y negativos.
   *
   * No requiere datos externos — funciona con los métricas ya disponibles.
   */
  calculate(metrics: PlayerMetrics): DominantFeaturesResult {
    const keys = Object.keys(metrics) as (keyof PlayerMetrics)[];

    // Z-scores
    const zScores = keys.map((k) => ({
      key: k,
      label: METRIC_LABELS[k],
      value: metrics[k],
      zScore: (metrics[k] - NORM_MEAN[k]) / NORM_SD[k],
    }));

    zScores.sort((a, b) => b.zScore - a.zScore);

    const dominant   = zScores.slice(0, 3);
    const underdeveloped = zScores.slice(-2).map((item) => ({
      ...item,
      gap: Math.round((NORM_MEAN[item.key] - item.value) * 10) / 10,
    }));

    // Clasificar estilo de juego
    const offensiveAvg = (metrics.technique + metrics.vision + metrics.shooting) / 3;
    const defensiveAvg = (metrics.defending + metrics.stamina) / 2;
    const physicalAvg  = (metrics.speed + metrics.stamina) / 2;

    let playStyle: DominantFeaturesResult["playStyle"];
    if (offensiveAvg > 72 && offensiveAvg > defensiveAvg + 10) playStyle = "ofensivo";
    else if (defensiveAvg > 72 && defensiveAvg > offensiveAvg + 10) playStyle = "defensivo";
    else if (metrics.technique > 72 && metrics.vision > 68) playStyle = "técnico";
    else if (physicalAvg > 72) playStyle = "físico";
    else playStyle = "equilibrado";

    // Índice de especialización: varianza normalizada de los z-scores
    const meanZ = zScores.reduce((s, z) => s + z.zScore, 0) / zScores.length;
    const variance = zScores.reduce((s, z) => s + Math.pow(z.zScore - meanZ, 2), 0) / zScores.length;
    const specializationIndex = Math.min(1, Math.round(Math.sqrt(variance) / 2 * 100) / 100);

    return {
      dominant,
      underdeveloped,
      playStyle,
      specializationIndex,
    };
  },
};

// ─── Tracking Metrics — GPS / Positional Data ────────────────────────────────

export const TrackingService = {
  /**
   * Calcula métricas de tracking desde datos GPS.
   *
   * STUB: Sin datos GPS, devuelve null en todos los campos.
   * Para activar: proveer array positions[] con x, y, timestampMs
   * capturado desde dispositivo GPS (Catapult, STATSports, etc.) o
   * desde video tracking (Roboflow Keypoints).
   */
  calculate(input: TrackingInput | null): TrackingMetricsResult {
    if (!input || !input.positions.length) {
      return {
        maxSpeedMs: null,
        avgSpeedMs: null,
        totalDistanceM: null,
        fieldCoveragePct: null,
        sprintCount: null,
        sprintDistanceM: null,
        status: "stub_no_data",
        message: "STUB: En espera de datos de tracking GPS o video-tracking por keypoints. "
          + "Conectar Roboflow Pose Estimation o dispositivo GPS para activar.",
      };
    }

    const { positions, minutesPlayed } = input;
    if (positions.length < 2) {
      return {
        maxSpeedMs: null, avgSpeedMs: null, totalDistanceM: null,
        fieldCoveragePct: null, sprintCount: null, sprintDistanceM: null,
        status: "stub_no_data",
        message: "Datos insuficientes — se necesitan al menos 2 puntos GPS.",
      };
    }

    // Calcular distancias y velocidades
    let totalDist = 0;
    let maxSpeed = 0;
    let sprintCount = 0;
    let sprintDist = 0;
    const speeds: number[] = [];
    const SPRINT_THRESHOLD_MS = 6.5;
    const SPRINT_MIN_DURATION_MS = 1000; // 1 segundo mínimo
    let currentSprintMs = 0;
    let currentSprintDist = 0;
    let inSprint = false;

    for (let i = 1; i < positions.length; i++) {
      const dt = (positions[i].timestampMs - positions[i-1].timestampMs) / 1000; // segundos
      if (dt <= 0) continue;

      const dx = positions[i].x - positions[i-1].x;
      const dy = positions[i].y - positions[i-1].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const speed = dist / dt; // m/s

      totalDist += dist;
      speeds.push(speed);
      if (speed > maxSpeed) maxSpeed = speed;

      // Detección de sprints
      if (speed >= SPRINT_THRESHOLD_MS) {
        if (!inSprint) inSprint = true;
        currentSprintMs += dt * 1000;
        currentSprintDist += dist;
      } else if (inSprint) {
        if (currentSprintMs >= SPRINT_MIN_DURATION_MS) {
          sprintCount++;
          sprintDist += currentSprintDist;
        }
        inSprint = false;
        currentSprintMs = 0;
        currentSprintDist = 0;
      }
    }
    // Cerrar sprint activo al final
    if (inSprint && currentSprintMs >= SPRINT_MIN_DURATION_MS) {
      sprintCount++;
      sprintDist += currentSprintDist;
    }

    const avgSpeed = speeds.length
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length
      : 0;

    // Campo de fútbol 11: 105m x 68m = 7140 m²
    // Dividir en cuadrícula 5x5 metros → 21x13 = 273 celdas
    const CELL = 5;
    const COLS = Math.ceil(105 / CELL);
    const ROWS = Math.ceil(68 / CELL);
    const visited = new Set<number>();
    for (const p of positions) {
      const col = Math.floor(Math.min(p.x, 104.9) / CELL);
      const row = Math.floor(Math.min(p.y, 67.9) / CELL);
      visited.add(col * ROWS + row);
    }
    const fieldCoveragePct = Math.round((visited.size / (COLS * ROWS)) * 100 * 10) / 10;

    return {
      maxSpeedMs: Math.round(maxSpeed * 100) / 100,
      avgSpeedMs: Math.round(avgSpeed * 100) / 100,
      totalDistanceM: Math.round(totalDist),
      fieldCoveragePct,
      sprintCount,
      sprintDistanceM: Math.round(sprintDist),
      status: "calculated",
      message: `Tracking calculado desde ${positions.length} muestras GPS (${minutesPlayed} min).`,
    };
  },

  /**
   * Convierte posiciones de YOLO tracking (FieldPosition[]) al formato TrackingInput.
   * Esto permite alimentar el cálculo GPS-like con datos del tracker de video.
   *
   * @param positions — Historial de posiciones del YOLO tracker (fx, fy en metros)
   * @param minutesPlayed — Duración del tracking en minutos
   */
  fromYoloPositions(positions: FieldPosition[], minutesPlayed: number): TrackingInput {
    return {
      positions: positions.map(p => ({
        x: p.fx,
        y: p.fy,
        timestampMs: p.timestampMs,
      })),
      minutesPlayed,
    };
  },
};

// ─── Biomechanics / Drill Score ───────────────────────────────────────────────

export const BiomechanicsService = {
  /**
   * Calcula la puntuación biomecánica de un ejercicio.
   *
   * STUB: Sin datos cinemáticos (cámara calibrada o sensores IMU), devuelve null.
   * Para activar: conectar Roboflow Pose Estimation (17 keypoints COCO) y
   * calcular ángulos articulares de cadera, rodilla y tobillo.
   */
  calculate(input: BiomechanicsInput | null): BiomechanicsResult {
    if (!input || (!input.jointAngles && !input.impactForces && input.bilateralAsymmetry === undefined)) {
      return {
        drillScore: null,
        injuryRisk: null,
        asymmetryPct: null,
        status: "stub_no_data",
        message: "STUB: En espera de datos cinemáticos. "
          + "Conectar Roboflow Pose Estimation para obtener ángulos articulares "
          + "y calcular DrillScore biomecánico.",
      };
    }

    const asymmetry = input.bilateralAsymmetry ?? 0;
    const injuryRisk = Math.min(1, Math.round(asymmetry / 100 * 2 * 100) / 100);

    let drillScore = 75; // baseline
    if (asymmetry < 5)  drillScore = 90;
    else if (asymmetry < 10) drillScore = 80;
    else if (asymmetry < 20) drillScore = 65;
    else drillScore = 50;

    return {
      drillScore,
      injuryRisk,
      asymmetryPct: asymmetry,
      status: "calculated",
      message: `DrillScore calculado. Asimetría bilateral: ${asymmetry.toFixed(1)}%.`,
    };
  },
};

// ─── Facade: calcular todas las métricas avanzadas de un jugador ──────────────

export interface AdvancedPlayerMetrics {
  rae:           RAEResult | null;
  ubi:           UBIResult;
  truthFilter:   TruthFilterResult;
  dominantFeatures: DominantFeaturesResult;
  vaep:          VAEPResult;
  tracking:      TrackingMetricsResult;
  biomechanics:  BiomechanicsResult;
  /** VSI final tras aplicar TruthFilter */
  adjustedVSI:   number;
}

export function calculateAdvancedMetrics(
  player: Player,
  options?: {
    birthMonth?: number;
    birthYear?: number;
    trackingInput?: TrackingInput;
    vaepInput?: VAEPInput;
    biomechanicsInput?: BiomechanicsInput;
  }
): AdvancedPlayerMetrics {
  // RAE
  const rae = (options?.birthMonth && options?.birthYear)
    ? RAEService.calculate({ birthMonth: options.birthMonth, birthYear: options.birthYear })
    : null;

  // UBI
  const ubi = UBIService.calculate(rae, player.phvOffset ?? null, player.phvCategory ?? null);

  // TruthFilter
  const truthFilter = TruthFilterService.apply(
    player.vsi,
    player.phvOffset ?? null,
    player.phvCategory ?? null,
    rae
  );

  // Dominant Features (funciona con datos existentes)
  const dominantFeatures = DominantFeaturesService.calculate(player.metrics);

  // VAEP stub
  const vaep = options?.vaepInput
    ? VAEPService.calculate(options.vaepInput)
    : VAEPService.getStub(player.minutesPlayed);

  // Tracking stub
  const tracking = TrackingService.calculate(options?.trackingInput ?? null);

  // Biomechanics stub
  const biomechanics = BiomechanicsService.calculate(options?.biomechanicsInput ?? null);

  return {
    rae,
    ubi,
    truthFilter,
    dominantFeatures,
    vaep,
    tracking,
    biomechanics,
    adjustedVSI: truthFilter.adjustedVSI,
  };
}
