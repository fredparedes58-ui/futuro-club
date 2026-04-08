/**
 * VITAS · KPI Projections & Monthly Challenges
 *
 * Calcula KPIs avanzados y genera retos mensuales adaptados por edad.
 */

import {
  developmentFactor,
  developmentFactorAvg,
  estimateAtAge,
  inverseAge,
  ageConfidence,
  phvAdjustment,
  getHorizonMonths,
  getDevelopmentWindow,
  type MetricName,
} from "@/data/developmentCurves";
import { getPositionGroup } from "@/data/proPlayers";
import type { VSIMetrics } from "@/services/real/similarityService";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface KPIReport {
  /** % del peak estimado para cada métrica */
  pctOfPeak: Record<string, number>;
  /** % promedio del peak (todas las métricas) */
  avgPctOfPeak: number;
  /** VSI proyectado a los 18 y 21 años con rangos de confianza */
  projectedVSI: {
    at18: { estimate: number; low: number; high: number };
    at21: { estimate: number; low: number; high: number };
  };
  /** Ventaja/desventaja madurativa en puntos */
  maturationAdvantage: number;
  /** Edad equivalente profesional (ej: "nivel de un pro de 15.3 años") */
  ageEquivalentPro: number;
  /** Nivel de confianza global (0-1) */
  confidence: number;
  /** Disclaimer si aplica */
  disclaimer?: string;
}

export interface MonthlyChallenge {
  month: number;
  title: string;
  metric: string;
  description: string;
  kpiTarget: string;
  drillSuggestion: string;
}

export interface ChallengesPlan {
  horizonMonths: number;
  challenges: MonthlyChallenge[];
  focusAreas: string[];
  ageGroup: string;
}

// ─── Mapping VSI → EA ──────────────────────────────────────────────────────

const VSI_TO_EA: Record<string, MetricName> = {
  speed: "pace",
  shooting: "shooting",
  vision: "passing",
  technique: "dribbling",
  defending: "defending",
  stamina: "physic",
};

const VSI_LABELS: Record<string, string> = {
  speed: "Velocidad",
  shooting: "Tiro",
  vision: "Visión",
  technique: "Técnica",
  defending: "Defensa",
  stamina: "Resistencia",
};

// ─── KPI: % del Peak ───────────────────────────────────────────────────────

/**
 * Calcula qué porcentaje del peak estimado tiene el jugador en cada métrica.
 * Un 14 años con 52 de speed, si peak estimado es ~85, está al 61% del peak.
 */
