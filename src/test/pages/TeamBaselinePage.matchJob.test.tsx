/**
 * TeamBaselinePage (/equipo/baseline) — full-match video (longer than the sync limit):
 *   - default build ("En validación"): honest refusal note, no job request;
 *   - flag on: team_baseline job (own name + own kit + attestation), then
 *     baseline-analysis with matchAnalysisId (no client URL, no invented playerContext).
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
const FULL_MATCH = { id: "bunny-guid-full", title: "Partido completo", status: "finished", duration: 5400, embedUrl: "", streamUrl: null };
vi.mock("@/services/real/videoService", () => ({
  VideoService: { getById: (id: string) => (id === FULL_MATCH.id ? FULL_MATCH : null) },
  getServerVideoUrl: () => ({ url: null, reason: "no_url" }),
}));
vi.mock("@/components/VideoUpload", () => ({
  default: ({ onDone }: { onDone?: (id: string, info: { durationSec: number | null }) => void }) => (
    <button type="button" data-testid="stub-upload" onClick={() => onDone?.(FULL_MATCH.id, { durationSec: 5400 })}>
      stub upload
    </button>
  ),
}));

import TeamBaselinePage from "@/pages/TeamBaselinePage";
import { buildObservation, buildStatus, JOB_ID, okJson } from "../fixtures/matchJob";

const fetchMock = vi.fn();
const callsTo = (path: string) => fetchMock.mock.calls.filter(([u]) => String(u).split("?")[0] === path);
const matchCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/match/"));

function renderPage(entry = "/equipo/baseline") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TeamBaselinePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  demoState.demo = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.startsWith("/api/match/list")) return okJson({ jobs: [] });
    if (u.startsWith("/api/match/start")) {
      return okJson({ jobId: JOB_ID, status: "awaiting_encode", deduplicated: false, estimate: { usd: 0.5, kind: "estimate", basis: "bunny_length", pricing_ref: "config/aiPricing.json@2026-09-28" } });
    }
    if (u.startsWith("/api/match/status")) {
      return okJson(buildStatus({ status: "completed", purpose: "team_baseline", focusTeam: "home", segmentsDone: 1, segmentsTotal: 1, observation: buildObservation([{ status: "done" }]) }));
    }
    if (u.startsWith("/api/team/baseline-analysis")) {
      return new Response(
        JSON.stringify({ success: true, data: { teamName: "CD Cantera", teamSize: 0, vsiPromedio: null, phvDistribution: { early: 0, ontime: 0, late: 0, unknown: 0 }, reports: [], reportsGenerated: 0, reportsFailed: 0 } }),
        { status: 200 },
      );
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

describe("TeamBaselinePage · full-match video", () => {
  it("default build: says full-match analysis is in validation, makes no job request, never calls the sync route", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("stub-upload"));
    expect(await screen.findByText(new RegExp(i18n.t("matchJob.validation.baselineSuffix").slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-match-form")).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(matchCalls()).toHaveLength(0);
    expect(callsTo("/api/agents/video-observation")).toHaveLength(0);
  });

  it("flag on: runs the team_baseline job, then baseline-analysis with matchAnalysisId", async () => {
    vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "true");
    renderPage();
    fireEvent.click(screen.getByTestId("stub-upload"));
    const form = await screen.findByTestId("baseline-match-form");

    fireEvent.change(document.getElementById("baseline-own-name") as HTMLInputElement, { target: { value: "CD Cantera" } });
    fireEvent.click(
      within(screen.getByTestId("kit-picker-own")).getByRole("button", {
        name: `${i18n.t("matchJob.kit.shirt")}: ${i18n.t("matchJob.kit.colour.red")}`,
      }),
    );
    const start = within(form).getByRole("button", { name: new RegExp(i18n.t("matchJob.baseline.start")) });
    expect(start).toBeDisabled(); // attestation still missing
    fireEvent.click(within(form).getByRole("checkbox"));
    expect(start).toBeEnabled();
    fireEvent.click(start);

    await waitFor(() => expect(callsTo("/api/match/start")).toHaveLength(1));
    const body = JSON.parse(callsTo("/api/match/start")[0][1].body as string);
    expect(body).toMatchObject({
      videoId: FULL_MATCH.id,
      purpose: "team_baseline",
      focusTeam: "home",
      home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F" } } },
    });
    expect(body.away).toEqual({}); // rival colour optional, never invented
    expect(body).not.toHaveProperty("playerContext");

    expect(await screen.findByText(i18n.t("matchJob.baseline.completedHint"))).toBeInTheDocument();
    const generate = screen.getByRole("button", { name: new RegExp(i18n.t("teamBaselinePage.generateButton")) });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    await waitFor(() => expect(callsTo("/api/team/baseline-analysis")).toHaveLength(1));
    const gen = JSON.parse(callsTo("/api/team/baseline-analysis")[0][1].body as string);
    expect(gen.matchAnalysisId).toBe(JOB_ID);
    expect(gen.teamName).toBe("CD Cantera");
    expect(gen).not.toHaveProperty("videoObservation");
    expect(gen).not.toHaveProperty("playerContext");
    expect(callsTo("/api/agents/video-observation")).toHaveLength(0);
  });

  it("the generated reports keep the match coverage above them: a partial video never reads as complete", async () => {
    vi.stubEnv("VITE_MATCH_VIDEO_ENABLED", "true");
    const partial = buildObservation([{ status: "done" }, { status: "failed" }]);
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/match/list")) return okJson({ jobs: [] });
      if (u.startsWith("/api/match/status")) {
        return okJson(buildStatus({ status: "completed", purpose: "team_baseline", focusTeam: "home", segmentsDone: 1, segmentsTotal: 2, observation: partial }));
      }
      if (u.startsWith("/api/team/baseline-analysis")) {
        return new Response(
          JSON.stringify({ success: true, data: { teamName: "CD Cantera", teamSize: 0, vsiPromedio: null, phvDistribution: { early: 0, ontime: 0, late: 0, unknown: 0 }, reports: [], reportsGenerated: 0, reportsFailed: 0 } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });
    renderPage(`/equipo/baseline?job=${JOB_ID}`);
    expect(await screen.findByText(i18n.t("matchJob.baseline.completedHint"))).toBeInTheDocument();
    const generate = screen.getByRole("button", { name: new RegExp(i18n.t("teamBaselinePage.generateButton")) });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);

    // Results view (the upload card is gone): coverage first, before squad/VSI/reports.
    const box = await screen.findByTestId("baseline-match-coverage");
    expect(screen.queryByTestId("baseline-match-job")).toBeNull();
    const banner = within(box).getByTestId("coverage-banner");
    expect(banner).toHaveTextContent(i18n.t("matchJob.coverage.partialNote"));
    expect(banner).not.toHaveTextContent(i18n.t("matchJob.coverage.complete"));
    expect(within(banner).getByTestId("coverage-gaps")).toHaveTextContent("MAX_TOKENS tras 2 intentos");
    expect(banner.textContent).not.toMatch(/100 %/);
    const stats = screen.getByText(i18n.t("teamBaselinePage.statSquad"));
    expect(box.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reports generated without a match job show no match coverage", async () => {
    demoState.demo = true;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("teamBaselinePage.generateButton")) }));
    expect(await screen.findByText(i18n.t("teamBaselinePage.statSquad"))).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-match-coverage")).toBeNull();
  });
});
