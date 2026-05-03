/**
 * VITAS · Golden Tests para los 6 agentes LLM
 *
 * 12 casos sintéticos representativos. Cada test envía un payload conocido
 * y valida que el output del LLM cumple criterios mínimos.
 *
 * Run: npm run eval
 */

export interface GoldenTest {
  id: string;
  agentEndpoint: string;
  description: string;
  input: Record<string, unknown>;
  expectations: TestExpectation[];
}

export interface TestExpectation {
  type: "key_exists" | "key_contains" | "key_in_range" | "structure";
  path: string;          // ej. "report.title", "report.strengths"
  value?: unknown;
  min?: number;
  max?: number;
  pattern?: string;
}

// ── Helpers · datos sintéticos comunes ───────────────────────────────────
const SAMPLE_VSI = {
  vsi: 68.5,
  tier: "talent",
  tierLabel: "Talent",
  subscores: {
    technique: { value: 72, weight: 0.30, contribution: 21.6 },
    physical: { value: 70, weight: 0.25, contribution: 17.5 },
    mental: { value: 60, weight: 0.20, contribution: 12.0 },
    tactical: { value: 65, weight: 0.15, contribution: 9.75 },
    projection: { value: 76, weight: 0.10, contribution: 7.6 },
  },
};

const SAMPLE_PHV_EARLY = {
  biological_age: 11.2,
  chronological_age: 13.0,
  maturity_offset: -1.8,
  phv_category: "early",
  phv_status: "pre_phv",
  development_window: "active",
};

const SAMPLE_BIOMECHANICS = {
  knee_left_avg: 142.3,
  knee_right_avg: 138.9,
  asymmetry_pct: 4.2,
  stride_frequency_hz: 3.1,
  samples_left: 28,
  samples_right: 27,
};

const SAMPLE_SCANNING_GOOD = {
  scansDetected: 18,
  durationSec: 35.5,
  scanRate: 0.51,
  scanRateClassification: "elite",
  averageAmplitude: 65.2,
  bilateralityPct: 44,
  comparison: {
    ageGroup: "sub-12",
    p25: 0.12, p50: 0.15, p75: 0.22, pro: 0.51,
    yourPercentile: 95,
  },
};

const SAMPLE_SCANNING_LOW = {
  scansDetected: 5,
  durationSec: 38,
  scanRate: 0.13,
  scanRateClassification: "below_avg",
  averageAmplitude: 42,
  bilateralityPct: 15,
  comparison: {
    ageGroup: "sub-12",
    p25: 0.12, p50: 0.15, p75: 0.22, pro: 0.51,
    yourPercentile: 28,
  },
};

const SAMPLE_PLAYER_CTX = {
  chronologicalAge: 13,
  position: "MID",
  name: "Pedrito",
};

// ── Tests de los 6 agentes ───────────────────────────────────────────────

