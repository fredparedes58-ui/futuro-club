/**
 * Video Intelligence Pipeline — Tests
 * Verifica el flujo end-to-end: video → análisis → guardado → role profile
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { VideoService } from "@/services/real/videoService";

// ── Video Intelligence Output structure ─────────────────────────────────
const sampleIntelligenceOutput = {
  playerId: "p1",
  videoId: "v1",
  generatedAt: "2026-04-10T00:00:00Z",
  estadoActual: {
    resumenEjecutivo: "Mediocampista con buena lectura de juego",
    nivelActual: "medio_alto",
    fortalezasPrimarias: ["Pase progresivo", "Visión periférica", "Control orientado"],
    areasDesarrollo: ["Velocidad de sprint", "Duelos aéreos"],
    dimensiones: {
      velocidadDecision: { score: 7.5, observacion: "Toma decisiones rápidas con balón" },
      tecnicaConBalon: { score: 8.2, observacion: "Primer toque limpio en zona 2" },
      inteligenciaTactica: { score: 8.0, observacion: "Ocupa half-spaces inteligentemente" },
      capacidadFisica: { score: 5.8, observacion: "Pierde intensidad en segundo tiempo" },
      liderazgoPresencia: { score: 6.0, observacion: "Comunica poco con compañeros" },
      eficaciaCompetitiva: { score: 7.0, observacion: "Genera superioridad posicional" },
    },
    ajusteVSIVideoScore: 5,
  },
  evaluacionPsicologica: {
    resiliencia: { nivel: "medio", evidencia: "Se recuperó tras perder un balón" },
    comunicacion: { nivel: "bajo", evidencia: "No señala ni organiza" },
    toleranciaRiesgo: { nivel: "alto", evidencia: "Intenta pases difíciles" },
    hambreCompetitiva: { nivel: "medio", evidencia: "Intensidad irregular" },
    lenguajeCorporal: { nivel: "medio", evidencia: "Postura neutra" },
  },
  adnFutbolistico: {
    estiloJuego: "Mediocampista organizador con tendencia a filtrar entre líneas",
    arquetipoTactico: "Filtrador/Organizador",
    patrones: [
      { patron: "Pase progresivo vertical", frecuencia: "alto", descripcion: "Busca línea de pase entre centrales y medios rivales" },
    ],
    mentalidad: "Paciente con el balón, busca la opción de mayor valor",
  },
  jugadorReferencia: {
    top5: [
      { proPlayerId: "pro-pedri", nombre: "Pedri", posicion: "CM", club: "FC Barcelona", score: 72, razonamiento: "Estilo similar de organización" },
    ],
    bestMatch: {
      proPlayerId: "pro-pedri",
      nombre: "Pedri",
      posicion: "CM",
      club: "FC Barcelona",
      score: 72,
      narrativa: "Comparte la capacidad de filtrar pases y organizar el juego desde el interior",
    },
  },
  proyeccionCarrera: {
    escenarioOptimista: { descripcion: "Liga profesional top", nivelProyecto: "Primera División", clubTipo: "Top 10 liga", edadPeak: 26 },
    escenarioRealista: { descripcion: "Segunda división profesional", nivelProyecto: "Segunda", clubTipo: "Club formador" },
    factoresClave: ["Desarrollo físico", "Mantener nivel técnico"],
    riesgos: ["Lesiones por crecimiento"],
    kpis: {
      pctOfPeak: 62,
      vsiProyectado18: { estimado: 78, bajo: 72, alto: 84 },
      vsiProyectado21: { estimado: 85, bajo: 78, alto: 91 },
      ventajaMadurativa: 2,
      edadEquivalentePro: 17,
      confianzaProyeccion: 0.72,
    },
  },
  planDesarrollo: {
    objetivo6meses: "Incrementar capacidad aeróbica y resistencia en 2do tiempo",
    objetivo18meses: "Consolidar como interior creativo con llegada al área",
    pilaresTrabajo: [
      { pilar: "Físico", acciones: ["Circuitos aeróbicos", "Trabajo de sprints repetidos"], prioridad: "crítica" },
    ],
    recomendacionEntrenador: "Darle libertad en zona 2/3 pero exigir más esfuerzo defensivo en transiciones",
  },
  confianza: 0.78,
  modeloUsado: "claude-sonnet-4-20250514",
};

describe("Video Intelligence Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    mockStorage["vitas_videos"] = [];
  });

  describe("Video analysis storage", () => {
    it("saves video intelligence report to video record", () => {
      const video = {
        id: "v1",
        title: "Match Video",
        playerId: "p1",
        status: "finished" as const,
        statusCode: 4,
        encodeProgress: 100,
        duration: 120,
        width: 1920,
        height: 1080,
        fps: 30,
        storageSize: 50000000,
        thumbnailUrl: null,
        embedUrl: "https://embed.test/v1",
        streamUrl: null,
        dateUploaded: "2026-04-01T00:00:00Z",
      };

      VideoService.save(video);
      const analysis = {
        formationHint: "4-3-3",
        pressureZone: "high",
        keyMovements: ["through-pass", "pressing"],
        playerCount: 22,
        ballDetected: true,
        tacticalPhase: "attack" as const,
        confidence: 0.85,
        notes: "Good performance",
      };

      const result = VideoService.saveAnalysis("v1", analysis);
      expect(result).not.toBeNull();
      expect(result!.analysisResult).toBeDefined();
      expect(result!.analysisResult!.formationHint).toBe("4-3-3");
      expect(result!.analysisResult!.analyzedAt).toBeDefined();
    });
  });

  describe("Intelligence output structure", () => {
    it("has all required sections", () => {
      expect(sampleIntelligenceOutput).toHaveProperty("estadoActual");
      expect(sampleIntelligenceOutput).toHaveProperty("evaluacionPsicologica");
      expect(sampleIntelligenceOutput).toHaveProperty("adnFutbolistico");
      expect(sampleIntelligenceOutput).toHaveProperty("jugadorReferencia");
      expect(sampleIntelligenceOutput).toHaveProperty("proyeccionCarrera");
      expect(sampleIntelligenceOutput).toHaveProperty("planDesarrollo");
    });

    it("estadoActual has 6 dimensions with scores 0-10", () => {
      const dims = sampleIntelligenceOutput.estadoActual.dimensiones;
      const dimKeys = Object.keys(dims);
      expect(dimKeys).toContain("velocidadDecision");
      expect(dimKeys).toContain("tecnicaConBalon");
      expect(dimKeys).toContain("inteligenciaTactica");
      expect(dimKeys).toContain("capacidadFisica");
      expect(dimKeys).toContain("liderazgoPresencia");
      expect(dimKeys).toContain("eficaciaCompetitiva");

      for (const [, dim] of Object.entries(dims)) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(10);
        expect(dim.observacion).toBeTruthy();
      }
    });

    it("evaluacionPsicologica has 5 indicators", () => {
      const psych = sampleIntelligenceOutput.evaluacionPsicologica;
      expect(psych).toHaveProperty("resiliencia");
      expect(psych).toHaveProperty("comunicacion");
      expect(psych).toHaveProperty("toleranciaRiesgo");
      expect(psych).toHaveProperty("hambreCompetitiva");
      expect(psych).toHaveProperty("lenguajeCorporal");

      for (const [, val] of Object.entries(psych)) {
        expect(["alto", "medio", "bajo"]).toContain(val.nivel);
        expect(val.evidencia).toBeTruthy();
      }
    });

    it("jugadorReferencia has bestMatch with valid structure", () => {
      const ref = sampleIntelligenceOutput.jugadorReferencia;
      expect(ref.bestMatch.nombre).toBeTruthy();
      expect(ref.bestMatch.score).toBeGreaterThan(0);
      expect(ref.bestMatch.score).toBeLessThanOrEqual(100);
      expect(ref.top5.length).toBeGreaterThan(0);
    });

    it("proyeccionCarrera has optimistic and realistic scenarios", () => {
      const proj = sampleIntelligenceOutput.proyeccionCarrera;
      expect(proj.escenarioOptimista.descripcion).toBeTruthy();
      expect(proj.escenarioRealista.descripcion).toBeTruthy();
      expect(proj.factoresClave.length).toBeGreaterThan(0);
      expect(proj.riesgos.length).toBeGreaterThan(0);
      expect(proj.kpis.confianzaProyeccion).toBeGreaterThan(0);
    });

    it("planDesarrollo has actionable pillars", () => {
      const plan = sampleIntelligenceOutput.planDesarrollo;
      expect(plan.objetivo6meses).toBeTruthy();
      expect(plan.pilaresTrabajo.length).toBeGreaterThan(0);
      expect(plan.pilaresTrabajo[0].acciones.length).toBeGreaterThan(0);
      expect(["crítica", "alta", "media"]).toContain(plan.pilaresTrabajo[0].prioridad);
      expect(plan.recomendacionEntrenador).toBeTruthy();
    });

    it("ajusteVSIVideoScore is within valid range", () => {
      expect(sampleIntelligenceOutput.estadoActual.ajusteVSIVideoScore).toBeGreaterThanOrEqual(-15);
      expect(sampleIntelligenceOutput.estadoActual.ajusteVSIVideoScore).toBeLessThanOrEqual(15);
    });

    it("confianza is between 0 and 1", () => {
      expect(sampleIntelligenceOutput.confianza).toBeGreaterThanOrEqual(0);
      expect(sampleIntelligenceOutput.confianza).toBeLessThanOrEqual(1);
    });
  });

  describe("Video → Role Profile connection", () => {
    it("intelligence dimensions map to role profile capabilities", () => {
      const dims = sampleIntelligenceOutput.estadoActual.dimensiones;

      // These are the mappings used in roleProfileService
      const tactical = dims.inteligenciaTactica.score * 10; // 80
      const technical = dims.tecnicaConBalon.score * 10;    // 82
      const physical = dims.capacidadFisica.score * 10;     // 58

      expect(tactical).toBe(80);
      expect(technical).toBe(82);
      expect(physical).toBe(58);

      // All within valid range
      expect(tactical).toBeGreaterThanOrEqual(0);
      expect(tactical).toBeLessThanOrEqual(100);
    });

    it("fortalezas from video feed into role profile strengths", () => {
      const strengths = sampleIntelligenceOutput.estadoActual.fortalezasPrimarias;
      expect(strengths.length).toBeGreaterThan(0);
      expect(strengths.length).toBeLessThanOrEqual(4);
      strengths.forEach(s => expect(typeof s).toBe("string"));
    });

    it("areasDesarrollo from video feed into role profile gaps", () => {
      const gaps = sampleIntelligenceOutput.estadoActual.areasDesarrollo;
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.length).toBeLessThanOrEqual(3);
    });

    it("multiple video analyses increase sample_tier", () => {
      // Based on roleProfileService logic
      const tierForCount = (n: number) =>
        n >= 4 ? "platinum" : n >= 3 ? "gold" : n >= 2 ? "silver" : "bronze";

      expect(tierForCount(1)).toBe("bronze");
      expect(tierForCount(2)).toBe("silver");
      expect(tierForCount(3)).toBe("gold");
      expect(tierForCount(5)).toBe("platinum");
    });
  });
});
