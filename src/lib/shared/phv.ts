/**
 * VITAS · Agregación de distribución PHV del equipo (FASE 5 · activación)
 *
 * Convierte los maturity offsets (Mirwald) del roster en la distribución
 * {prePhv, circaPhv, postPhv} que consumen los agentes tácticos
 * (team-intelligence / tactical-pattern) para el razonamiento PHV.
 *
 * Mapeo estándar por offset (años respecto al pico de crecimiento):
 *   offset < -1  → pre-PHV  (antes del pico)
 *   -1 ≤ o ≤ 1   → circa-PHV (alrededor del pico)
 *   offset > 1   → post-PHV (después del pico)
 *
 * Devuelve undefined si no hay ningún offset → additive-safe (el prompt no
 * pinta bloque PHV y el agente no cambia su comportamiento).
 */

export interface PhvDistribution {
  prePhv: number;
  circaPhv: number;
  postPhv: number;
}

export function aggregatePhvDistribution(
  players: Array<{ phvOffset?: number | null }>,
): PhvDistribution | undefined {
  const offsets = players
    .map((p) => p.phvOffset)
    .filter((o): o is number => typeof o === "number" && Number.isFinite(o));
  if (offsets.length === 0) return undefined;

  let pre = 0;
  let circa = 0;
  let post = 0;
  for (const o of offsets) {
    if (o < -1) pre++;
    else if (o > 1) post++;
    else circa++;
  }

  const n = offsets.length;
  const pct = (x: number) => Math.round((x / n) * 100);
  return { prePhv: pct(pre), circaPhv: pct(circa), postPhv: pct(post) };
}
