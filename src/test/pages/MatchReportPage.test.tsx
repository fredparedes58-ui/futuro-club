/**
 * MatchReportPage (/equipo/partido) — flows:
 *   - default build ("En validación", owner decision 29-sep): video path shown but
 *     not offered, zero /api/match requests, notes-only report fully working with
 *     its `source` passed through (fallback banners);
 *   - flag on: video path (names + required kits + attestation + video → start →
 *     status → v2 report with coverage and evidence chips), ΔE warning never
 *     blocks, upload auto-start, server refusal → "En validación";
 *   - IS_DEMO: no network at all, MOCK example under the demo banner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";

const demoState = vi.hoisted(() => ({ demo: false }));

vi.mock("@/lib/demoMode", () => ({
  get IS_DEMO() {
    return demoState.demo;
  },
  DEMO_USER: { id: "demo" },
}));
vi.mock("framer-motion", () => {
  // One stable component per tag: a new function per access would remount the subtree on every render.
  const cache = new Map<string, (p: { children?: React.ReactNode } & Record<string, unknown>) => JSX.Element>();
  const motion = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (!cache.has(prop)) {
          cache.set(prop, ({ children, ...props }) => {
            const { animate: _a, transition: _tr, initial: _i, exit: _e, ...rest } = props;
            const Tag = prop as keyof JSX.IntrinsicElements;
            return <Tag {...rest}>{children}</Tag>;
          });
        }
        return cache.get(prop);
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })) }));
vi.mock("@/components/VideoUpload", () => ({
  default: ({ onUploaded }: { onUploaded?: (id: string) => void }) => (
    <button type="button" data-testid="stub-upload" onClick={() => onUploaded?.("bunny-guid-uploaded")}>
      stub upload
    </button>
  ),
}));
vi.mock("@/hooks/useVideos", () => ({
  useVideos: () => ({ data: [{ id: "bunny-guid-existing", title: "Final juvenil", status: "finished" }] }),
}));

import MatchReportPage from "@/pages/MatchReportPage";
import { MATCH_ATTESTATION_VERSION } from "@/lib/shared/matchJob/contract";
import { provenanceLabel } from "@/components/metrics/MetricValue";
import { buildObservation, buildReport, buildStatus, errJson, JOB_ID, okJson } from "../fixtures/matchJob";

const fetchMock = vi.fn();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matchCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/match/"));
const callsTo = (path: string) => fetchMock.mock.calls.filter(([u]) => String(u).split("?")[0] === path);

function renderPage(entry = "/equipo/partido") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MatchReportPage />
    </MemoryRouter>,
  );
}

const videoTab = () => screen.getByRole("tab", { name: new RegExp(esc(i18n.t("matchJob.form.modeVideo"))) });
const notesTab = () => screen.getByRole("tab", { name: new RegExp(esc(i18n.t("matchJob.form.modeNotes"))) });
const swatch = (team: "home" | "away", colour: string) =>
  within(screen.getByTestId(`kit-picker-${team}`)).getByRole("button", {
    name: `${i18n.t("matchJob.kit.shirt")}: ${i18n.t(`matchJob.kit.colour.${colour}`)}`,
  });
const startButton = () => screen.getByRole("button", { name: new RegExp(esc(i18n.t("matchJob.form.start"))) });

function fillVideoForm({ away = "blue" }: { away?: string } = {}) {
  fireEvent.change(document.getElementById("home-name") as HTMLInputElement, { target: { value: "CD Cantera" } });
  fireEvent.change(document.getElementById("away-name") as HTMLInputElement, { target: { value: "Atlético Barrio" } });
  fireEvent.click(swatch("home", "red"));
  fireEvent.click(swatch("away", away));
  fireEvent.click(screen.getByRole("checkbox"));
}

function pickExistingVideo() {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(esc(i18n.t("matchJob.video.pickExisting"))) }));
  fireEvent.change(screen.getByRole("combobox", { name: i18n.t("matchJob.video.pickExisting") }), { target: { value: "bunny-guid-existing" } });
}

const START_OK = { jobId: JOB_ID, status: "awaiting_encode", deduplicated: false, estimate: { usd: 0.6, kind: "estimate", basis: "max_duration_cap", pricing_ref: "config/aiPricing.json@2026-09-28" } };

beforeEach(() => {
  demoState.demo = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.startsWith("/api/match/list")) return okJson({ jobs: [] });
    if (u.startsWith("/api/match/start")) return okJson(START_OK);
    if (u.startsWith("/api/match/status")) {
      const obs = buildObservation([{ status: "done" }, { status: "failed" }]);
      return okJson(buildStatus({ status: "completed", segmentsDone: 1, segmentsTotal: 2, observation: obs, report: buildReport(obs) }));
    }
    if (u.startsWith("/api/agents/team-report")) {
      return new Response(JSON.stringify({ success: true, data: { data: { report: { executive_summary: "Resumen de notas." }, source: "claude_haiku" } } }), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── default build: "En validación" ──────────────────────────────────────────

describe("MatchReportPage · default build (video analysis in validation)", () => {
  it("opens on the notes-only report and marks the video path 'En validación'", () => {
    renderPage();
    expect(notesTab()).toHaveAttribute("aria-selected", "true");
    expect(videoTab()).toHaveTextContent(i18n.t("matchJob.validation.badge"));
    expect(screen.getByText(i18n.t("matchJob.form.modeNotesHintPrimary"))).toBeInTheDocument();
  });

  it("does not offer the video path: reason shown, no form, no start, no /api/match request", async () => {
    renderPage();
    fireEvent.click(videoTab());
    expect(screen.getByTestId("match-video-in-validation")).toHaveTextContent(i18n.t("matchJob.validation.reason"));
    expect(screen.queryByTestId("kit-picker-home")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(esc(i18n.t("matchJob.form.start"))) })).toBeNull();
    // Not in the demo: no example preview.
    expect(screen.queryByRole("button", { name: i18n.t("matchJob.validation.demoPreview") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("matchJob.validation.useNotes") }));
    expect(notesTab()).toHaveAttribute("aria-selected", "true");
    await new Promise((r) => setTimeout(r, 20));
    expect(matchCalls()).toHaveLength(0);
  });

  it("ignores a ?job= left in the URL (no status poll while in validation)", async () => {
    renderPage(`/equipo/partido?job=${JOB_ID}`);
    await new Promise((r) => setTimeout(r, 20));
    expect(matchCalls()).toHaveLength(0);
    expect(screen.queryByTestId("match-job-progress")).toBeNull();
  });

  it("the notes-only report works and passes the agent's source through", async () => {
    renderPage();
    const [home, away] = screen.getAllByPlaceholderText(i18n.t("matchReportPage.teamNamePlaceholder"));
    fireEvent.change(home, { target: { value: "CD Cantera" } });
    fireEvent.change(away, { target: { value: "Atlético Barrio" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(esc(i18n.t("matchJob.form.notesGenerate"))) }));
    await screen.findByText("Resumen de notas.");
    const [, init] = callsTo("/api/agents/team-report")[0];
    const body = JSON.parse(init.body as string);
    expect(body.teamMetrics.home.name).toBe("CD Cantera");
    expect(body.teamMetrics.away.name).toBe("Atlético Barrio");
    expect(body).not.toHaveProperty("playerContext");
    expect(screen.queryByTestId("report-fallback-banner")).toBeNull();
    expect(screen.getByText(i18n.t("matchJob.form.notesResultSubtitle"))).toBeInTheDocument();
  });

  it("a notes-only mock_fallback shows the fallback banner (never looks like an analysis)", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: { data: { report: { executive_summary: "No disponible.", confidence_score: 0 }, source: "mock_fallback" } } }), { status: 200 }),
    );
    renderPage();
    const [home, away] = screen.getAllByPlaceholderText(i18n.t("matchReportPage.teamNamePlaceholder"));
    fireEvent.change(home, { target: { value: "A" } });
    fireEvent.change(away, { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(esc(i18n.t("matchJob.form.notesGenerate"))) }));
    expect(await screen.findByTestId("report-fallback-banner")).toHaveTextContent(i18n.t("matchJob.fallback.mock"));
  });
});

// ─── flag on: video path ─────────────────────────────────────────────────────

describe("MatchReportPage · video path enabled (VITE_MATCH_VIDEO_ENABLED=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "true"));

  it("requires names, both shirt colours, the attestation and a video before starting", async () => {
    renderPage();
    expect(videoTab()).toHaveAttribute("aria-selected", "true");
    expect(videoTab()).not.toHaveTextContent(i18n.t("matchJob.validation.badge"));
    expect(startButton()).toBeDisabled();
    fireEvent.change(document.getElementById("home-name") as HTMLInputElement, { target: { value: "CD Cantera" } });
    fireEvent.change(document.getElementById("away-name") as HTMLInputElement, { target: { value: "Atlético Barrio" } });
    expect(screen.getByText(i18n.t("matchJob.form.kitsRequired"))).toBeInTheDocument();
    fireEvent.click(swatch("home", "red"));
    fireEvent.click(swatch("away", "blue"));
    expect(startButton()).toBeDisabled();
    expect(screen.getAllByText(i18n.t("matchJob.errors.attestation_required")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(startButton()).toBeDisabled();
    pickExistingVideo();
    expect(startButton()).toBeEnabled();
  });

  it("starts the job with the contract body, polls status and renders the v2 report with coverage and chips", async () => {
    renderPage();
    fillVideoForm();
    pickExistingVideo();
    fireEvent.click(startButton());

    await waitFor(() => expect(callsTo("/api/match/start")).toHaveLength(1));
    const body = JSON.parse(callsTo("/api/match/start")[0][1].body as string);
    expect(body).toMatchObject({
      videoId: "bunny-guid-existing",
      purpose: "match_ab",
      home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F" } } },
      away: { name: "Atlético Barrio", kit: { shirt: { hex: "#1565C0" } } },
      attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
    });
    expect(typeof body.locale).toBe("string");
    expect(body).not.toHaveProperty("playerContext");
    expect(body).not.toHaveProperty("category"); // no default category

    expect(await screen.findByTestId("team-report-v2")).toBeInTheDocument();
    expect(callsTo("/api/match/status")[0][0]).toBe(`/api/match/status?jobId=${JOB_ID}`);
    expect(screen.getByTestId("coverage-banner")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-summary")).not.toHaveTextContent("100 %");
    expect(screen.getAllByRole("button", { name: i18n.t("matchJob.evidence.chipTitle", { time: "5:12" }) }).length).toBeGreaterThan(0);
    expect(screen.queryByText(i18n.t("teamReport.overallRating"))).toBeNull();
  });

  it("the ΔE similarity warning is advisory: the start stays enabled", () => {
    renderPage();
    fillVideoForm({ away: "maroon" });
    pickExistingVideo();
    expect(screen.getByTestId("kit-similarity-warning")).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("starts automatically when the upload finishes and the form is already complete", async () => {
    renderPage();
    fillVideoForm();
    fireEvent.click(screen.getByTestId("stub-upload"));
    await waitFor(() => expect(callsTo("/api/match/start")).toHaveLength(1));
    expect(JSON.parse(callsTo("/api/match/start")[0][1].body as string).videoId).toBe("bunny-guid-uploaded");
  });

  it("a server refusal (match_video_disabled) switches the path to 'En validación'", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/match/list") ? okJson({ jobs: [] }) : errJson("match_video_disabled", "análisis de partido completo en validación", 503),
    );
    renderPage();
    fillVideoForm();
    pickExistingVideo();
    fireEvent.click(startButton());
    const notice = await screen.findByTestId("match-video-in-validation");
    expect(notice).toHaveTextContent(i18n.t("matchJob.validation.serverRefused"));
    expect(screen.queryByTestId("kit-picker-home")).toBeNull();
    expect(videoTab()).toHaveTextContent(i18n.t("matchJob.validation.badge"));
  });

  it("resumes a job from ?job= after a reload", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/match/list")) return okJson({ jobs: [] });
      if (u.startsWith("/api/match/status")) return okJson(buildStatus({ status: "awaiting_encode" }));
      return new Response("{}", { status: 500 });
    });
    const { unmount } = renderPage(`/equipo/partido?job=${JOB_ID}`);
    expect(await screen.findByTestId("match-job-progress")).toBeInTheDocument();
    expect(await screen.findByText(i18n.t("matchJob.progress.encodeHint"))).toBeInTheDocument();
    unmount();
  });
});

// ─── demo ────────────────────────────────────────────────────────────────────

describe("MatchReportPage · IS_DEMO", () => {
  beforeEach(() => {
    demoState.demo = true;
    vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "true"); // even with the flag on, the demo never calls the job
  });

  it("offers only an explicit MOCK example of the video report, under the demo banner, with no network", async () => {
    renderPage();
    fireEvent.click(videoTab());
    expect(screen.getByTestId("match-video-in-validation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("matchJob.validation.demoPreview") }));
    const report = await screen.findByTestId("team-report-v2");
    // Exactly one MOCK banner (the view renders it; the page does not repeat it).
    expect(screen.getAllByText(i18n.t("matchJob.demo.banner"))).toHaveLength(1);
    expect(within(report).getAllByText(provenanceLabel("MOCK") as string).length).toBeGreaterThan(0);
    expect(within(report).queryByText(provenanceLabel("ESTIMADA_LLM") as string)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the notes-only report in the demo is the MOCK example, with no network", async () => {
    renderPage();
    const [home, away] = screen.getAllByPlaceholderText(i18n.t("matchReportPage.teamNamePlaceholder"));
    fireEvent.change(home, { target: { value: "A" } });
    fireEvent.change(away, { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(esc(i18n.t("matchJob.form.notesGenerate"))) }));
    expect(await screen.findByTestId("team-report-v1")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("demoData.title"))).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