export function computeKPIs(
  metrics: VSIMetrics,
  age: number,
  position: string,
  phvOffset = 0
): KPIReport {
  const posGroup = getPositionGroup(position);
  const phvFactor = phvAdjustment(age, phvOffset);
  const { confidence, disclaimer } = ageConfidence(age);

  // % del peak por métrica
  const pctOfPeak: Record<string, number> = {};
  let totalPct = 0;

  for (const [vsiKey, eaMetric] of Object.entries(VSI_TO_EA)) {
    const currentVal = metrics[vsiKey as keyof VSIMetrics] ?? 0;
    const factor = developmentFactor(age, posGroup, eaMetric);

    // Si está al X% de desarrollo y tiene valor Y, su peak estimado es Y/factor
    // Su % del peak es: factor (lo que ya debería tener a esta edad)
    // Pero ajustamos: si su valor real es mayor que el esperado, está adelantado
    const expectedFactor = factor * phvFactor;
    const estimatedPeak = expectedFactor > 0 ? currentVal / expectedFactor : currentVal;
    const pct = estimatedPeak > 0 ? Math.min(1.2, currentVal / estimatedPeak) : 0;

    // Más simple: su % del peak = currentVal / (estimatedPeak a edad de peak)
    // Pero estimatedPeak puede ser irreal. Usamos el factor directo.
    pctOfPeak[vsiKey] = Math.round(expectedFactor * 100);
    totalPct += expectedFactor;
  }

  const avgPctOfPeak = Math.round((totalPct / 6) * 100);

  // Proyección VSI a 18 y 21
  const currentVSI = ((metrics.speed ?? 0) + (metrics.shooting ?? 0) + (metrics.vision ?? 0) +
                      (metrics.technique ?? 0) + (metrics.defending ?? 0) + (metrics.stamina ?? 0)) / 6;

  const currentFactor = developmentFactorAvg(age, posGroup);
  const factor18 = developmentFactorAvg(18, posGroup);
  const factor21 = developmentFactorAvg(21, posGroup);

  const growthTo18 = currentFactor > 0 ? factor18 / currentFactor : 1;
  const growthTo21 = currentFactor > 0 ? factor21 / currentFactor : 1;

  const projected18 = Math.round(currentVSI * growthTo18);
  const projected21 = Math.round(currentVSI * growthTo21);

  // Rangos de confianza: ±15% para menores de 14, ±10% para 14-17, ±5% adultos
  const marginPct = age <= 13 ? 0.20 : age <= 16 ? 0.15 : 0.10;

  const projectedVSI = {
    at18: {
      estimate: Math.min(99, projected18),
      low: Math.max(1, Math.round(projected18 * (1 - marginPct))),
      high: Math.min(99, Math.round(projected18 * (1 + marginPct))),
    },
    at21: {
      estimate: Math.min(99, projected21),
      low: Math.max(1, Math.round(projected21 * (1 - marginPct))),
      high: Math.min(99, Math.round(projected21 * (1 + marginPct))),
    },
  };

  // Ventaja madurativa: diferencia entre factor PHV-ajustado y normal
  const normalFactor = developmentFactorAvg(age, posGroup);
  const adjustedFactor = normalFactor * phvFactor;
  const maturationAdvantage = Math.round((adjustedFactor - normalFactor) * 100);

  // Edad equivalente profesional: ¿a qué edad un pro típico tenía este nivel?
  const avgMetric: MetricName = "passing"; // usar passing como proxy más estable
  const visionVal = metrics.vision;
  const ageEquivalentPro = Math.round(inverseAge(visionVal, posGroup, avgMetric) * 10) / 10;

  return {
    pctOfPeak,
    avgPctOfPeak,
    projectedVSI,
    maturationAdvantage,
    ageEquivalentPro,
    confidence,
    disclaimer,
  };
}

// ─── Monthly Challenges ─────────────────────────────────────────────────────

const DRILL_LIBRARY: Record<MetricName, Array<{ title: string; desc: string; kpi: string; drill: string }>> = {
  pace: [
    { title: "Sprint explosivo", desc: "Mejorar aceleración en los primeros 5 metros", kpi: "Reducir tiempo 10m en 0.1s", drill: "Series de 5×10m con salida reactiva" },
    { title: "Velocidad con balón", desc: "Mantener velocidad máxima conduciendo", kpi: "Recorrer 30m en <5s con balón", drill: "Carreras de 30m conducción vs sprint libre" },
    { title: "Cambio de ritmo", desc: "Acelerar/frenar en espacios cortos", kpi: "Test T-drill: mejorar 0.3s", drill: "Circuitos de agilidad con cambios de dirección" },
  ],
  shooting: [
    { title: "Definición a portería", desc: "Mejorar precisión de disparo desde fuera del área", kpi: "6/10 disparos al marco desde 20m", drill: "3 series de 10 tiros desde diferentes ángulos" },
    { title: "Remate de primera", desc: "Disparar sin parar con ambos perfiles", kpi: "4/10 remates de primera al arco", drill: "Centros laterales + remate directo x20" },
    { title: "Disparo bajo presión", desc: "Mantener precisión con defensor encima", kpi: "5/10 goles en 1v1 con portero", drill: "Circuitos de regate + disparo con oposición" },
  ],
  passing: [
    { title: "Pase filtrado", desc: "Encontrar líneas de pase entre defensores", kpi: "3 pases filtrados exitosos por partido", drill: "Rondos 4v2 con pase al jugador central" },
    { title: "Visión periférica", desc: "Leer el campo antes de recibir", kpi: "Orientar el cuerpo antes del control en 80% de recepciones", drill: "Juegos de posición con regla de 2 toques máx" },
    { title: "Cambio de orientación", desc: "Pases largos que cambien el juego", kpi: "2 cambios de orientación precisos por partido", drill: "Ejercicio de pases largos cruzados 40m" },
  ],
  dribbling: [
    { title: "1v1 ofensivo", desc: "Superar rival en duelo individual", kpi: "60% de regates exitosos en 1v1", drill: "Duelos 1v1 en carril de 5m con portería" },
    { title: "Control bajo presión", desc: "Proteger balón con rival encima", kpi: "Mantener posesión 5s con presión en 3x3", drill: "Posesión 3v3 en espacio reducido (8x8m)" },
    { title: "Conducción en velocidad", desc: "Driblar a máxima velocidad manteniendo control", kpi: "Completar slalom 20m en <6s", drill: "Slalom con conos a 2m + sprint final" },
  ],
  defending: [
    { title: "Posicionamiento defensivo", desc: "Estar en el lugar correcto antes de que llegue el balón", kpi: "Reducir goles recibidos en ejercicio 4v4", drill: "Partidos 4v4 con énfasis en línea defensiva" },
    { title: "Duelo 1v1 defensivo", desc: "Ganar duelos directos sin hacer falta", kpi: "70% duelos ganados limpiamente", drill: "Ejercicios 1v1 defensivos en zona lateral" },
    { title: "Anticipación", desc: "Leer la jugada y cortar pases", kpi: "2 intercepciones por partido", drill: "Ejercicio de lectura de pase con 3 atacantes vs 2 defensores" },
  ],
  physic: [
    { title: "Resistencia aeróbica", desc: "Mantener intensidad los 90 minutos", kpi: "Completar test de Cooper +200m", drill: "Circuitos intermitentes 15s trabajo / 15s descanso x4 series" },
    { title: "Fuerza de core", desc: "Estabilidad en duelos y cambios de dirección", kpi: "Plancha frontal 90s + lateral 45s cada lado", drill: "Rutina de core 3x/semana: plancha, puente, bird-dog" },
    { title: "Potencia de salto", desc: "Mejorar salto vertical para duelos aéreos", kpi: "Mejorar salto vertical 3cm", drill: "Pliometría: box jumps, saltos al cajón, sentadillas explosivas" },
  ],
};

