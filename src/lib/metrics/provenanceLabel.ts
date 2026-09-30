/**
 * VITAS · Etiqueta canónica de procedencia (G1 · arnés de honestidad).
 *
 * ÚNICA tabla procedencia → etiqueta (`.claude/rules/metricas.md`, «Reglas de
 * presentación»). Vive en src/lib (TS puro, sin React) para que la usen tanto el
 * componente de UI (`src/components/metrics/MetricValue.tsx`, que la re-exporta)
 * como las superficies de servidor que no renderizan React (p. ej. el email mensual
 * al director, `api/crons/director-risk-digest.ts`). Nadie más escribe estas
 * etiquetas a mano (inv #7: una sola implementación por concepto).
 *
 * Import relativo a propósito (sin alias `@/`): api/ lo compila con su propio
 * tsconfig, que no resuelve el alias.
 */

import type { Provenance } from "./MetricResult";

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
