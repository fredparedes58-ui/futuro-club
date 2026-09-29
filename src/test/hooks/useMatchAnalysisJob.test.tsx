/**
 * useMatchAnalysisJob — polling (10 s → ×1.5 → 30 s cap, reset on progress, stop at
 * a terminal status), ?job=<id> persistence, resume via /api/match/list, and zero
 * network when disabled (IS_DEMO / "En validación"). fetch is mocked against the
 * shared contract (the backend is built in parallel).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })) }));

import { nextPollDelaySec, useMatchAnalysisJob } from "@/hooks/useMatchAnalysisJob";
import { MATCH_ATTESTATION_VERSION } from "@/lib/shared/matchJob/contract";
import { buildStatus, errJson, JOB_ID, JOB_ID_2, okJson, VIDEO_ID } from "../fixtures/matchJob";

type StatusReply = () => Response | Promise<Response>;

const fetchMock = vi.fn();
let statusReplies: StatusReply[] = [];
let listJobs: unknown[] = [];
const loc = { search: "" };

function Probe() {
  loc.search = useLocation().search;
  return null;
}
const wrapperAt = (entry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[entry]}>
        {children}
        <Probe />
      </MemoryRouter>
    );
  };

const statusCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/match/status"));
const calls = (prefix: string) => fetchMock.mock.calls.filter(([u]) => String(u).startsWith(prefix));

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const listItem = (jobId: string, purpose: string, status: string, stage: string, createdAt = "2026-09-28T10:00:00Z") => ({
  jobId, videoId: VIDEO_ID, purpose, status, stage, homeName: "A", awayName: "B", createdAt,
  finishedAt: ["completed", "failed", "cancelled"].includes(status) ? createdAt : null,
});

beforeEach(() => {
  vi.useFakeTimers();
  statusReplies = [() => okJson(buildStatus({ status: "observing", segmentsDone: 0, segmentsTotal: 7, currentSegmentIdx: 0 }))];
  listJobs = [];
  loc.search = "";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    if (u.startsWith("/api/match/list")) return okJson({ jobs: listJobs });
    if (u.startsWith("/api/match/status")) {
      const reply = statusReplies.length > 1 ? statusReplies.shift()! : statusReplies[0];
      return reply();
    }
    if (u === "/api/match/start" && init.method === "POST") {
      return okJson({ jobId: JOB_ID, status: "awaiting_encode", deduplicated: false, estimate: { usd: 0.6, kind: "estimate", basis: "max_duration_cap", pricing_ref: "config/aiPricing.json@2026-09-28" } });
    }
    if (u === "/api/match/cancel") return okJson({ jobId: JOB_ID, status: "cancelled" });
    return new Response("{}", { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("nextPollDelaySec", () => {
  const cfg = { initial: 10, max: 30, factor: 1.5 };
  it("starts at 10 s, grows ×1.5 while nothing changes, caps at 30 s, resets on progress", () => {
    expect(nextPollDelaySec(null, false, cfg)).toBe(10);
    expect(nextPollDelaySec(10, false, cfg)).toBe(15);
    expect(nextPollDelaySec(15, false, cfg)).toBe(23);
    expect(nextPollDelaySec(23, false, cfg)).toBe(30);
    expect(nextPollDelaySec(30, false, cfg)).toBe(30);
    expect(nextPollDelaySec(30, true, cfg)).toBe(10);
  });
  it("uses config/matchVideoUi.json by default (10 → 30 s)", () => {
    expect(nextPollDelaySec(null, false)).toBe(10);
    expect(nextPollDelaySec(1000, false)).toBe(30);
  });
});

describe("useMatchAnalysisJob · polling", () => {
  it("polls every 10 s and backs off to 30 s while the job does not change", async () => {
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/equipo/partido?job=${JOB_ID}`) });
    await flush();
    expect(statusCalls()).toHaveLength(1);
    expect(statusCalls()[0][0]).toBe(`/api/match/status?jobId=${JOB_ID}`);
    expect(result.current.data?.job.status).toBe("observing");
    expect(result.current.nextPollInSec).toBe(10);

    await advance(9_999);
    expect(statusCalls()).toHaveLength(1);
    await advance(1);
    expect(statusCalls()).toHaveLength(2);
    expect(result.current.nextPollInSec).toBe(15);

    await advance(15_000);
    expect(statusCalls()).toHaveLength(3);
    expect(result.current.nextPollInSec).toBe(23);
    await advance(23_000);
    expect(statusCalls()).toHaveLength(4);
    expect(result.current.nextPollInSec).toBe(30);
    await advance(30_000);
    expect(statusCalls()).toHaveLength(5);
    expect(result.current.nextPollInSec).toBe(30);
  });

  it("goes back to 10 s as soon as the job progresses (new segment)", async () => {
    const seg0 = () => okJson(buildStatus({ status: "observing", segmentsDone: 0, segmentsTotal: 7, currentSegmentIdx: 0 }));
    const seg1 = () => okJson(buildStatus({ status: "observing", segmentsDone: 1, segmentsTotal: 7, currentSegmentIdx: 1 }));
    statusReplies = [seg0, seg0, seg1];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    await advance(10_000);
    expect(result.current.nextPollInSec).toBe(15);
    await advance(15_000);
    expect(statusCalls()).toHaveLength(3);
    expect(result.current.data?.progress.segmentsDone).toBe(1);
    expect(result.current.nextPollInSec).toBe(10);
  });

  it("stops polling at a terminal status", async () => {
    statusReplies = [
      () => okJson(buildStatus({ status: "reporting", segmentsDone: 7, segmentsTotal: 7 })),
      () => okJson(buildStatus({ status: "completed", segmentsDone: 7, segmentsTotal: 7 })),
    ];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    await advance(10_000);
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.nextPollInSec).toBeNull();
    await advance(120_000);
    expect(statusCalls()).toHaveLength(2);
  });

  it("keeps polling (with backoff) after a transient network error, stops after a fatal one", async () => {
    statusReplies = [() => Promise.reject(new TypeError("Failed to fetch")), () => okJson(buildStatus({ status: "observing", segmentsTotal: 7 }))];
    const { result, unmount } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    expect(result.current.error?.code).toBe("network");
    expect(result.current.nextPollInSec).toBe(10);
    await advance(10_000);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.job.status).toBe("observing");
    unmount();

    fetchMock.mockClear();
    statusReplies = [() => new Response("{}", { status: 404 })];
    const second = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    expect(second.result.current.error?.code).toBe("not_found");
    await advance(120_000);
    expect(statusCalls()).toHaveLength(1);
  });
});

describe("useMatchAnalysisJob · persistence and resume", () => {
  it("start() stores ?job=<id> in the URL and polls that job", async () => {
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt("/equipo/partido") });
    await flush();
    expect(result.current.jobId).toBeNull();
    let res: Awaited<ReturnType<typeof result.current.start>> = null;
    await act(async () => {
      res = await result.current.start({
        videoId: VIDEO_ID,
        home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F" } } },
        away: { name: "Atlético Barrio", kit: { shirt: { hex: "#1565C0" } } },
        locale: "es",
        attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
      });
    });
    expect(res).not.toBeNull();
    const startBody = JSON.parse(calls("/api/match/start")[0][1].body as string);
    expect(startBody.purpose).toBe("match_ab");
    await flush();
    expect(loc.search).toBe(`?job=${JOB_ID}`);
    expect(result.current.jobId).toBe(JOB_ID);
    const polled = statusCalls();
    expect(polled[polled.length - 1]?.[0]).toBe(`/api/match/status?jobId=${JOB_ID}`);
  });

  it("surfaces a start refusal (e.g. match_video_disabled) as startError and keeps no job", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/match/list") ? okJson({ jobs: [] }) : errJson("match_video_disabled", "en validación", 503),
    );
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt("/") });
    await flush();
    await act(async () => {
      await result.current.start({
        videoId: VIDEO_ID,
        home: { name: "A", kit: { shirt: { hex: "#D32F2F" } } },
        away: { name: "B", kit: { shirt: { hex: "#1565C0" } } },
        locale: "es",
        attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
      });
    });
    expect(result.current.startError?.code).toBe("match_video_disabled");
    expect(result.current.jobId).toBeNull();
    expect(loc.search).toBe("");
  });

  it("after a reload without ?job=, re-opens the newest ACTIVE job of this purpose via /api/match/list", async () => {
    listJobs = [
      listItem(JOB_ID_2, "team_baseline", "observing", "analysing", "2026-09-28T12:00:00Z"),
      listItem(JOB_ID, "match_ab", "awaiting_encode", "encoding", "2026-09-28T11:00:00Z"),
      listItem("11111111-2222-4333-8444-555555555555", "match_ab", "completed", "done", "2026-09-27T11:00:00Z"),
    ];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt("/equipo/partido") });
    await flush();
    await flush();
    expect(loc.search).toBe(`?job=${JOB_ID}`);
    expect(result.current.recentJobs.map((j) => j.purpose)).toEqual(["match_ab", "match_ab"]);
  });

  it("never overrides a job already in the URL", async () => {
    listJobs = [listItem(JOB_ID, "match_ab", "observing", "analysing")];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID_2}`) });
    await flush();
    await flush();
    expect(result.current.jobId).toBe(JOB_ID_2);
    expect(loc.search).toBe(`?job=${JOB_ID_2}`);
  });

  it("does not re-open a finished job", async () => {
    listJobs = [listItem(JOB_ID, "match_ab", "completed", "done")];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt("/") });
    await flush();
    expect(result.current.jobId).toBeNull();
    expect(statusCalls()).toHaveLength(0);
  });

  it("cancel() POSTs cancel and refreshes the status at once", async () => {
    statusReplies = [
      () => okJson(buildStatus({ status: "observing", segmentsTotal: 7 })),
      () => okJson(buildStatus({ status: "cancelled", segmentsTotal: 7 })),
    ];
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    await act(async () => {
      await result.current.cancel();
    });
    await flush();
    expect(calls("/api/match/cancel")).toHaveLength(1);
    expect(statusCalls()).toHaveLength(2);
    expect(result.current.data?.job.status).toBe("cancelled");
  });

  it("clear() forgets the job (removes ?job=)", async () => {
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab" }), { wrapper: wrapperAt(`/?job=${JOB_ID}&tab=x`) });
    await flush();
    act(() => result.current.clear());
    await flush();
    expect(loc.search).toBe("?tab=x");
    expect(result.current.jobId).toBeNull();
    expect(result.current.data).toBeNull();
  });
});

describe("useMatchAnalysisJob · disabled (IS_DEMO / en validación)", () => {
  it("makes no request at all, ignores ?job= and refuses to start", async () => {
    const { result } = renderHook(() => useMatchAnalysisJob({ purpose: "match_ab", enabled: false }), { wrapper: wrapperAt(`/?job=${JOB_ID}`) });
    await flush();
    await advance(60_000);
    let res: unknown = "not-called";
    await act(async () => {
      res = await result.current.start({
        videoId: VIDEO_ID,
        home: { name: "A", kit: { shirt: { hex: "#D32F2F" } } },
        away: { name: "B", kit: { shirt: { hex: "#1565C0" } } },
        locale: "es",
        attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
      });
    });
    expect(res).toBeNull();
    expect(result.current.jobId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