/**
 * Genera un plan de retos mensuales adaptado a la edad y métricas del jugador.
 */
export function generateMonthlyChallenges(
  metrics: VSIMetrics,
  age: number,
  position: string,
): ChallengesPlan {
  const horizonMonths = getHorizonMonths(age);
  const developmentWindows = getDevelopmentWindow(age);
  const posGroup = getPositionGroup(position);

  // Identificar las 3 métricas más débiles (mayor margen de mejora)
  const metricScores = Object.entries(VSI_TO_EA).map(([vsiKey, eaMetric]) => ({
    vsiKey,
    eaMetric,
    value: metrics[vsiKey as keyof VSIMetrics],
    inWindow: developmentWindows.includes(eaMetric),
  }));

  // Priorizar: métricas en ventana de desarrollo + más débiles
  metricScores.sort((a, b) => {
    // Primero las que están en ventana de desarrollo
    if (a.inWindow && !b.inWindow) return -1;
    if (!a.inWindow && b.inWindow) return 1;
    // Luego las más débiles
    return a.value - b.value;
  });

  const focusMetrics = metricScores.slice(0, 3);
  const challenges: MonthlyChallenge[] = [];

  for (let month = 1; month <= horizonMonths; month++) {
    // Rotar entre las 3 métricas foco
    const focusIdx = (month - 1) % focusMetrics.length;
    const focus = focusMetrics[focusIdx];
    const drillOptions = DRILL_LIBRARY[focus.eaMetric];
    const drillIdx = Math.floor((month - 1) / focusMetrics.length) % drillOptions.length;
    const drill = drillOptions[drillIdx];

    challenges.push({
      month,
      title: drill.title,
      metric: VSI_LABELS[focus.vsiKey] || focus.vsiKey,
      description: drill.desc,
      kpiTarget: drill.kpi,
      drillSuggestion: drill.drill,
    });
  }

  const ageGroup = age <= 10 ? "Pre-infantil (8-10)"
    : age <= 13 ? "Infantil (11-13)"
    : age <= 16 ? "Cadete (14-16)"
    : "Juvenil (17+)";

  return {
    horizonMonths,
    challenges,
    focusAreas: focusMetrics.map(f => VSI_LABELS[f.vsiKey]),
    ageGroup,
  };
}
