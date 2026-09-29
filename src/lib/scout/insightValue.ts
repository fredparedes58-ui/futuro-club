/**
 * VITAS · formato del metric_value LEGACY de un scout insight.
 *
 * Los insights anteriores a fix/vsi-delta-provenance guardaban `metricValue` como
 * texto libre del LLM y a veces mezclaban el valor absoluto con su variación en el
 * mismo campo, p.ej. "67.4 (+9.9)". Esa variación NO tiene procedencia (la escribía
 * el modelo, sin base ni fecha; en el caso del docx comparaba contra un 57.5
 * fabricado). Esta función solo separa la base de la variación para que la UI pueda
 * mostrar la base como «Estimado por IA» y ABSTENERSE de pintar la variación como
 * tendencia.
 *
 * Los insights nuevos ya no llevan cifras del LLM: su variación es
 * `context_data.vsi_delta` (MetricResult calculado en el servidor, ver
 * src/lib/scoring/vsiDelta.ts) y no pasa por aquí.
 *
 * Si el texto no encaja con el patrón "base (±delta)" se devuelve tal cual
 * (p.ej. "82.4", "+14%", "1er percentil"): no se inventa una tendencia.
 */
export interface MetricValueParts {
  /** Valor principal (o el texto íntegro si no hay delta). null si no hay valor: sin placeholder. */
  base: string | null;
  /** Variación con signo (p.ej. "+9.9", "-3.2"), o null si no la hay. */
  delta: string | null;
  /** true si la variación es ≥ 0. */
  up: boolean;
}

export function splitMetricValue(v: string | null | undefined): MetricValueParts {
  // Sin valor ⇒ null (la UI no pinta nada). Nunca un "—" en lugar de la cifra.
  if (!v || !v.trim()) return { base: null, delta: null, up: true };
  // "base ( ±delta[%] )" — admite el signo menos unicode (−) que a veces emite el LLM.
  const m = v.match(/^(.*?)\s*\(\s*([+\-−][\d.,]+\s*%?)\s*\)\s*$/);
  if (!m || !m[1].trim()) return { base: v, delta: null, up: true };
  const delta = m[2].replace("−", "-").replace(/\s+/g, "");
  return { base: m[1].trim(), delta, up: !delta.startsWith("-") };
}
