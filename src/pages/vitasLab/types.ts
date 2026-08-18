// Tipos del VitasLab extraídos del componente monolítico (paso 1 del split).
// Código puro, sin dependencias de runtime — mover aquí no cambia comportamiento.

export interface CalibrationPoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

// ─── Report types ─────────────────────────────────────────────────────────────

export interface Dimension {
  score: number;
  observacion: string;
}

export interface AnalysisReport {
  estadoActual: {
    resumenEjecutivo: string;
    nivelActual: string;
    fortalezasPrimarias: string[];
    areasDesarrollo: string[];
    dimensiones: {
      velocidadDecision:   Dimension;
      tecnicaConBalon:     Dimension;
      inteligenciaTactica: Dimension;
      capacidadFisica:     Dimension;
      liderazgoPresencia:  Dimension;
      eficaciaCompetitiva: Dimension;
    };
    ajusteVSIVideoScore: number;
  };
  adnFutbolistico: {
    estiloJuego:     string;
    arquetipoTactico: string;
    patrones: Array<{ patron: string; frecuencia: string; descripcion: string }>;
    mentalidad: string;
  };
  jugadorReferencia: {
    bestMatch: {
      nombre:   string;
      posicion: string;
      club:     string;
      score:    number;
      narrativa: string;
    };
  };
  proyeccionCarrera: {
    escenarioOptimista: { descripcion: string; nivelProyecto: string };
    escenarioRealista:  { descripcion: string; nivelProyecto: string };
    factoresClave:      string[];
    riesgos:            string[];
  };
  planDesarrollo: {
    objetivo6meses:  string;
    objetivo18meses: string;
    pilaresTrabajo:  Array<{ pilar: string; acciones: string[]; prioridad: string }>;
  };
  metricasCuantitativas?: {
    fisicas?: {
      velocidadMaxKmh:  number;
      velocidadPromKmh: number;
      distanciaM:       number;
      sprints:          number;
      zonasIntensidad:  { caminar: number; trotar: number; correr: number; sprint: number };
    };
    eventos?: {
      pasesCompletados: number;
      pasesFallados:    number;
      precisionPases:   number;
      recuperaciones:   number;
      duelosGanados:    number;
      duelosPerdidos:   number;
      disparosAlArco:   number;
      disparosFuera:    number;
    };
    fuente:     string;
    confianza:  number;
    heatmapPositions?: Array<{ fx: number; fy: number }>;
  };
  confianza: number;
}
