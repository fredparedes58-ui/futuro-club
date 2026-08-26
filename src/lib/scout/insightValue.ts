/**
 * VITAS · formato del metric_value de un scout insight.
 *
 * El agente emite `metricValue` como texto libre y a veces mezcla el valor
 * absoluto con su variación en el mismo campo, p.ej. "67.4 (+9.9)". Mostrado tal
 * cual es AMBIGUO: no se distingue si el 9.9 se SUMA al 67.4 o si es la variación
 * que lo llevó hasta ahí. Esta función separa el valor base de la variación para
 * que la UI pinte la variación como chip de tendencia (▲/▼) — que se lee como
 * CAMBIO respecto a evaluaciones previas, nunca como una suma.
 *
 * Si el texto no encaja con el patrón "base (±delta)" se devuelve tal cual
 * (p.ej. "82.4", "+14%", "1er percentil"): no se inventa una tendencia.
 */
export interface MetricValueParts {
  /** Valor principal a mostrar en grande (o el texto íntegro si no hay delta). */
  base: string;
  /** Variación con signo (p.ej. "+9.9", "-3.2"), o null si no la hay. */
  delta: string | null;
  /** true si la variación es ≥ 0 (para color/flecha). */
  up: boolean;
}

export function splitMetricValue(v: string | null | undefined): MetricValueParts {
  if (!v) return { base: "—", delta: null, up: true };
  // "base ( ±delta[%] )" — admite el signo menos unicode (−) que a veces emite el LLM.
  const m = v.match(/^(.*?)\s*\(\s*([+\-−][\d.,]+\s*%?)\s*\)\s*$/);
  if (!m || !m[1].trim()) return { base: v, delta: null, up: true };
  const delta = m[2].replace("−", "-").replace(/\s+/g, "");
  return { base: m[1].trim(), delta, up: !delta.startsWith("-") };
}
