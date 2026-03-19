// ─── Types ───────────────────────────────────────────────────────────────

export type SampleTier = "bronze" | "silver" | "gold" | "platinum";
export type IdentityType = "ofensivo" | "defensivo" | "tecnico" | "fisico" | "mixto";
export type StabilityLevel = "emergente" | "en_desarrollo" | "estable" | "consolidado";
export type PhaseOfPlay = "in_possession" | "out_of_possession" | "transition";
export type RiskCode = string;

export const POSITION_CODES = ["GK","RB","RCB","LCB","LB","DM","RCM","LCM","RW","LW","ST"] as const;
export type PositionCode = typeof POSITION_CODES[number];

export const POSITION_LABELS: Record<PositionCode, string> = {
  GK: "Portero", RB: "Lateral Derecho", RCB: "Central Derecho", LCB: "Central Izquierdo",
  LB: "Lateral Izquierdo", DM: "Mediocentro Defensivo", RCM: "Interior Derecho",
  LCM: "Interior Izquierdo", RW: "Extremo Derecho", LW: "Extremo Izquierdo", ST: "Delantero Centro",
};

export const ARCHETYPE_CODES = [
  "recuperador","interceptor","corrector","organizador","filtrador","lanzador",
  "progresor_pase","progresor_conduccion","desbordador","llegador","box_to_box",
  "carrilero","pivote_posicional","interior_creativo","extremo_1v1","extremo_espacio",
  "finalizador","9_fijador","segundo_punta","presionante",
] as const;
export type ArchetypeCode = typeof ARCHETYPE_CODES[number];

export const ARCHETYPE_LABELS: Record<ArchetypeCode, string> = {
  recuperador: "Recuperador", interceptor: "Interceptor", corrector: "Corrector",
  organizador: "Organizador", filtrador: "Filtrador", lanzador: "Lanzador",
  progresor_pase: "Progresor por pase", progresor_conduccion: "Progresor por conducción",
  desbordador: "Desbordador", llegador: "Llegador", box_to_box: "Box-to-Box",
  carrilero: "Carrilero", pivote_posicional: "Pivote posicional",
  interior_creativo: "Interior creativo", extremo_1v1: "Extremo 1v1",
  extremo_espacio: "Extremo al espacio", finalizador: "Finalizador",
  "9_fijador": "9 Fijador", segundo_punta: "Segundo punta", presionante: "Presionante",
};

export interface CapabilityScores {
  tactical: number;
  technical: number;
  physical: number;
}

export interface PositionFit {
  code: PositionCode;
  prob: number;
  score: number;
  confidence: number;
  reason: string;
}

export interface ArchetypeFit {
  code: ArchetypeCode;
  score: number;
  confidence: number;
  stability: StabilityLevel;
  positions?: PositionCode[];
}

export interface EvidenceIndicator {
  indicator: string;
  label: string;
  raw_value: number;
  normalized: number;
  reliability: number;
  phase_of_play: PhaseOfPlay;
  impact: "positivo" | "neutro" | "negativo";
  contribution: number;
  positions_impacted: PositionCode[];
  archetypes_impacted: ArchetypeCode[];
  explanation: string;
}

export interface StrengthItem {
  label: string;
  evidence: string;
  confidence: number;
}

export interface GapItem {
  label: string;
  priority: "alta" | "media" | "baja";
  relatedPositions: PositionCode[];
}

export interface RoleProfileData {
  run_id: string;
  player_id: string;
  player_name: string;
  player_age: number;
  dominant_foot: "derecho" | "izquierdo" | "ambidiestro";
  minutes_played: number;
  competitive_level: string;
  sample_tier: SampleTier;
  overall_confidence: number;
  current: CapabilityScores;
  identity: {
    dominant: IdentityType;
    distribution: Record<IdentityType, number>;
    explanation: string;
  };
  positions: PositionFit[];
  archetypes: ArchetypeFit[];
  projections: {
    "0_6m": CapabilityScores;
    "6_18m": CapabilityScores;
    "18_36m": CapabilityScores;
  };
  strengths: StrengthItem[];
  risks: { code: RiskCode; label: string; description: string }[];
  gaps: GapItem[];
  consolidation_notes: string[];
  evidence: EvidenceIndicator[];
}

