/**
 * VITAS · Referencia del jugador (dorsal + color) en la UI y advertencia de identidad.
 *
 * identidad.md: la identidad del menor se establece SOLO por dorsal + color de
 * equipación (nunca la cara). La identificación de Gemini es una estimación de IA sin
 * ground truth ⇒ la vista del análisis la advierte de forma determinista y reduce la
 * confianza de lo derivado.
 *
 *  1. Los inputs del Lab / subidor envían el dorsal y el color a /api/videos/finalize.
 *  2. La vista del análisis muestra la insignia (3 variantes) y reduce la confianza.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { render, screen, fireEvent, waitFor, act, renderHook } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import esTranslations from "@/i18n/es.json";

const testI18n = vi.hoisted(() => ({ instance: null as unknown as typeof import("i18next").default }));

vi.mock("@/i18n", () => ({
  get default() {
    return testI18n.instance;
  },
}));
vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: async () => ({ Authorization: "Bearer test" }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_CONFIGURED: false }));
vi.mock("@/lib/demoMode", () => ({ IS_DEMO: false }));
vi.mock("@/components/PeerBenchmark", () => ({ default: () => null }));
vi.mock("@/components/intelligence/DrillRecommendations", () => ({ default: () => null }));
vi.mock("framer-motion", () => {
  const motion = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
          const rest = { ...props };
          for (const k of ["initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap", "layout"]) {
            delete (rest as Record<string, unknown>)[k];
          }
          const Tag = prop as unknown as React.ElementType;
          return <Tag {...rest}>{children}</Tag>;
        },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</> };
});

// tus: la subida "termina" al instante (el test es sobre el body de finalize).
vi.mock("tus-js-client", () => ({
  Upload: class {
    private opts: { onSuccess?: () => void };
    constructor(_file: unknown, opts: { onSuccess?: () => void }) {
      this.opts = opts;
    }
    start() {
      this.opts.onSuccess?.();
    }
    abort() {}
  },
}));

testI18n.instance = i18next.createInstance();
testI18n.instance.use(initReactI18next).init({
  lng: "es",
  fallbackLng: "es",
  resources: { es: { translation: esTranslations } },
  interpolation: { escapeValue: false },
});

function renderEs(ui: ReactElement) {
  return render(<I18nextProvider i18n={testI18n.instance}>{ui}</I18nextProvider>);
}

import PlayerReferenceFields from "@/components/video/PlayerReferenceFields";
import AnalysisIdentityBadge from "@/components/analysis/AnalysisIdentityBadge";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { VideoUploader } from "@/components/video/VideoUploader";
import { usePlayerAnalysisV2 } from "@/hooks/usePlayerAnalysisV2";
import { resolveAnalysisIdentity } from "@/lib/reports/analysisIdentity";
import { mapV2ToReport } from "@/pages/vitasLab/reportMapping";

// ── Fixtures: biomechanics tal y como lo persiste api/_lib/geminiBiomechanics.ts ──
const BM_DORSAL = {
  provenance: "ESTIMADA_LLM",
  identity: { status: "identificado", confidence: "media", method: "dorsal_y_color", attributable: true, verifiedByDorsal: true },
  gemini_observation: {
    identificacion: { estado: "identificado", metodo: "dorsal_y_color", dorsalObservado: "10", colorObservado: "rojo", confianza: "media" },
  },
};
const BM_SINGLE = {
  provenance: "ESTIMADA_LLM",
  identity: { status: "unico_jugador", confidence: "alta", method: "unico_jugador_en_plano", attributable: true, verifiedByDorsal: false },
  gemini_observation: { identificacion: { estado: "unico_jugador", metodo: "unico_jugador_en_plano", confianza: "alta" } },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function finalizeBodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes("/api/videos/finalize"))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── 1. Inputs ───────────────────────────────────────────────────────────────

describe("PlayerReferenceFields", () => {
  it("el dorsal solo admite 1-3 dígitos (nunca se «completa»)", () => {
    const onJersey = vi.fn();
    renderEs(<PlayerReferenceFields jerseyNumber="" kitColor="" onJerseyNumberChange={onJersey} onKitColorChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Dorsal"), { target: { value: "1a2b34" } });
    expect(onJersey).toHaveBeenCalledWith("123");
  });

  it("el color se elige de una lista con nombre y se envía el nombre del prompt", () => {
    const onKit = vi.fn();
    renderEs(<PlayerReferenceFields jerseyNumber="" kitColor="" onJerseyNumberChange={vi.fn()} onKitColorChange={onKit} />);
    fireEvent.change(screen.getByLabelText("Color de la camiseta"), { target: { value: "azul marino" } });
    expect(onKit).toHaveBeenCalledWith("azul marino");
  });

  it("copy honesto: necesario con varios jugadores; incompleto ⇒ aviso; completo ⇒ nunca por la cara", () => {
    const { rerender } = renderEs(
      <PlayerReferenceFields jerseyNumber="" kitColor="" onJerseyNumberChange={vi.fn()} onKitColorChange={vi.fn()} />,
    );
    expect(screen.getByText(/Necesario para analizar a un jugador en un vídeo con varios jugadores/)).toBeInTheDocument();
    rerender(
      <I18nextProvider i18n={testI18n.instance}>
        <PlayerReferenceFields jerseyNumber="10" kitColor="" onJerseyNumberChange={vi.fn()} onKitColorChange={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("player-reference-incomplete")).toBeInTheDocument();
    rerender(
      <I18nextProvider i18n={testI18n.instance}>
        <PlayerReferenceFields jerseyNumber="10" kitColor="rojo" onJerseyNumberChange={vi.fn()} onKitColorChange={vi.fn()} />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("player-reference-complete")).toHaveTextContent(/nunca por la cara/);
  });
});

describe("usePlayerAnalysisV2.analyzeExistingVideo → finalize con dorsal + color", () => {
  it("envía jerseyNumber y kitColor en el body de finalize", async () => {
    // Sin análisis previo completado: by-video devuelve primero nada y luego el completado.
    let first = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/analyses/by-video")) {
        if (first) { first = false; return jsonResponse({ data: { analysis: null } }); }
        return jsonResponse({ data: { analysis: { id: "an-1", status: "completed" } } });
      }
      if (url.includes("/api/videos/finalize")) return jsonResponse({ data: { ready: true, queued: true } });
      if (url.includes("/api/analyses/reports")) {
        return jsonResponse({ success: true, data: { analysis: { id: "an-1", video_id: "v1", biomechanics: BM_DORSAL }, reports: [] } });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePlayerAnalysisV2());
    await act(async () => {
      await result.current.analyzeExistingVideo({
        videoId: "v1",
        bunnyVideoId: "g1",
        playerId: "p1",
        playerReference: { jerseyNumber: "10", kitColor: "rojo" },
      });
    });
    expect(finalizeBodies(fetchMock)[0]).toMatchObject({ playerId: "p1", jerseyNumber: "10", kitColor: "rojo" });
  });

  it("sin referencia tecleada ⇒ las claves van a null (no se inventa ninguna)", async () => {
    let first = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/analyses/by-video")) {
        if (first) { first = false; return jsonResponse({ data: { analysis: null } }); }
        return jsonResponse({ data: { analysis: { id: "an-1", status: "completed" } } });
      }
      if (url.includes("/api/videos/finalize")) return jsonResponse({ data: { ready: true } });
      return jsonResponse({ success: true, data: { analysis: { id: "an-1" }, reports: [] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePlayerAnalysisV2());
    await act(async () => {
      await result.current.analyzeExistingVideo({
        videoId: "v1",
        bunnyVideoId: "g1",
        playerId: "p1",
        playerReference: { jerseyNumber: "", kitColor: "" },
      });
    });
    const body = finalizeBodies(fetchMock)[0];
    expect(body.jerseyNumber).toBeNull();
    expect(body.kitColor).toBeNull();
  });
});

describe("VideoUploader (diálogo de subida + análisis) → finalize con dorsal + color", () => {
  it("lo tecleado en el formulario llega al body de finalize", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/videos/create-upload")) {
        return jsonResponse({
          success: true,
          data: { videoId: "v1", bunnyVideoId: "g1", libraryId: 1, tusUploadUrl: "https://tus.test", authorizationSignature: "s", authorizationExpire: 1 },
        });
      }
      if (url.includes("/api/videos/finalize")) return jsonResponse({ data: { ready: true, queued: true } });
      if (url.includes("/api/analyses/by-video")) return jsonResponse({ data: { analysis: { id: "an-1", status: "completed" } } });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderEs(<VideoUploader playerId="p1" playerName="Ana" />);
    const file = new File([new Uint8Array(200 * 1024)], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(document.querySelector("input[type=file]")!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Dorsal"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Color de la camiseta"), { target: { value: "blanco" } });
    fireEvent.click(screen.getByRole("button", { name: testI18n.instance.t("videoUploader.uploadButton") }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await waitFor(() => expect(finalizeBodies(fetchMock).length).toBeGreaterThan(0));
    expect(finalizeBodies(fetchMock)[0]).toMatchObject({ videoId: "v1", jerseyNumber: "7", kitColor: "blanco" });
  });
});

// ─── 2. Advertencia de identidad + confianza reducida ──────────────────────────

describe("AnalysisIdentityBadge · variantes deterministas", () => {
  it("dorsal estimado por IA: dorsal · color · confianza", () => {
    renderEs(<AnalysisIdentityBadge caveat={resolveAnalysisIdentity(BM_DORSAL)} />);
    const badge = screen.getByTestId("analysis-identity-badge");
    expect(badge).toHaveAttribute("data-kind", "dorsal_llm");
    expect(badge).toHaveTextContent("Identificación estimada por IA: dorsal 10 · color Rojo · confianza media");
    expect(badge).toHaveTextContent(/ninguna persona lo ha verificado/);
  });

  it("único jugador en plano (sin dorsal de referencia)", () => {
    renderEs(<AnalysisIdentityBadge caveat={resolveAnalysisIdentity(BM_SINGLE)} />);
    expect(screen.getByTestId("analysis-identity-badge")).toHaveTextContent("Único jugador en plano (sin dorsal de referencia)");
  });

  it("análisis completado sin identificacion ⇒ «Identificación no verificada»", () => {
    renderEs(<AnalysisIdentityBadge caveat={resolveAnalysisIdentity({ drillScore: 60 })} />);
    expect(screen.getByTestId("analysis-identity-badge")).toHaveTextContent("Identificación no verificada");
  });

  it("nunca menciona la cara ni rasgos faciales como método", () => {
    for (const bm of [BM_DORSAL, BM_SINGLE, null]) {
      const { unmount } = renderEs(<AnalysisIdentityBadge caveat={resolveAnalysisIdentity(bm)} />);
      expect(screen.getByTestId("analysis-identity-badge").textContent ?? "").not.toMatch(/cara|facial|rostro/i);
      unmount();
    }
  });
});

describe("ReportConfidenceChip · confianza reducida por identidad", () => {
  it("sin factor: la confianza del informe tal cual", () => {
    renderEs(<ReportConfidenceChip report={{ confidence_score: 80 }} />);
    expect(screen.getByTestId("report-confidence-score")).toHaveTextContent("Confianza 80%");
    expect(screen.queryByTestId("report-confidence-identity-reduced")).toBeNull();
  });

  it("con factor de identidad: se reduce y la UI lo indica", () => {
    renderEs(<ReportConfidenceChip report={{ confidence_score: 80 }} identityFactor={0.5} />);
    expect(screen.getByTestId("report-confidence-score")).toHaveTextContent("Confianza 40%");
    expect(screen.getByTestId("report-confidence-identity-reduced")).toHaveTextContent("reducida: identidad no verificada");
  });
});

describe("AnalysisDashboard · insignia arriba + confianza de TODOS los informes reducida", () => {
  function stubReports(biomechanics: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          data: {
            analysis: { id: "an-1", status: "completed", vsi: null, phv: null, similarity: null, biomechanics, completed_at: null, player_id: "p1", video_id: "v1" },
            reports: [
              { report_type: "player-report", content: { confidence_score: 80, executive_summary: "Resumen" }, model: "m", prompt_version: "v", generated_at: "" },
            ],
          },
        }),
      ),
    );
  }

  it("identificado por dorsal (IA, confianza media) ⇒ insignia + 80% × factor", async () => {
    stubReports(BM_DORSAL);
    renderEs(<AnalysisDashboard analysisId="an-1" />);
    const badge = await screen.findByTestId("analysis-identity-badge");
    expect(badge).toHaveTextContent("dorsal 10 · color Rojo · confianza media");
    const scores = await screen.findAllByTestId("report-confidence-score");
    // factor dorsal_llm.media (0.6): 80 → 48
    expect(scores[0]).toHaveTextContent("Confianza 48%");
    expect(screen.getAllByTestId("report-confidence-identity-reduced").length).toBeGreaterThan(0);
  });

  it("sin identificación guardada ⇒ «Identificación no verificada» y confianza reducida", async () => {
    stubReports(null);
    renderEs(<AnalysisDashboard analysisId="an-1" />);
    expect(await screen.findByTestId("analysis-identity-badge")).toHaveTextContent("Identificación no verificada");
    const scores = await screen.findAllByTestId("report-confidence-score");
    expect(scores[0]).toHaveTextContent("Confianza 40%");
  });
});

describe("Lab · mapV2ToReport lleva la advertencia y reduce la confianza", () => {
  it("confianza del VSI × factor de identidad; null sigue null", () => {
    const base = { analysisId: "a", videoId: "v", phv: null, similarity: null, scanning: null, completedAt: null,
      reports: [{ report_type: "player-report", content: {}, model: "m", prompt_version: "v" }] };
    const r = mapV2ToReport({ ...base, vsi: { vsi: 60, tier: "t", tierLabel: "t", confidence: 0.9 }, biomechanics: BM_SINGLE });
    expect(r?.identidad?.kind).toBe("single_player");
    expect(r?.confianza).toBeCloseTo(0.9 * 0.6);
    const blocked = mapV2ToReport({ ...base, vsi: null, biomechanics: BM_SINGLE });
    expect(blocked?.confianza).toBeNull();
  });
});
