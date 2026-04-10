/**
 * roleProfileService — Tests
 * Verifica que el Role Profile se alimenta de análisis de video, no de métricas manuales.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockStorage: Record<string, unknown> = {};
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStorage[key] ?? fallback),
    set: vi.fn((key: string, val: unknown) => { mockStorage[key] = val; }),
  },
}));

const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
  SUPABASE_CONFIGURED: true,
}));

// Mock PlayerService
const mockPlayer = {
  id: "p1",
  name: "Samu",
  age: 15,
  foot: "right" as const,
  position: "Mediocentro",
  height: 172,
  weight: 62,
  competitiveLevel: "Nacional",
  minutesPlayed: 900,
  metrics: { speed: 70, technique: 80, vision: 75, stamina: 65, shooting: 60, defending: 55 },
  phvCategory: "on-time",
  phvOffset: 0,
};

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getById: vi.fn((id: string) => id === "p1" ? mockPlayer : null),
  },
}));

// Mock AgentService
const mockBuildRoleProfile = vi.fn();
vi.mock("@/services/real/agentService", () => ({
  AgentService: {
    buildRoleProfile: (...args: unknown[]) => mockBuildRoleProfile(...args),
  },
}));

import { fetchRoleProfile, fetchPositionFit, fetchArchetypes, fetchAuditIndicators } from "@/services/roleProfileService";

// Helper: mock video analysis report from Supabase
const makeVideoAnalysis = (overrides = {}) => ({
  report: {
    estadoActual: {
      resumenEjecutivo: "Jugador técnico con buena visión",
      nivelActual: "medio_alto",
      fortalezasPrimarias: ["Pase entre líneas", "Control orientado"],
      areasDesarrollo: ["Velocidad de sprint", "Juego aéreo"],
      dimensiones: {
        velocidadDecision: { score: 7.5, observacion: "Decide rápido bajo presión" },
        tecnicaConBalon: { score: 8.0, observacion: "Buen primer toque orientado" },
        inteligenciaTactica: { score: 7.8, observacion: "Lee bien los espacios" },
        capacidadFisica: { score: 6.0, observacion: "Falta resistencia en 2do tiempo" },
        liderazgoPresencia: { score: 6.5, observacion: "Comunicación intermedia" },
        eficaciaCompetitiva: { score: 7.0, observacion: "Contribuye al juego colectivo" },
      },
    },
    adnFutbolistico: {
      estiloJuego: "Organizador de juego posicional",
      arquetipoTactico: "Filtrador",
    },
    planDesarrollo: {
      objetivo6meses: "Mejorar resistencia",
    },
    jugadorReferencia: {},
    proyeccionCarrera: {},
  },
  created_at: "2026-04-01T00:00:00Z",
  video_id: "v1",
  ...overrides,
});

// Helper: setup Supabase mock
function setupSupabaseMock(analyses: unknown[]) {
  mockSupabaseFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: analyses, error: null }),
        }),
      }),
    }),
  });
}

describe("roleProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  describe("fetchRoleProfile", () => {
    it("returns null when player does not exist", async () => {
      const result = await fetchRoleProfile("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when no video analyses exist", async () => {
      setupSupabaseMock([]);
      const result = await fetchRoleProfile("p1");
      expect(result).toBeNull();
    });

    it("calls agent with video analysis data when analyses exist", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockResolvedValue({
        success: true,
        data: {
          overallConfidence: 0.82,
          capabilities: {
            tactical: { current: 78, p6m: 80, p18m: 83 },
            technical: { current: 80, p6m: 82, p18m: 85 },
            physical: { current: 60, p6m: 63, p18m: 67 },
          },
          dominantIdentity: "tecnico",
          identityDistribution: { tecnico: 0.4, ofensivo: 0.25, defensivo: 0.2, fisico: 0.1, mixto: 0.05 },
          topPositions: [
            { code: "RCM", fit: 85, confidence: 0.8 },
            { code: "DM", fit: 78, confidence: 0.75 },
          ],
          topArchetypes: [
            { code: "filtrador", fit: 88, stability: "estable" },
            { code: "organizador", fit: 82, stability: "en_desarrollo" },
          ],
          strengths: ["Pase entre líneas", "Lectura táctica"],
          risks: ["Resistencia física limitada"],
          gaps: ["Mayor volumen de carry"],
        },
      });

      const result = await fetchRoleProfile("p1");

      expect(result).not.toBeNull();
      expect(result!.player_name).toBe("Samu");
      expect(result!.player_age).toBe(15);
      expect(result!.player_id).toBe("p1");
      expect(result!.overall_confidence).toBe(0.82);
      expect(result!.positions.length).toBeGreaterThan(0);
      expect(result!.archetypes.length).toBeGreaterThan(0);

      // Verify agent was called with video analysis summary
      expect(mockBuildRoleProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({
            videoAnalysisSummary: expect.objectContaining({
              totalAnalyses: 1,
              strengths: ["Pase entre líneas", "Control orientado"],
              nivelActual: "medio_alto",
            }),
          }),
        })
      );
    });

    it("builds basic profile from video data when agent fails", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("Agent timeout"));

      const result = await fetchRoleProfile("p1");

      // Should still return a profile from video dimensions
      expect(result).not.toBeNull();
      expect(result!.player_name).toBe("Samu");
      expect(result!.current.technical).toBe(80); // tecnicaConBalon score 8.0 × 10
      expect(result!.current.tactical).toBe(78);  // inteligenciaTactica score 7.8 × 10
      expect(result!.current.physical).toBe(60);  // capacidadFisica score 6.0 × 10
      expect(result!.risks.some(r => r.code === "AGENT_UNAVAILABLE")).toBe(true);
      expect(result!.strengths.length).toBeGreaterThan(0);
    });

    it("sample_tier based on number of video analyses", async () => {
      // 1 video = bronze
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("fail"));
      let result = await fetchRoleProfile("p1");
      expect(result!.sample_tier).toBe("bronze");

      // 3 videos = gold
      setupSupabaseMock([makeVideoAnalysis(), makeVideoAnalysis(), makeVideoAnalysis()]);
      result = await fetchRoleProfile("p1");
      expect(result!.sample_tier).toBe("gold");
    });

    it("evidence comes from video dimensions, not manual metrics", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("fail"));

      const result = await fetchRoleProfile("p1");
      expect(result).not.toBeNull();

      // Evidence should have video dimension keys
      const indicators = result!.evidence.map(e => e.indicator);
      expect(indicators).toContain("tecnicaConBalon");
      expect(indicators).toContain("inteligenciaTactica");

      // Should NOT have manual metric keys
      expect(indicators).not.toContain("speed");
      expect(indicators).not.toContain("shooting");
    });

    it("projections increase over time", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("fail"));

      const result = await fetchRoleProfile("p1");
      expect(result!.projections["0_6m"].tactical).toBeGreaterThan(result!.current.tactical);
      expect(result!.projections["6_18m"].tactical).toBeGreaterThan(result!.projections["0_6m"].tactical);
      expect(result!.projections["18_36m"].tactical).toBeGreaterThan(result!.projections["6_18m"].tactical);
    });
  });

  describe("fetchPositionFit", () => {
    it("returns empty array when no video analyses", async () => {
      setupSupabaseMock([]);
      const result = await fetchPositionFit("p1");
      expect(result).toEqual([]);
    });

    it("returns positions from profile when available", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("fail"));

      const result = await fetchPositionFit("p1");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("code");
      expect(result[0]).toHaveProperty("score");
    });
  });

  describe("fetchArchetypes", () => {
    it("returns empty array when no video analyses", async () => {
      setupSupabaseMock([]);
      const result = await fetchArchetypes("p1");
      expect(result).toEqual([]);
    });
  });

  describe("fetchAuditIndicators", () => {
    it("returns evidence from video when available", async () => {
      setupSupabaseMock([makeVideoAnalysis()]);
      mockBuildRoleProfile.mockRejectedValue(new Error("fail"));

      const result = await fetchAuditIndicators("p1");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("indicator");
      expect(result[0]).toHaveProperty("explanation");
    });

    it("returns empty when no data", async () => {
      setupSupabaseMock([]);
      const result = await fetchAuditIndicators("p1");
      expect(result).toEqual([]);
    });
  });
});