// ─── Mock data ───────────────────────────────────────────────────────────

export const mockRoleProfile: RoleProfileData = {
  run_id: "rp-run-001",
  player_id: "p1",
  player_name: "Lucas Moreno",
  player_age: 14,
  dominant_foot: "derecho",
  minutes_played: 1420,
  competitive_level: "Liga Nacional U15",
  sample_tier: "silver",
  overall_confidence: 0.78,

  current: {
    tactical: 74.2,
    technical: 81.0,
    physical: 63.4,
  },

  identity: {
    dominant: "tecnico",
    distribution: {
      ofensivo: 0.44,
      defensivo: 0.59,
      tecnico: 0.78,
      fisico: 0.41,
      mixto: 0.36,
    },
    explanation: "Perfil dominado por lectura técnica y capacidad de retención. Buen volumen de pase progresivo con tendencia a filtrar entre líneas. El componente defensivo es secundario pero significativo.",
  },

  positions: [
    { code: "DM", prob: 0.34, score: 81.2, confidence: 0.82, reason: "Progresión por pase + retención bajo presión + intercepción" },
    { code: "RCM", prob: 0.28, score: 77.5, confidence: 0.77, reason: "Volumen mixto y buena lectura en transición" },
    { code: "LCM", prob: 0.18, score: 72.1, confidence: 0.69, reason: "Buen apoyo interior pero menor llegada al área rival" },
    { code: "RCB", prob: 0.06, score: 58.3, confidence: 0.54, reason: "Buena salida de balón pero falta intensidad defensiva" },
    { code: "LCB", prob: 0.05, score: 55.1, confidence: 0.51, reason: "Similar a RCB, peor lateralidad" },
    { code: "RB", prob: 0.03, score: 48.7, confidence: 0.45, reason: "Pase largo pero baja proyección ofensiva lateral" },
    { code: "LB", prob: 0.02, score: 44.2, confidence: 0.40, reason: "Sin ventaja en esta demarcación" },
    { code: "RW", prob: 0.01, score: 38.0, confidence: 0.35, reason: "Sin perfil de desborde ni velocidad punta" },
    { code: "LW", prob: 0.01, score: 36.5, confidence: 0.33, reason: "Sin perfil de extremo" },
    { code: "ST", prob: 0.01, score: 32.0, confidence: 0.30, reason: "No es finalizador ni referencia de área" },
    { code: "GK", prob: 0.01, score: 10.0, confidence: 0.10, reason: "N/A" },
  ],

  archetypes: [
    { code: "filtrador", score: 84.0, confidence: 0.79, stability: "estable", positions: ["DM", "RCM", "LCM"] },
    { code: "organizador", score: 80.0, confidence: 0.76, stability: "estable", positions: ["DM", "RCM"] },
    { code: "recuperador", score: 77.0, confidence: 0.73, stability: "emergente", positions: ["DM"] },
    { code: "progresor_pase", score: 74.5, confidence: 0.70, stability: "en_desarrollo", positions: ["DM", "RCM", "LCM"] },
    { code: "pivote_posicional", score: 71.0, confidence: 0.66, stability: "emergente", positions: ["DM"] },
    { code: "interior_creativo", score: 65.0, confidence: 0.58, stability: "emergente", positions: ["RCM", "LCM"] },
  ],

  projections: {
    "0_6m": { tactical: 76.0, technical: 82.3, physical: 69.2 },
    "6_18m": { tactical: 79.5, technical: 84.4, physical: 74.1 },
    "18_36m": { tactical: 82.0, technical: 86.0, physical: 77.8 },
  },

  strengths: [
    { label: "Pase entre líneas bajo presión", evidence: "1.92 xT_pass/90 — percentil 94 en su grupo de maduración", confidence: 0.84 },
    { label: "Retención en zona 2/3", evidence: "Pierde balón solo 3.1 veces/90 en zona media-alta", confidence: 0.81 },
    { label: "Lectura defensiva anticipada", evidence: "2.4 intercepciones/90 con timing pre-pase", confidence: 0.73 },
    { label: "Orientación corporal al recibir", evidence: "78% recepciones orientadas al campo rival", confidence: 0.77 },
  ],

  risks: [
    { code: "tracking_physical_partial", label: "Datos físicos parciales", description: "Solo 62% de los minutos tienen cobertura GPS. Las métricas físicas pueden estar subestimadas." },
    { code: "maturity_window_sensitive", label: "Ventana de maduración sensible", description: "Jugador con PHV -0.8. Las proyecciones físicas tienen incertidumbre alta hasta completar el pico de crecimiento." },
    { code: "sample_size_moderate", label: "Muestra moderada", description: "1420 minutos en liga nacional. Insuficiente para confirmar rendimiento en competición superior." },
  ],

  gaps: [
    { label: "Mayor volumen de carry value (conducción progresiva)", priority: "alta", relatedPositions: ["RCM", "LCM"] },
    { label: "Más llegadas al área rival", priority: "media", relatedPositions: ["RCM", "LCM"] },
    { label: "Mayor volumen en acciones de alta intensidad", priority: "alta", relatedPositions: ["DM", "RCM"] },
    { label: "Pase largo diagonal con mayor precisión", priority: "baja", relatedPositions: ["DM"] },
  ],

  consolidation_notes: [
    "Para consolidar como DM-filtrador necesita demostrar carry value sostenido y resistencia en duelos aéreos.",
    "La transición a RCM requiere más evidencia de llegada al área y conexión con el último tercio.",
    "El componente físico es la mayor incógnita: sin datos de GPS completos ni actualización PHV reciente, la proyección física tiene confianza baja.",
  ],

  evidence: [
    { indicator: "xt_pass", label: "xT por pase", raw_value: 1.92, normalized: 81, reliability: 0.84, phase_of_play: "in_possession", impact: "positivo", contribution: 0.18, positions_impacted: ["DM", "RCM", "LCM"], archetypes_impacted: ["filtrador", "organizador", "progresor_pase"], explanation: "Contribución neta por pase en zona de progresión. Percentil 94 ajustado por maduración." },
    { indicator: "interceptions_p90", label: "Intercepciones/90", raw_value: 2.4, normalized: 74, reliability: 0.73, phase_of_play: "out_of_possession", impact: "positivo", contribution: 0.12, positions_impacted: ["DM"], archetypes_impacted: ["recuperador", "interceptor"], explanation: "Lectura anticipada fuerte en zona media. Contribuye al perfil de recuperador." },
    { indicator: "ball_retention_z23", label: "Retención zona 2/3", raw_value: 96.9, normalized: 88, reliability: 0.81, phase_of_play: "in_possession", impact: "positivo", contribution: 0.15, positions_impacted: ["DM", "RCM", "LCM"], archetypes_impacted: ["organizador", "pivote_posicional"], explanation: "Solo 3.1 pérdidas/90 en zona media-alta. Muy por encima de la media del grupo." },
    { indicator: "carry_value", label: "Carry value", raw_value: 0.41, normalized: 42, reliability: 0.68, phase_of_play: "in_possession", impact: "neutro", contribution: 0.06, positions_impacted: ["RCM", "LCM"], archetypes_impacted: ["progresor_conduccion", "box_to_box"], explanation: "Bajo volumen de conducción progresiva. Gap identificado para evolución a interior." },
    { indicator: "high_intensity_runs", label: "Carreras alta intensidad", raw_value: 4.8, normalized: 38, reliability: 0.52, phase_of_play: "transition", impact: "negativo", contribution: -0.04, positions_impacted: ["RCM", "DM"], archetypes_impacted: ["box_to_box", "llegador", "presionante"], explanation: "Por debajo de la media. Dato condicionado por cobertura GPS parcial (62%)." },
    { indicator: "aerial_duels_won", label: "Duelos aéreos ganados %", raw_value: 38.0, normalized: 31, reliability: 0.60, phase_of_play: "out_of_possession", impact: "negativo", contribution: -0.03, positions_impacted: ["DM", "RCB"], archetypes_impacted: ["recuperador", "corrector"], explanation: "Bajo para perfil defensivo puro. PHV -0.8 puede explicar parte del dato." },
    { indicator: "progressive_passes", label: "Pases progresivos/90", raw_value: 6.7, normalized: 79, reliability: 0.80, phase_of_play: "in_possession", impact: "positivo", contribution: 0.14, positions_impacted: ["DM", "RCM", "LCM"], archetypes_impacted: ["filtrador", "progresor_pase", "organizador"], explanation: "Buen volumen de progresión vertical. Consistente en últimos 6 partidos." },
    { indicator: "pressing_actions", label: "Acciones de presión/90", raw_value: 12.1, normalized: 55, reliability: 0.70, phase_of_play: "out_of_possession", impact: "neutro", contribution: 0.03, positions_impacted: ["DM", "RCM"], archetypes_impacted: ["presionante", "recuperador"], explanation: "Volumen medio. No destaca pero cumple. Intensidad por confirmar con GPS." },
    { indicator: "body_orientation", label: "Orientación corporal al recibir", raw_value: 78.0, normalized: 82, reliability: 0.77, phase_of_play: "in_possession", impact: "positivo", contribution: 0.10, positions_impacted: ["DM", "RCM", "LCM"], archetypes_impacted: ["organizador", "filtrador", "pivote_posicional"], explanation: "78% recepciones orientadas al campo rival. Indicador de madurez táctica avanzada para su edad." },
    { indicator: "final_third_entries", label: "Entradas al último tercio", raw_value: 1.2, normalized: 35, reliability: 0.65, phase_of_play: "in_possession", impact: "neutro", contribution: 0.02, positions_impacted: ["RCM", "LCM"], archetypes_impacted: ["llegador", "interior_creativo"], explanation: "Bajo. Coherente con perfil de pivote/filtrador más que de interior ofensivo." },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────

export function getConfidenceLabel(c: number): string {
  if (c >= 0.85) return "Alta";
  if (c >= 0.70) return "Media-Alta";
  if (c >= 0.55) return "Media";
  if (c >= 0.40) return "Media-Baja";
  return "Baja";
}

export function getConfidenceColor(c: number): string {
  if (c >= 0.85) return "text-primary";
  if (c >= 0.70) return "text-electric";
  if (c >= 0.55) return "text-gold";
  if (c >= 0.40) return "text-orange-400";
  return "text-danger";
}

export function getSampleTierLabel(t: SampleTier): string {
  const map: Record<SampleTier, string> = {
    bronze: "Bronce — muestra limitada",
    silver: "Plata — muestra moderada",
    gold: "Oro — muestra sólida",
    platinum: "Platino — muestra robusta",
  };
  return map[t];
}

export function getSampleTierColor(t: SampleTier): string {
  const map: Record<SampleTier, string> = {
    bronze: "text-orange-400",
    silver: "text-muted-foreground",
    gold: "text-gold",
    platinum: "text-primary",
  };
  return map[t];
}

export function getStabilityLabel(s: StabilityLevel): string {
  const map: Record<StabilityLevel, string> = {
    emergente: "Emergente",
    en_desarrollo: "En desarrollo",
    estable: "Estable",
    consolidado: "Consolidado",
  };
  return map[s];
}

export function getPhaseLabel(p: PhaseOfPlay): string {
  const map: Record<PhaseOfPlay, string> = {
    in_possession: "En posesión",
    out_of_possession: "Sin posesión",
    transition: "Transición",
  };
  return map[p];
}
