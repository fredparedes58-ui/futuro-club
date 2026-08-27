/**
 * VITAS · Derivación de las métricas de similarity a partir de OBSERVACIONES REALES
 * del vídeo (docx #14 · P3).
 *
 * Antes, 4 de las 6 dimensiones del "comparable profesional" eran constantes
 * hardcoded (technique:65, mental:60, tactical:55) pasadas como si fueran medidas
 * → violaba el invariante #1 (CONSTANTE haciéndose pasar por MEDIDA/DERIVADA) y
 * hacía que los comparables salieran genéricos.
 *
 * Enfoque HÍBRIDO honesto:
 *   - Si el análisis trae eventos observados (eventosContados de Gemini o
 *     eventSummary del cliente) → se DERIVAN las dims de esos eventos. Se usan
 *     RATIOS reales autonormalizados donde existen (precisión de pase, % de duelos
 *     ganados, % de disparos a puerta). Las dims sin ratio (visión, volumen
 *     defensivo) usan normalizaciones por volumen marcadas "pendiente de validar"
 *     → el caller reduce la confianza.
 *   - Si NO hay eventos → devuelve null: el caller SE ABSTIENE (no genera comparable,
 *     no fabrica un 6-D con constantes). Abstención = resultado válido (invariante #3).
 *
 * Nota: estas métricas alimentan SOLO al motor de similarity (comparable pro), NO
 * al VSI compuesto — no mueven el VSI global de la app.
 */

export interface SimMetrics {
  speed: number;
  shooting: number;
  vision: number;
  technique: number;
  defending: number;
  stamina: number;
}

export interface SimDerivation {
  metrics: SimMetrics;
  source: "gemini" | "client";
  /** Dims derivadas de un RATIO real observado (autonormalizado). Las demás usan
   *  proxies de volumen "pendiente de validar" o la base física. Cuanto mayor,
   *  más fiable el comparable. */
  ratioDerivedDims: number;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Normalizaciones por VOLUMEN — "pendiente de validar" (no hay literatura/umbral
// medido detrás). Cuántos eventos ≈ "100" en una escala 0-100 por vídeo. Deliberadamente
// conservadoras; el caller marca la similarity como derivada + baja confianza.
const SCAN_FULL = 25;   // escaneos por vídeo para saturar "visión"
const PROG_FULL = 12;   // pases progresivos para saturar
const DEFVOL_FULL = 12; // recuperaciones+robos+anticipaciones para saturar "volumen defensivo"
const REC_FULL = 12;    // recoveries (path cliente)

/**
 * Deriva las 6 métricas de similarity. `physicalValue` es la señal física real
 * (biomecánica) si existe; si no, las dims físicas quedan neutras (50) y NO cuentan
 * como ratio-derivadas. Devuelve null si no hay eventos observados (→ abstención).
 */
export function deriveSimMetrics(
  videoObservations: unknown,
  physicalValue: number | null,
): SimDerivation | null {
  const obs = videoObservations as
    | { gemini?: { eventosContados?: Record<string, unknown> } | null; eventSummary?: Record<string, unknown> | null }
    | null;
  const ec = obs?.gemini?.eventosContados ?? null;
  const es = obs?.eventSummary ?? null;
  if (!ec && !es) return null; // sin eventos → el caller se abstiene (no constantes)

  const physBase = physicalValue != null ? clamp(physicalValue) : 50;
  let ratioDerivedDims = physicalValue != null ? 1 : 0; // la física cuenta si es real

  let technique: number, vision: number, defending: number, shooting: number;
  let source: "gemini" | "client";

  if (ec) {
    source = "gemini";
    // technique ← precisión de pase (ratio real) + éxito en regate (ratio real)
    const passTot = num(ec.pasesCompletados) + num(ec.pasesFallados);
    const dribTot = num(ec.regatesConVentaja) + num(ec.regatesSinVentaja);
    const passAcc = passTot > 0 ? (num(ec.pasesCompletados) / passTot) * 100 : null;
    const dribAcc = dribTot > 0 ? (num(ec.regatesConVentaja) / dribTot) * 100 : null;
    const techParts = [passAcc, dribAcc].filter((v): v is number => v != null);
    technique = techParts.length > 0 ? clamp(techParts.reduce((a, b) => a + b, 0) / techParts.length) : 50;
    if (techParts.length > 0) ratioDerivedDims++;
    // defending ← % duelos ganados (ratio real) + volumen de acciones defensivas
    const duelTot = num(ec.duelosGanados) + num(ec.duelosPerdidos);
    const duelWin = duelTot > 0 ? (num(ec.duelosGanados) / duelTot) * 100 : null;
    const defVol = Math.min(100, ((num(ec.recuperaciones) + num(ec.robos) + num(ec.anticipaciones)) / DEFVOL_FULL) * 100);
    defending = duelWin != null ? clamp(duelWin * 0.6 + defVol * 0.4) : clamp(defVol);
    if (duelTot > 0) ratioDerivedDims++;
    // shooting ← % disparos a puerta (ratio real)
    const shotTot = num(ec.disparosAlArco) + num(ec.disparosFuera);
    shooting = shotTot > 0 ? clamp((num(ec.disparosAlArco) / shotTot) * 100) : clamp(technique * 0.7);
    if (shotTot > 0) ratioDerivedDims++;
    // vision ← volumen de escaneo + pases progresivos (proxies, sin ratio → pendiente de validar)
    const scanScore = Math.min(100, (num(ec.escaneos) / SCAN_FULL) * 100);
    const progScore = Math.min(100, (num(ec.pasesProgresivos) / PROG_FULL) * 100);
    vision = clamp(scanScore * 0.6 + progScore * 0.4);
  } else {
    source = "client";
    // technique ← passCompletionPct (ratio real, ya 0-100)
    const passPct = es!.passCompletionPct;
    technique = typeof passPct === "number" ? clamp(passPct) : 50;
    if (typeof passPct === "number") ratioDerivedDims++;
    // defending ← % duelos ganados (ratio) + recoveries (volumen)
    const dW = num(es!.duelsWon), dL = num(es!.duelsLost);
    const duelWin = dW + dL > 0 ? (dW / (dW + dL)) * 100 : null;
    const recVol = Math.min(100, (num(es!.recoveries) / REC_FULL) * 100);
    defending = duelWin != null ? clamp(duelWin * 0.6 + recVol * 0.4) : clamp(recVol);
    if (dW + dL > 0) ratioDerivedDims++;
    // shooting ← xG por disparo (proxy) — pendiente de validar
    const shots = num(es!.shots);
    shooting = shots > 0 ? clamp(Math.min(100, 40 + num(es!.xgContributions) * 60)) : clamp(technique * 0.7);
    // vision ← vaepApprox (proxy value-added) — pendiente de validar
    const vaep = es!.vaepApprox;
    vision = typeof vaep === "number" ? clamp(Math.max(0, Math.min(100, 50 + vaep * 10))) : clamp(technique * 0.8);
  }

  return {
    metrics: { speed: physBase, stamina: physBase, shooting, vision, technique, defending },
    source,
    ratioDerivedDims,
  };
}
