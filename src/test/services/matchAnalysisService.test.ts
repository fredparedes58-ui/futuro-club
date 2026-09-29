/**
 * MatchAnalysisService — client of the match video job (start / status / list / cancel).
 * The backend is built in parallel, so fetch is mocked against the shared contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })) }));

import { MatchAnalysisService, MatchApiError } from "@/services/real/matchAnalysisService";
import { MATCH_ATTESTATION_VERSION, type MatchStartRequest } from "@/lib/shared/matchJob/contract";
import { buildObservation, buildStatus, errJson, JOB_ID, JOB_ID_2, okJson, VIDEO_ID } from "../fixtures/matchJob";

const fetchMock = vi.fn();

const START: MatchStartRequest = {
  videoId: VIDEO_ID,
  purpose: "match_ab",
  home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F" } } },
  away: { name: "Atlético Barrio", kit: { shirt: { hex: "#1565C0" } } },
  locale: "es",
  attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function rejection(p: Promise<unknown>): Promise<MatchApiError> {
  try {
    await p;
  } catch (e) {
    return e as MatchApiError;
  }
  throw new Error("expected a rejection");
}

describe("MatchAnalysisService.start", () => {
  it("POSTs the validated request with the user's bearer token", async () => {
    fetchMock.mockResolvedValue(
      okJson({ jobId: JOB_ID, status: "awaiting_encode", deduplicated: false, estimate: { usd: 0.6, kind: "estimate", basis: "max_duration_cap", pricing_ref: "config/aiPricing.json@2026-09-28" } }),
    );
    const res = await MatchAnalysisService.start(START);
    expect(res.jobId).toBe(JOB_ID);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/match/start");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual(START);
  });

  it("refuses locally, without any request, when the attestation is missing or outdated", async () => {
    const noAtt = { ...START } as Partial<MatchStartRequest>;
    delete noAtt.attestation;
    expect((await rejection(MatchAnalysisService.start(noAtt as MatchStartRequest))).code).toBe("attestation_required");
    const old = { ...START, attestation: { accepted: true, version: "2020-01-01.v0" } } as unknown as MatchStartRequest;
    expect((await rejection(MatchAnalysisService.start(old))).code).toBe("attestation_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses locally a start without both shirt colours or with a per-player key", async () => {
    const noKit = { ...START, away: { name: "Atlético Barrio" } } as MatchStartRequest;
    expect((await rejection(MatchAnalysisService.start(noKit))).code).toBe("invalid_request");
    const withPlayer = { ...START, playerContext: { age: 13 } } as unknown as MatchStartRequest;
    expect((await rejection(MatchAnalysisService.start(withPlayer))).code).toBe("invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the server error code (match_video_disabled) so the UI can switch to 'En validación'", async () => {
    fetchMock.mockResolvedValue(errJson("match_video_disabled", "análisis de partido completo en validación", 503));
    const e = await rejection(MatchAnalysisService.start(START));
    expect(e).toBeInstanceOf(MatchApiError);
    expect(e.code).toBe("match_video_disabled");
    expect(e.status).toBe(503);
  });

  it("reads the legacy { success:false, errorDetail } envelope too", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Presupuesto agotado", errorDetail: { code: "budget_exceeded", message: "Presupuesto agotado" } }), { status: 429 }),
    );
    expect((await rejection(MatchAnalysisService.start(START))).code).toBe("budget_exceeded");
  });

  it("maps a network failure to code 'network'", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await rejection(MatchAnalysisService.start(START))).code).toBe("network");
  });
});

describe("MatchAnalysisService.status", () => {
  it("GETs the read-only status with ?jobId= and parses it with the contract", async () => {
    fetchMock.mockResolvedValue(okJson(buildStatus({ status: "observing", segmentsDone: 1, segmentsTotal: 7, currentSegmentIdx: 1 })));
    const r = await MatchAnalysisService.status(JOB_ID);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/match/status?jobId=${JOB_ID}`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(r.progress.segmentsTotal).toBe(7);
  });

  it("rejects (never renders) a payload claiming 100 % coverage while a segment failed", async () => {
    const obs = buildObservation([{ status: "done" }, { status: "failed" }]);
    const bad = buildStatus({ status: "completed", observation: obs });
    (bad.coverage as { analysed_fraction: { value: number } }).analysed_fraction.value = 1;
    fetchMock.mockResolvedValue(okJson(bad));
    expect((await rejection(MatchAnalysisService.status(JOB_ID))).code).toBe("invalid_response");
  });

  it("rejects a MEDIDA value on the match path", async () => {
    const obs = buildObservation([{ status: "done" }]);
    const bad = buildStatus({ status: "completed", observation: obs });
    (bad.observation as { possession: { home: { provenance: string } } }).possession.home.provenance = "MEDIDA";
    fetchMock.mockResolvedValue(okJson(bad));
    expect((await rejection(MatchAnalysisService.status(JOB_ID))).code).toBe("invalid_response");
  });

  it("refuses a malformed job id without a request", async () => {
    expect((await rejection(MatchAnalysisService.status("../../etc"))).code).toBe("invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 404 to not_found", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    expect((await rejection(MatchAnalysisService.status(JOB_ID))).code).toBe("not_found");
  });
});

describe("MatchAnalysisService.list / cancel", () => {
  it("lists the owner's jobs newest first", async () => {
    const item = (jobId: string, createdAt: string) => ({
      jobId, videoId: VIDEO_ID, purpose: "match_ab", status: "completed", stage: "done",
      homeName: "A", awayName: "B", createdAt, finishedAt: createdAt,
    });
    fetchMock.mockResolvedValue(okJson({ jobs: [item(JOB_ID, "2026-09-27T10:00:00Z"), item(JOB_ID_2, "2026-09-28T10:00:00Z")] }));
    const jobs = await MatchAnalysisService.list();
    expect(jobs.map((j) => j.jobId)).toEqual([JOB_ID_2, JOB_ID]);
  });

  it("POSTs cancel with the job id", async () => {
    fetchMock.mockResolvedValue(okJson({ jobId: JOB_ID, status: "cancelled" }));
    const r = await MatchAnalysisService.cancel(JOB_ID);
    expect(r.status).toBe("cancelled");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/match/cancel");
    expect(JSON.parse(init.body)).toEqual({ jobId: JOB_ID });
  });
});
