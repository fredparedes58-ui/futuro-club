/**
 * VITAS · Scan IQ — el scanning como producto (Sprint 1.2)
 *
 * Eleva el scanning de "métrica interna" a producto con nombre propio:
 *   - Scan IQ 0-100 calibrado por EDAD (percentil dentro de su banda)
 *   - Edad-equivalente: "escanea como un jugador de ~16 años"
 *   - Narrativa en español lista para UI/PDF
 *
 * Diferencia vs el scanIQ crudo del detector (25 + avgScans×22, sin edad):
 * aquí un Sub-12 con 1.5 scans/recepción puntúa ~90 (excepcional para su
 * edad) mientras el mismo valor en un Sub-18 puntúa ~15. Eso es lo que
 * ningún competidor hace — aiScout compara contra edad cronológica plana.
 *
 * Base científica: Geir Jordet (Premier League) — los que llegaron a pro
 * escaneaban 2x más a los 12-14 años. Indicador más temprano de élite.
 */

import { SCAN_BENCHMARKS, scanBandForAge, type AgeBandBenchmark } from "./benchmarks";

export interface ScanIQResult {
  /** Score 0-100 calibrado por edad (≈ percentil dentro de su banda). */
  scanIQ: number;
  /** Percentil dentro de su banda de edad (0-99). */
  percentile: number;
  /** Banda de edad usada para calibrar. */
  ageBand: string;
  /** Edad "equivalente" según su frecuencia de escaneo. */
  ageEquivalent: number;
  /** Diferencia vs su edad real (+2 = escanea como uno 2 años mayor). */
  ageDelta: number;
  /** Scans por recepción usados en el cálculo. */
  avgScansPreReception: number;
  /** Narrativa en español lista para mostrar. */
  narrative: string;
  /** Frase corta para badges/cards. */
  headline: string;
}

/**
 * Interpolación lineal por tramos sobre los percentiles de la banda:
 *   0→p25 mapea a 5→25 · p25→p50 a 25→50 · p50→p75 a 50→75 ·
 *   p75→p95 a 75→95 · >p95 satura hacia 99.
 */
function percentileWithinBand(avgScans: number, band: AgeBandBenchmark): number {
  const { p25, p50, p75, p95 } = band;
  const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
    y0 + ((x - x0) / Math.max(1e-6, x1 - x0)) * (y1 - y0);

  let pct: number;
  if (avgScans <= 0) pct = 5;
  else if (avgScans < p25) pct = lerp(avgScans, 0, p25, 5, 25);
  else if (avgScans < p50) pct = lerp(avgScans, p25, p50, 25, 50);
  else if (avgScans < p75) pct = lerp(avgScans, p50, p75, 50, 75);
  else if (avgScans < p95) pct = lerp(avgScans, p75, p95, 75, 95);
  else pct = Math.min(99, 95 + (avgScans - p95) * 4);

  return Math.round(Math.max(1, Math.min(99, pct)));
}

/**
 * Edad-equivalente: la banda cuyo p50 mejor corresponde a este avgScans.
 * Interpola entre representativeAge de bandas adyacentes para suavizar.
 */
function ageEquivalentFor(avgScans: number): number {
  const bands = SCAN_BENCHMARKS;
  // Por debajo del p50 de la banda más joven
  if (avgScans <= bands[0].p50) return bands[0].representativeAge;
  // Por encima del p50 de la banda pro
  const last = bands[bands.length - 1];
  if (avgScans >= last.p50) return last.representativeAge;

  for (let i = 0; i < bands.length - 1; i++) {
    const a = bands[i];
    const b = bands[i + 1];
    if (avgScans >= a.p50 && avgScans < b.p50) {
      const t = (avgScans - a.p50) / Math.max(1e-6, b.p50 - a.p50);
      return Math.round((a.representativeAge + t * (b.representativeAge - a.representativeAge)) * 10) / 10;
    }
  }
  return last.representativeAge;
}

/** Calcula el Scan IQ completo, calibrado por edad. */
export function computeScanIQ(avgScansPreReception: number, chronologicalAge: number): ScanIQResult {
  const band = scanBandForAge(chronologicalAge);
  const percentile = percentileWithinBand(avgScansPreReception, band);
  const ageEquivalent = ageEquivalentFor(avgScansPreReception);
  const ageDelta = Math.round((ageEquivalent - chronologicalAge) * 10) / 10;

  const scanIQ = percentile; // calibrado: el IQ ES el percentil de su edad

  // Narrativa
  const deltaTxt =
    ageDelta >= 1.5
      ? `Escanea como un jugador de ~${Math.round(ageEquivalent)} años — ${Math.round(ageDelta)} año${Math.round(ageDelta) === 1 ? "" : "s"} por encima de su edad.`
      : ageDelta <= -1.5
        ? `Su frecuencia de escaneo corresponde a un jugador de ~${Math.round(ageEquivalent)} años — hay margen de mejora claro con drills de exploración visual.`
        : `Su frecuencia de escaneo está en línea con su edad.`;

  const pctTxt =
    percentile >= 90
      ? `Top ${100 - percentile}% de su categoría (${band.label}).`
      : percentile >= 70
        ? `Percentil ${percentile} de su edad — por encima de la media.`
        : percentile >= 40
          ? `Percentil ${percentile} de su edad.`
          : `Percentil ${percentile} — el escaneo pre-recepción es su mayor palanca de mejora cognitiva.`;

  const science = `La investigación (Jordet, Premier League) muestra que los jugadores que llegan a profesional escaneaban el doble a los 12-14 años: es el indicador más temprano de potencial élite.`;

  return {
    scanIQ,
    percentile,
    ageBand: band.label,
    ageEquivalent,
    ageDelta,
    avgScansPreReception: Math.round(avgScansPreReception * 10) / 10,
    headline:
      ageDelta >= 1.5
        ? `Scan IQ ${scanIQ} · escanea como uno de ${Math.round(ageEquivalent)} años`
        : `Scan IQ ${scanIQ} · percentil ${percentile} (${band.label})`,
    narrative: `${deltaTxt} ${pctTxt} ${science}`,
  };
}