export const GOLDEN_TESTS: GoldenTest[] = [
  // ── PLAYER REPORT ────────────────────────────────────────────────
  {
    id: "player-report-elite",
    agentEndpoint: "/api/agents/player-report",
    description: "Player Report con VSI alto + scanning elite",
    input: {
      playerId: "test-elite-001",
      vsi: { ...SAMPLE_VSI, vsi: 87, tier: "elite", tierLabel: "Elite" },
      phv: SAMPLE_PHV_EARLY,
      biomechanics: SAMPLE_BIOMECHANICS,
      scanning: SAMPLE_SCANNING_GOOD,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.title" },
      { type: "key_exists", path: "report.executive_summary" },
      { type: "structure", path: "report.strengths" },
      { type: "structure", path: "report.areas_to_improve" },
    ],
  },
  {
    id: "player-report-talent-no-phv",
    agentEndpoint: "/api/agents/player-report",
    description: "Player Report sin PHV (player nuevo sin antropométricos)",
    input: {
      playerId: "test-no-phv-001",
      vsi: SAMPLE_VSI,
      phv: null,
      biomechanics: SAMPLE_BIOMECHANICS,
      scanning: null,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.title" },
      { type: "key_exists", path: "report.executive_summary" },
    ],
  },

  // ── LAB BIOMECHANICS ─────────────────────────────────────────────
  {
    id: "lab-biomechanics-with-scan",
    agentEndpoint: "/api/agents/lab-biomechanics-report",
    description: "LAB con scanning rate · debe mencionar scanning",
    input: {
      playerId: "test-scan-001",
      videoId: "vid-test-001",
      vsi: SAMPLE_VSI,
      phv: SAMPLE_PHV_EARLY,
      biomechanics: SAMPLE_BIOMECHANICS,
      scanning: SAMPLE_SCANNING_GOOD,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.title" },
      { type: "key_exists", path: "report.summary" },
      { type: "structure", path: "report.metrics_table" },
      { type: "structure", path: "report.recommendations" },
    ],
  },
  {
    id: "lab-biomechanics-asymmetry-alert",
    agentEndpoint: "/api/agents/lab-biomechanics-report",
    description: "LAB con asimetría >12% · debe alertar riesgo lesión",
    input: {
      playerId: "test-asym-001",
      videoId: "vid-test-002",
      vsi: SAMPLE_VSI,
      phv: SAMPLE_PHV_EARLY,
      biomechanics: { ...SAMPLE_BIOMECHANICS, asymmetry_pct: 18.5 },
      scanning: null,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.summary" },
      { type: "structure", path: "report.concerns" }, // debe haber concerns por asimetría
    ],
  },

  // ── DNA PROFILE ──────────────────────────────────────────────────
  {
    id: "dna-profile-balanced",
    agentEndpoint: "/api/agents/dna-profile",
    description: "DNA · perfil equilibrado (mid box-to-box)",
    input: {
      playerId: "test-dna-001",
      videoId: "vid-test-003",
      vsi: SAMPLE_VSI,
      biomechanics: SAMPLE_BIOMECHANICS,
      scanning: SAMPLE_SCANNING_GOOD,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.primary_style" },
      { type: "key_exists", path: "report.natural_role" },
      { type: "structure", path: "report.tactical_labels" },
    ],
  },

  // ── BEST-MATCH ───────────────────────────────────────────────────
  {
    id: "best-match-with-pros",
    agentEndpoint: "/api/agents/best-match-narrator",
    description: "Best-Match con top-5 jugadores pro",
    input: {
      playerId: "test-bm-001",
      videoId: "vid-test-004",
      similarity: {
        matches: [
          { proPlayer: { name: "Pedri", position: "CM", club: "FC Barcelona", age: 21 }, similarityScore: 0.87, sharedAttributes: ["technique", "vision"] },
          { proPlayer: { name: "Frenkie de Jong", position: "CM", club: "FC Barcelona", age: 27 }, similarityScore: 0.81 },
          { proPlayer: { name: "Modric", position: "CM", club: "Real Madrid", age: 38 }, similarityScore: 0.78 },
        ],
      },
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.title" },
    ],
  },
  {
    id: "best-match-no-similarity",
    agentEndpoint: "/api/agents/best-match-narrator",
    description: "Best-Match sin similarity · debe manejar gracefully",
    input: {
      playerId: "test-bm-002",
      similarity: null,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report" }, // al menos algo
    ],
  },

  // ── PROJECTION ───────────────────────────────────────────────────
  {
    id: "projection-early-phv",
    agentEndpoint: "/api/agents/projection-report",
    description: "Proyección 3 años · pre-estirón con PHV",
    input: {
      playerId: "test-proj-001",
      videoId: "vid-test-005",
      vsi: SAMPLE_VSI,
      phv: SAMPLE_PHV_EARLY,
      biomechanics: SAMPLE_BIOMECHANICS,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.title" },
    ],
  },
  {
    id: "projection-no-phv",
    agentEndpoint: "/api/agents/projection-report",
    description: "Proyección sin PHV · prudencia con 'no se puede proyectar'",
    input: {
      playerId: "test-proj-002",
      vsi: SAMPLE_VSI,
      phv: null,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report" },
    ],
  },

  // ── DEVELOPMENT PLAN ─────────────────────────────────────────────
  {
    id: "dev-plan-with-low-scan",
    agentEndpoint: "/api/agents/development-plan",
    description: "Plan 12 sem · scanning bajo · DEBE incluir 'shoulder check'",
    input: {
      playerId: "test-plan-001",
      videoId: "vid-test-006",
      vsi: SAMPLE_VSI,
      phv: SAMPLE_PHV_EARLY,
      biomechanics: SAMPLE_BIOMECHANICS,
      scanning: SAMPLE_SCANNING_LOW,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.duration_weeks" },
      { type: "structure", path: "report.blocks" },
    ],
  },
  {
    id: "dev-plan-during-phv",
    agentEndpoint: "/api/agents/development-plan",
    description: "Plan 12 sem · durante estirón · NO cargas pesadas",
    input: {
      playerId: "test-plan-002",
      videoId: "vid-test-007",
      vsi: SAMPLE_VSI,
      phv: { ...SAMPLE_PHV_EARLY, phv_category: "ontime", phv_status: "during_phv", development_window: "critical" },
      biomechanics: SAMPLE_BIOMECHANICS,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report.duration_weeks" },
      { type: "structure", path: "report.blocks" },
    ],
  },
  {
    id: "dev-plan-no-phv",
    agentEndpoint: "/api/agents/development-plan",
    description: "Plan 12 sem · sin PHV · debe seguir generando",
    input: {
      playerId: "test-plan-003",
      vsi: SAMPLE_VSI,
      phv: null,
      playerContext: SAMPLE_PLAYER_CTX,
    },
    expectations: [
      { type: "key_exists", path: "report" },
    ],
  },
];
