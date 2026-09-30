/**
 * TeamAnalysisPage — identity (identidad.md, P0 minors).
 *
 * The legacy team report showed a shirt number GUESSED by the LLM
 * (`{j.dorsalEstimado ?? "?"}`) next to per-player passes / duels / recoveries,
 * and a detail sheet with speed, distance and a "#7" heat map. Without a
 * validated dorsal layer nothing may be attributed to a specific child, so the
 * page is team level only. Reports saved before the fix still hold those rows
 * in the database: they render without the dorsal, without per-player rows and
 * with a short honest note.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import es from "@/i18n/es.json";
import en from "@/i18n/en.json";
import itJson from "@/i18n/it.json";
import deJson from "@/i18n/de.json";
import frJson from "@/i18n/fr.json";
import nlJson from "@/i18n/nl.json";
import es419Json from "@/i18n/es-419.json";

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
        const { animate: _a, transition: _t, initial: _i, exit: _e, ...rest } = props;
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...rest}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/VideoUpload", () => ({ default: () => <div data-testid="video-upload" /> }));
vi.mock("@/components/PlayerHeatmap", () => ({ default: () => <div data-testid="player-heatmap" /> }));

vi.mock("@/services/real/videoService", () => ({
  VideoService: { getAll: () => [], getById: () => undefined },
}));

const hookData: { analysisResult: unknown; saved: unknown[] } = { analysisResult: null, saved: [] };
vi.mock("@/hooks/useTeamIntelligence", () => ({
  useTeamIntelligence: () => ({
    state: { step: "idle", progress: 0, message: "", gateReason: null },
    isAnalyzing: false,
    isLoading: false,
    analysisResult: hookData.analysisResult,
    runAnalysis: vi.fn(),
    reset: vi.fn(),
  }),
  useAllTeamAnalyses: () => ({ data: hookData.saved }),
}));

import TeamAnalysisPage from "@/pages/TeamAnalysisPage";

/** Dorsals chosen so that no other number on the page can collide with them. */
const DORSAL_A = "47";
const DORSAL_B = "86";

const TEAM_PART = {
  videoId: "v-old",
  generatedAt: "2026-07-01T10:00:00.000Z",
  equipoAnalizado: { colorUniforme: "rojo", jugadoresDetectados: 9 },
  formacion: { sistema: "4-3-3", variantes: [], rigidez: 5 },
  posesion: { porcentaje: 52, estiloCirculacion: "corta", zonasDominadas: [] },
  fasesJuego: {
    pressing: { tipo: "medio", alturaLinea: "media", intensidad: 6, descripcion: "Presión coordinada de los delanteros." },
    transiciones: {
      ofensiva: { velocidad: "media", patron: "directo", descripcion: "Buscan la banda." },
      defensiva: { velocidad: "media", patron: "repliegue", descripcion: "Repliegue ordenado." },
    },
  },
  metricasColectivas: { compacidad: 6, alturaLineaDefensiva: "media", amplitud: 6, sincronizacion: 5, descripcion: "Bloque junto." },
  evaluacionGeneral: { fortalezasEquipo: ["Salida desde atrás"], areasTrabajar: ["Distancias"], recomendaciones: ["Rondos 4v2"] },
  confianza: 0.5,
};

