/**
 * VITAS · MetricValue — ÚNICO componente que traduce procedencia → etiqueta/badge
 * y decide cómo se muestra una métrica (G1 · arnés de honestidad).
 *
 * Regla (`.claude/rules/metricas.md`): ningún otro componente decide cómo se rotula
 * una métrica, ni escribe la palabra «medido» a mano. La etiqueta SIEMPRE se deriva
 * de `provenance`. Cuando `value === null` se muestra el `gate_reason`, nunca un 0,
 * un guion ni un placeholder numérico.
 *
 * FUNDACIÓN (aditiva): aún no lo consume nadie; la migración de cada tarjeta a este
 * componente es el resto de G1.
 */

import type { MetricResult, Provenance } from "@/lib/metrics/MetricResult";

// Etiquetas canónicas. CONSTANTE = null ⇒ no se renderiza como cifra.
const PROVENANCE_LABEL: Record<Provenance, string | null> = {
  MEDIDA: "Medido",
  DERIVADA: "Calculado",
  ESTIMADA_LLM: "Estimado por IA",
  CONSTANTE: null,
  MOCK: "Datos de ejemplo",
};

/** Único punto que deriva la etiqueta de la procedencia. */
export function provenanceLabel(p: Provenance): string | null {
  return PROVENANCE_LABEL[p];
}

/** ¿Esta procedencia exige banner visible de «dato de ejemplo»? */
export function requiresMockBanner(p: Provenance): boolean {
  return p === "MOCK";
}

function badgeClasses(p: Provenance): string {
  switch (p) {
    case "MEDIDA":       return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "DERIVADA":     return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "ESTIMADA_LLM": return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "MOCK":         return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "CONSTANTE":    return "";
  }
}

/** Badge que rotula la procedencia (o nada, si CONSTANTE). */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const label = provenanceLabel(provenance);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClasses(provenance)}`}
    >
      {label}
    </span>
  );
}

interface MetricValueProps {
  result: MetricResult<number | string>;
  /** Formatea el value cuando es presentable. Por defecto: número + units. */
  format?: (value: number | string, units: string | null) => string;
  className?: string;
}

/**
 * Renderiza una métrica según su contrato:
 *  - value === null ⇒ muestra el `gate_reason` (nunca 0 / — / placeholder).
 *  - CONSTANTE ⇒ no se presenta como cifra (bloqueada con su motivo).
 *  - MOCK ⇒ badge «Datos de ejemplo» (el banner de contexto lo pone el contenedor).
 *  - resto ⇒ value formateado + badge derivado de la procedencia.
 */
export function MetricValue({ result, format, className }: MetricValueProps) {
  const { value, provenance, units, gate_reason } = result;

  // Bloqueada o constante → mostrar el motivo, nunca una cifra.
  if (value === null || provenance === "CONSTANTE") {
    return (
      <span className={`text-muted-foreground italic ${className ?? ""}`}>
        {gate_reason ?? "Sin dato"}
      </span>
    );
  }

  const shown = format ? format(value, units) : `${value}${units ? ` ${units}` : ""}`;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className="tabular-nums">{shown}</span>
      <ProvenanceBadge provenance={provenance} />
    </span>
  );
}
