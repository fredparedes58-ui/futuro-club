/**
 * VITAS · Guard de honestidad — superficies que antes simulaban análisis de vídeo
 * o pedían datos de identidad que nunca se usaban.
 *
 * Invariantes (CLAUDE.md #1-3 · .claude/rules/metricas.md · identidad.md):
 *  - lo simulado es MOCK y exige el DemoDataBanner canónico;
 *  - no se promete un pipeline (YOLO/ByteTrack/pose) que no corre;
 *  - no se inventan metadatos de vídeo (pestaña URL retirada);
 *  - no hay campos de dorsal/color inertes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// `t` ESTABLE: HighlightDetailPage tiene un efecto con `t` en deps (un `t` nuevo por
// render re-dispararía el efecto → setReel → bucle infinito).
const i18nMock = vi.hoisted(() => {
  const t = (key: string) => key;
  return { value: { t, i18n: { language: "es", changeLanguage: () => Promise.resolve() } } };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => i18nMock.value,
}));

vi.mock("framer-motion", () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        return ({ children, ...props }: Record<string, unknown> & { children?: unknown }) => {
          const Tag = prop as unknown as React.ElementType;
          const rest = { ...props };
          for (const k of ["initial", "animate", "exit", "transition", "whileHover", "whileTap", "layout"]) {
            delete (rest as Record<string, unknown>)[k];
          }
          return <Tag {...rest}>{children as React.ReactNode}</Tag>;
        };
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// Los servicios usan la instancia i18n directamente (gate_reason traducido).
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key, language: "es" } }));

// Un vídeo REAL del usuario ya subido.
vi.mock("@/services/real/videoService", () => ({
  VideoService: {
    getAll: () => [
      {
        id: "video_real_1",
        title: "Mi partido real",
        playerId: null,
        status: "finished",
        statusCode: 4,
        encodeProgress: 100,
        duration: 1200,
        width: 1280,
        height: 720,
        fps: null,
        storageSize: 1000,
        thumbnailUrl: null,
        embedUrl: "https://iframe.mediadelivery.net/embed/1/g",
        streamUrl: "https://vz-a.b-cdn.net/g/play_720p.mp4",
        dateUploaded: "2026-05-01T00:00:00Z",
      },
    ],
    save: vi.fn(),
  },
}));
vi.mock("@/hooks/useVideos", () => ({ isLinkOnlyVideo: () => false }));
// Referencias ESTABLES: efectos que dependen de navigate/params no deben re-dispararse.
const router = vi.hoisted(() => ({
  navigate: () => {},
  params: { id: "reel_legacy" },
  search: [new URLSearchParams(), () => {}] as const,
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => router.navigate,
  useParams: () => router.params,
  useSearchParams: () => router.search,
}));
vi.mock("@/services/real/bunnyStreamService", () => ({
  uploadToBunny: vi.fn(),
  BunnyNotConfiguredError: class extends Error {},
}));

import VideoAnalyzerDialog from "@/components/setPiece/VideoAnalyzerDialog";
import VideoUploadDialog from "@/components/setPiece/VideoUploadDialog";
import GenerateReelDialog from "@/components/highlights/GenerateReelDialog";
import LabAnalysisConfig from "@/pages/vitasLab/LabAnalysisConfig";
import SetPiecePage from "@/pages/SetPiecePage";
import HighlightsPage from "@/pages/HighlightsPage";
import HighlightDetailPage from "@/pages/HighlightDetailPage";

const BANNER_TITLE = "demoData.title";

// Reel guardado ANTES del cambio: clips del simulador (manual:false) sin provenance.
const LEGACY_REEL = {
  id: "reel_legacy",
  title: "Reel antiguo",
  sourceVideoId: "video_real_1",
  sourceVideoTitle: "Mi partido real",
  sourceVideoUrl: "",
  totalDurationMs: 5000,
  clips: [
    { id: "c1", startMs: 0, endMs: 5000, moment: "goal", description: "Gol", confidence: 0.83, manual: false },
  ],
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
};

describe("Páginas con datos de ejemplo · banner canónico visible", () => {
  it("SetPiecePage: DemoDataBanner (catálogo base y «desde vídeo» son de ejemplo)", () => {
    render(<SetPiecePage />);
    expect(screen.getByText("setPiecePage.demoNotice")).toBeInTheDocument();
    expect(screen.queryByText("setPiecePage.badgeFromVideo")).toBeNull();
    // Ya no se muestra una «Confianza IA» aleatoria en las tarjetas.
    expect(screen.queryByText("Confianza IA")).toBeNull();
  });

  it("HighlightsPage: reel antiguo con clips simulados ⇒ banner + badge MOCK", () => {
    localStorage.setItem("vitas_highlight_reels", JSON.stringify([LEGACY_REEL]));
    render(<HighlightsPage />);
    expect(screen.getByText("highlightsPage.demoNotice")).toBeInTheDocument();
    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
  });

  it("HighlightDetailPage: clip simulado ⇒ banner + badge MOCK, sin «Confianza IA»", () => {
    localStorage.setItem("vitas_highlight_reels", JSON.stringify([LEGACY_REEL]));
    render(<HighlightDetailPage />);
    expect(screen.getByText("highlightDetailPage.demoNotice")).toBeInTheDocument();
    expect(screen.queryByText("highlightDetailPage.aiConfidence")).toBeNull();
    expect(screen.getAllByText("Datos de ejemplo").length).toBeGreaterThan(0);
  });
});

beforeEach(() => {
  localStorage.clear();
});

describe("VideoAnalyzerDialog · jugadas de balón parado", () => {
  it("muestra el DemoDataBanner y el motivo del bloqueo; NO promete YOLO/ByteTrack/pose", () => {
    render(<VideoAnalyzerDialog open onClose={vi.fn()} onCompleted={vi.fn()} />);
    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
    expect(screen.getByText("videoAnalyzerDialog.gateRealVideos")).toBeInTheDocument();
    expect(screen.queryByText(/pipelineTracking|pipelinePoseEstimation/)).toBeNull();
  });

  it("no ofrece «analizar» los vídeos reales del usuario (solo partidos demo)", () => {
    render(<VideoAnalyzerDialog open onClose={vi.fn()} onCompleted={vi.fn()} />);
    expect(screen.queryByText("Mi partido real")).toBeNull();
    expect(screen.getAllByText(/videoAnalyzerDialog\.demoMatch/).length).toBeGreaterThan(0);
  });
});

describe("VideoUploadDialog · sin pestaña URL que fingía la subida", () => {
  it("no existe la pestaña URL / Cloud", () => {
    render(<VideoUploadDialog open onClose={vi.fn()} onUploaded={vi.fn()} />);
    expect(screen.queryByText("videoUploadDialog.tabUrl")).toBeNull();
    expect(screen.queryByText("videoUploadDialog.urlDescription")).toBeNull();
    expect(screen.getByText("videoUploadDialog.tabDevice")).toBeInTheDocument();
  });
});

describe("GenerateReelDialog · highlights", () => {
  it("vídeo real ⇒ explica el bloqueo y solo ofrece un reel VACÍO (nada inventado)", () => {
    render(<GenerateReelDialog open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText("Mi partido real"));
    expect(screen.getByText("generateReelDialog.gateRealVideo")).toBeInTheDocument();
    expect(screen.getByText("generateReelDialog.createEmptyReel")).toBeInTheDocument();
    expect(screen.queryByText("generateReelDialog.generateReel")).toBeNull();
  });

  it("partido demo ⇒ DemoDataBanner (reel de ejemplo)", () => {
    render(<GenerateReelDialog open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText("vs Rival FC · 24 May"));
    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
    expect(screen.getByText("generateReelDialog.exampleNotice")).toBeInTheDocument();
  });
});

describe("LabAnalysisConfig · sin campos de dorsal/color inertes", () => {
  const noop = vi.fn();
  const baseProps: Omit<React.ComponentProps<typeof LabAnalysisConfig>, "selectedMode"> = {
    setSelectedMode: noop,
    playerName: "",
    setPlayerName: noop,
    playerPosition: "",
    setPlayerPosition: noop,
    homeFormation: "4-3-3",
    setHomeFormation: noop,
    awayFormation: "4-4-2",
    setAwayFormation: noop,
    playedPosition: "",
    setPlayedPosition: noop,
    analysisFocus: [],
    setAnalysisFocus: noop,
    isClub: true,
    setShowUpgradePrompt: noop,
    selectedPlayerId: null,
    players: [],
  };

  it.each(["all", "click", "team", "player"])("modo %s: no pide dorsal ni color de equipación", (mode) => {
    render(<LabAnalysisConfig {...baseProps} selectedMode={mode} />);
    for (const key of [
      "vitasLab.jerseyNumber",
      "vitasLab.jerseyNumberRequired",
      "vitasLab.uniformColor",
      "vitasLab.uniformColorRequired",
      "vitasLab.homeTeamColor",
      "vitasLab.awayTeamColor",
      "vitasLab.rivalTeamColor",
      "vitasLab.homeColor",
      "vitasLab.awayColor",
    ]) {
      expect(screen.queryByText(key)).toBeNull();
    }
  });
});
