/**
 * VITAS · Glosario de métricas (Sprint 4.4)
 *
 * Definiciones in-context de los términos de dominio, para tooltips (TermTooltip).
 * Centraliza lo que antes estaba en texto suelto por los componentes.
 */
export interface GlossaryTerm {
  term: string;
  short: string;
  long: string;
}

export const GLOSSARY: Record<string, GlossaryTerm> = {
  vsi: {
    term: "VSI",
    short: "VITAS Scouting Index",
    long: "Índice compuesto 0-100 del rendimiento del jugador (velocidad, técnica, visión, físico, tiro, defensa).",
  },
  phv: {
    term: "PHV",
    short: "Peak Height Velocity",
    long: "Pico de velocidad de crecimiento. VITAS estima la maduración por el % de talla adulta (Khamis-Roche) y la edad del PHV (APHV = edad − offset de Mirwald), y corrige el rendimiento según el timing vs pares (madurador precoz/tardío), no solo la edad cronológica.",
  },
  vaep: {
    term: "VAEP",
    short: "Valuing Actions by Estimating Probabilities",
    long: "Valora cada acción por cuánto cambia la probabilidad de marcar o de encajar un gol.",
  },
  acwr: {
    term: "ACWR",
    short: "Acute:Chronic Workload Ratio",
    long: "Ratio entre carga aguda (7 días) y crónica (28 días). Zona óptima ~0.8–1.3; por encima de 1.5 sube el riesgo de lesión.",
  },
  scaniq: {
    term: "Scan IQ",
    short: "Escaneo pre-recepción",
    long: "Frecuencia con que el jugador escanea el entorno antes de recibir el balón, calibrada por edad (investigación de Jordet).",
  },
  dmscore: {
    term: "DM Score",
    short: "Decision-Making Score",
    long: "Score 0-100 de toma de decisiones: Scan IQ + velocidad de decisión + composure bajo presión + lectura táctica.",
  },
};

/** Normaliza una clave ("Scan IQ", "PHV offset") a la del glosario. */
export function glossaryLookup(key: string): GlossaryTerm | undefined {
  return GLOSSARY[key.toLowerCase().replace(/[^a-z]/g, "")];
}