/** A report saved BEFORE the fix: guessed dorsals + per-player figures + a text naming "#47". */
const OLD_SAVED_REPORT = {
  ...TEAM_PART,
  resumenEjecutivo: `El #${DORSAL_A} desborda una y otra vez por la derecha.`,
  jugadores: [
    {
      dorsalEstimado: DORSAL_A, posicion: "extremo derecho", rol: "desborde por banda", rendimiento: "destacado",
      velocidadMaxKmh: 31.3, distanciaM: 6123, pases: { completados: 8, fallados: 2 },
      duelos: { ganados: 3, perdidos: 1 }, recuperaciones: 4, resumen: "Desequilibra en cada ataque",
      heatmapPositions: [{ fx: 80, fy: 20 }],
    },
    {
      dorsalEstimado: DORSAL_B, posicion: "pivote defensivo", rol: "equilibrio", rendimiento: "bueno",
      velocidadMaxKmh: null, distanciaM: null, pases: { completados: 19, fallados: 1 },
      duelos: { ganados: 5, perdidos: 2 }, recuperaciones: 7, resumen: "Ordena al equipo",
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamAnalysisPage />
    </MemoryRouter>,
  );
}

function openReportTab() {
  fireEvent.click(screen.getByRole("button", { name: i18n.t("teamAnalysisPage.tabReport") }));
}

describe("TeamAnalysisPage · identity (team level only)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
    hookData.analysisResult = null;
    hookData.saved = [];
  });

  it("an old saved report with LLM-guessed dorsals shows no dorsal and no per-player rows", () => {
    hookData.saved = [{ video_id: "v-old", created_at: "2026-07-01T10:00:00.000Z", report: OLD_SAVED_REPORT }];
    const { container } = renderPage();
    openReportTab();

    const text = container.textContent ?? "";
    // No guessed shirt number, anywhere (not even inside the summary text).
    expect(text).not.toContain(DORSAL_A);
    expect(text).not.toContain(DORSAL_B);
    // No per-player rows: positions, roles, per-player figures or detail sheet.
    expect(text).not.toContain("extremo derecho");
    expect(text).not.toContain("pivote defensivo");
    expect(text).not.toContain("Desequilibra en cada ataque");
    expect(text).not.toContain("80%"); // pass accuracy 8/(8+2) of the "#47" row
    expect(text).not.toContain("95%"); // pass accuracy 19/(19+1) of the "#86" row
    expect(text).not.toContain("31.3");
    expect(text).not.toContain("6123");
    // The old table heading ("Jugadores" / "Toca un jugador para ver detalle y mapa de calor").
    expect(text).not.toMatch(/mapa de calor/i);
    expect(screen.queryByText("Jugadores")).toBeNull();
    expect(screen.queryByTestId("player-heatmap")).toBeNull();

    // A short honest note says what was withheld and why.
    const note = screen.getByTestId("team-identity-withheld");
    expect(note).toHaveTextContent(i18n.t("teamAnalysisPage.perPlayerWithheld"));
    expect(note).toHaveTextContent(i18n.t("teamAnalysisPage.individualTextsHidden", { n: 1 }));

    // Team-level content is still there.
    expect(screen.getByText("4-3-3")).toBeInTheDocument();
    expect(screen.getByText("Presión coordinada de los delanteros.")).toBeInTheDocument();
    expect(screen.getByText(/Rondos 4v2/)).toBeInTheDocument();
  });

  it("a live result that still carries per-player rows is shown team level only too", () => {
    hookData.analysisResult = { ...OLD_SAVED_REPORT, resumenEjecutivo: "Bloque medio ordenado." };
    const { container } = renderPage();
    openReportTab();

    const text = container.textContent ?? "";
    expect(text).not.toContain(DORSAL_A);
    expect(text).not.toContain(DORSAL_B);
    expect(text).not.toContain("extremo derecho");
    const note = screen.getByTestId("team-identity-withheld");
    expect(note).toHaveTextContent(i18n.t("teamAnalysisPage.perPlayerWithheld"));
    expect(within(note).queryByText(i18n.t("teamAnalysisPage.individualTextsHidden", { n: 1 }))).toBeNull();
    expect(screen.getByText("Bloque medio ordenado.")).toBeInTheDocument();
  });

  it("a team-level report shows no withheld note", () => {
    hookData.saved = [{ video_id: "v-new", created_at: "2026-09-30T10:00:00.000Z", report: { ...TEAM_PART, resumenEjecutivo: "Bloque medio." } }];
    renderPage();
    openReportTab();
    expect(screen.queryByTestId("team-identity-withheld")).toBeNull();
    expect(screen.getByText("Bloque medio.")).toBeInTheDocument();
  });

  it("the new-analysis hint no longer promises per-player metrics", () => {
    renderPage();
    const hint = i18n.t("teamAnalysisPage.aiAnalysisHint");
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(hint).not.toMatch(/métricas por jugador/i);
  });
});

describe("TeamAnalysisPage · identity i18n (7 locales)", () => {
  const LOCALES: Record<string, { teamAnalysis: Record<string, string>; teamAnalysisPage: Record<string, string> }> = {
    es, en, it: itJson, de: deJson, fr: frJson, nl: nlJson, "es-419": es419Json,
  };
  const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();

  // The per-player table and detail sheet are gone, and so are their strings
  // (including the "Mapa de Calor — #{{number}}" shirt-number template).
  const REMOVED = {
    teamAnalysis: ["playersTitle", "playersDesc", "passes", "duels", "recoveries"],
    teamAnalysisPage: ["role", "passes", "duels", "wonAbbr", "lostAbbr", "recoveriesCount", "speed", "distance", "heatmapTitle"],
  } as const;
  it("the per-player table / sheet strings no longer exist in any locale", () => {
    for (const [code, json] of Object.entries(LOCALES)) {
      for (const [block, keys] of Object.entries(REMOVED) as [keyof typeof REMOVED, readonly string[]][]) {
        const present = Object.keys(json[block]);
        expect(present.length, `${code}.${block} still exists`).toBeGreaterThan(0);
        for (const key of keys) {
          expect(present.filter((k) => k === key || k.startsWith(`${key}_`)), `${code}.${block}.${key}`).toEqual([]);
        }
      }
      expect(JSON.stringify(json.teamAnalysisPage), code).not.toContain("#{{");
    }
  });

  // The user guide described the team analysis as including "rendimiento por jugador".
  it("the user guide no longer promises per-player performance for the team analysis", () => {
    const OLD_PROMISES = [
      /rendimiento por jugador/i, /per-player performance/i, /rendimento per giocatore/i,
      /performance par joueur/i, /Leistung pro Spieler/i, /prestaties per speler/i,
    ];
    const guides: Record<string, { userGuide: { video: { teamText: string } } }> = {
      es, en, it: itJson, de: deJson, fr: frJson, nl: nlJson, "es-419": es419Json,
    };
    for (const [code, json] of Object.entries(guides)) {
      const text = json.userGuide.video.teamText;
      expect(text.trim().length, code).toBeGreaterThan(0);
      for (const re of OLD_PROMISES) expect(text, code).not.toMatch(re);
    }
  });

  for (const key of ["perPlayerWithheld", "individualTextsHidden", "aiAnalysisHint"]) {
    it(`teamAnalysisPage.${key} exists, is non-empty and has the same variables in every locale`, () => {
      const esVars = vars(es.teamAnalysisPage[key as keyof typeof es.teamAnalysisPage]);
      for (const [code, json] of Object.entries(LOCALES)) {
        const value = json.teamAnalysisPage[key];
        expect(typeof value, `${code}.${key}`).toBe("string");
        expect(value.trim().length, `${code}.${key}`).toBeGreaterThan(0);
        expect(vars(value), `${code}.${key}`).toEqual(esVars);
      }
    });
  }
});
