/**
 * Conductor + advance + ops del worker sobre un repo EN MEMORIA con compare-and-set
 * (status / epoch), como el PostgREST real: despacho que exige call_id y no registra
 * gasto si falla, re-despacho fenced, kill switch que detiene jobs en vuelo conservando lo
 * observado, presupuesto antes de cada tramo, tramo sin vídeo = fallido, gasto REAL desde
 * usageMetadata, informe abstenido sin key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geminiDisplayName } from "../../../../src/lib/shared/matchJob/contract";
import type { MatchJobRow, SegmentRow } from "../repo";
import { segObs, VIDEO_USAGE } from "./fixtures";

// ── repo en memoria ─────────────────────────────────────────────────────────
const db = vi.hoisted(() => ({ jobs: new Map<string, Record<string, unknown>>(), segs: new Map<string, Record<string, unknown>[]>() }));

vi.mock("../repo", () => {
  const TERMINAL = ["completed", "failed", "cancelled"];
  const matches = (row: Record<string, unknown>, g: { status?: string | readonly string[]; epoch?: number; raw?: string } = {}) => {
    if (typeof g.status === "string" && row.status !== g.status) return false;
    if (Array.isArray(g.status) && !g.status.includes(row.status as string)) return false;
    if (g.epoch !== undefined && row.dispatch_epoch !== g.epoch) return false;
    if (g.raw?.includes("gemini_file_deleted_at=is.null") && row.gemini_file_deleted_at) return false;
    return true;
  };
  return {
    getJob: async (id: string) => (db.jobs.has(id) ? { ...db.jobs.get(id) } : null),
    patchJob: async (id: string, patch: Record<string, unknown>, guard?: Parameters<typeof matches>[1]) => {
      const row = db.jobs.get(id);
      if (!row || !matches(row, guard)) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    listJobsByStatus: async (statuses: readonly string[]) => [...db.jobs.values()].filter((j) => statuses.includes(j.status as string)).map((j) => ({ ...j })),
    listTerminalJobsWithFiles: async () =>
      [...db.jobs.values()].filter((j) => TERMINAL.includes(j.status as string) && j.gemini_file_name && !j.gemini_file_deleted_at).map((j) => ({ ...j })),
    getJobsByIds: async (ids: readonly string[]) => ids.filter((i) => db.jobs.has(i)).map((i) => ({ ...db.jobs.get(i) })),
    addJobSpend: async (id: string, service: string, usd: number) => {
      const row = db.jobs.get(id);
      if (!row) return;
      row.spend_usd = (row.spend_usd as number) + usd;
      row.spend_detail = { ...(row.spend_detail as object), [service]: usd };
    },
    insertSegments: async (id: string, planned: { idx: number; start_sec: number; end_sec: number }[]) => {
      if (!db.segs.has(id)) {
        db.segs.set(id, planned.map((p) => ({ match_analysis_id: id, ...p, status: "pending", attempts: 0, invalid_attempts: 0, cost_usd: 0, lease_until: null, lease_epoch: null, result: null, error: null })));
      }
    },
    listSegments: async (id: string) => (db.segs.get(id) ?? []).map((s) => ({ ...s })),
    claimSegment: async (o: { jobId: string; epoch: number; leaseSec: number }) => {
      const job = db.jobs.get(o.jobId);
      if (!job || job.status !== "observing" || job.dispatch_epoch !== o.epoch) return null;
      const s = (db.segs.get(o.jobId) ?? []).find((x) => x.status === "pending");
      if (!s) return null;
      Object.assign(s, { status: "running", attempts: (s.attempts as number) + 1, lease_epoch: o.epoch, lease_until: new Date(Date.now() + o.leaseSec * 1000).toISOString() });
      return { ...s };
    },
    patchSegment: async (id: string, idx: number, patch: Record<string, unknown>, g: { status?: string; leaseEpoch?: number; attempts?: number } = {}) => {
      const s = (db.segs.get(id) ?? []).find((x) => x.idx === idx);
      if (!s) return null;
      if (g.status && s.status !== g.status) return null;
      if (g.leaseEpoch !== undefined && s.lease_epoch !== g.leaseEpoch) return null;
      if (g.attempts !== undefined && s.attempts !== g.attempts) return null;
      Object.assign(s, patch);
      return { ...s };
    },
    skipOpenSegments: async (id: string, error: unknown) => {
      for (const s of db.segs.get(id) ?? []) if (s.status === "pending" || s.status === "running") Object.assign(s, { status: "skipped", error });
    },
    loadRosterNames: async () => ["Lucía Martín"],
  };
});

const spend = vi.hoisted(() => ({ recorded: [] as { service: string; usd: number }[], exceeded: false }));
vi.mock("../../budgetGuard", () => ({
  recordSpendAmountUsd: async (service: string, usd: number) => {
    spend.recorded.push({ service, usd });
  },
  wouldExceedBudget: async (extra: number) => ({ exceeded: spend.exceeded, spentUsd: 0, reservedUsd: 0, extraUsd: extra, budgetUsd: 20 }),
}));

const spawnMatchWorker = vi.fn();
vi.mock("../dispatch", () => ({ spawnMatchWorker: (...a: unknown[]) => spawnMatchWorker(...a) }));
const files = { deleteFile: vi.fn(), getFile: vi.fn(), listFilesByDisplayNamePrefix: vi.fn(), startResumableSession: vi.fn(), sha256Base64ToHex: (b: string) => b };
vi.mock("../../gemini/files", () => ({
  deleteFile: (...a: unknown[]) => files.deleteFile(...a),
  getFile: (...a: unknown[]) => files.getFile(...a),
  listFilesByDisplayNamePrefix: (...a: unknown[]) => files.listFilesByDisplayNamePrefix(...a),
  startResumableSession: (...a: unknown[]) => files.startResumableSession(...a),
  sha256Base64ToHex: (b: string) => files.sha256Base64ToHex(b),
}));
const generateJson = vi.fn();
vi.mock("../../gemini/generate", () => ({ generateJson: (...a: unknown[]) => generateJson(...a) }));
const generateMatchReportV2 = vi.fn();
vi.mock("../../../agents/_teamReportCore", () => ({ generateMatchReportV2: (...a: unknown[]) => generateMatchReportV2(...a) }));

const { dispatchJob, runTick, cancelJob, processAwaitingJob } = await import("../driver");
const { advanceJob } = await import("../advance");
const { stepUploadSession, stepProxyReady, stepWhenDisabled, stepBegin } = await import("../steps");

const JOB_ID = "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f";
const GUID = "0d2f4c1a-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const FILE_URI = "https://generativelanguage.googleapis.com/v1beta/files/abc";

function seedJob(over: Record<string, unknown> = {}): MatchJobRow {
  const row = {
    id: JOB_ID,
    user_id: "11111111-1111-4111-8111-111111111111",
    tenant_id: null,
    org_id: null,
    video_id: GUID,
    bunny_video_id: GUID,
    purpose: "match_ab",
    home: { name: "Local FC", kit: { shirt: { hex: "#ffffff", label: "blanco" } } },
    away: { name: "Visitante CF", kit: { shirt: { hex: "#7b1e2b", label: "granate" } } },
    focus_team: null,
    attacking_dir_1h: null,
    notes: null,
    category: null,
    locale: "es",
    status: "awaiting_encode",
    dispatch_epoch: 0,
    dispatch_attempts: 0,
    modal_call_id: null,
    heartbeat_at: null,
    duration_sec: 1800,
    target_variant: "360p",
    proxy: null,
    gemini_file_name: null,
    gemini_file_uri: null,
    gemini_file_expires_at: null,
    gemini_file_deleted_at: null,
    segments_total: null,
    segments_done: 0,
    observation: null,
    report: null,
    report_gate: null,
    report_lease_until: null,
    model_ids: null,
    estimate: null,
    reservation_usd: 0.6,
    spend_usd: 0,
    spend_detail: {},
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    ...over,
  };
  db.jobs.set(JOB_ID, row);
  return { ...row } as unknown as MatchJobRow;
}
const job = () => ({ ...db.jobs.get(JOB_ID) }) as unknown as MatchJobRow;
const segs = () => (db.segs.get(JOB_ID) ?? []) as unknown as SegmentRow[];

beforeEach(() => {
  db.jobs.clear();
  db.segs.clear();
  spend.recorded = [];
  spend.exceeded = false;
  process.env.MATCH_VIDEO_ENABLED = "true";
  process.env.GEMINI_API_KEY = "gk";
  spawnMatchWorker.mockReset().mockResolvedValue({ ok: true, callId: "fc-1" });
  files.deleteFile.mockReset().mockResolvedValue(true);
  files.getFile.mockReset().mockResolvedValue({ ok: true, file: { name: "files/abc", state: "ACTIVE", uri: FILE_URI } });
  files.listFilesByDisplayNamePrefix.mockReset().mockResolvedValue({ files: [], more: false });
  files.startResumableSession.mockReset().mockResolvedValue({ uploadUrl: "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=1", chunkGranularityBytes: null });
  generateJson.mockReset();
  generateMatchReportV2.mockReset();
});
afterEach(() => {
  delete process.env.MATCH_VIDEO_ENABLED;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BUNNY_CDN_HOSTNAME;
});

describe("dispatchJob", () => {
  it("awaiting_encode → dispatched with epoch 1; a spawned worker (call_id) is the only case that records Modal spend", async () => {
    const out = await dispatchJob(seedJob(), "encoded");
    expect(out.kind).toBe("dispatched");
    expect(job()).toMatchObject({ status: "dispatched", dispatch_epoch: 1, dispatch_attempts: 1, modal_call_id: "fc-1" });
    expect(spawnMatchWorker).toHaveBeenCalledWith({ jobId: JOB_ID, epoch: 1 });
    expect(spend.recorded).toEqual([{ service: "modal", usd: expect.any(Number) }]);
  });
  it("a failed spawn records NO spend and leaves the heartbeat null so the tick retries", async () => {
    spawnMatchWorker.mockResolvedValueOnce({ ok: false, reason: "reply_without_call_id" });
    const out = await dispatchJob(seedJob(), "encoded");
    expect(out.kind).toBe("spawn_failed");
    expect(spend.recorded).toEqual([]);
    expect(job()).toMatchObject({ heartbeat_at: null, modal_call_id: null, dispatch_attempts: 1 });
    expect(String(job().stage_detail)).toMatch(/dispatch_failed:reply_without_call_id/);
  });
  it("CAS: if another invocation already moved the job, nothing is spawned", async () => {
    const stale = seedJob();
    db.jobs.get(JOB_ID)!.dispatch_epoch = 5; // otra invocación ganó
    expect((await dispatchJob(stale, "encoded")).kind).toBe("conflict");
    expect(spawnMatchWorker).not.toHaveBeenCalled();
  });
  it("attempts exhausted → failed dispatch_exhausted, reservation released", async () => {
    await dispatchJob(seedJob({ status: "preparing", dispatch_epoch: 3, dispatch_attempts: 3 }), "stale_heartbeat");
    expect(job()).toMatchObject({ status: "failed", reservation_usd: 0, error: { code: "dispatch_exhausted" } });
  });
  it("re-dispatch of a transcode restarts it (epoch++) and deletes the old epoch's Gemini file", async () => {
    await dispatchJob(seedJob({ status: "uploading", dispatch_epoch: 1, dispatch_attempts: 1, gemini_file_name: "files/old" }), "stale_heartbeat");
    expect(job()).toMatchObject({ status: "dispatched", dispatch_epoch: 2, gemini_file_name: null });
    expect(files.deleteFile).toHaveBeenCalledWith("files/old");
  });
});

describe("processAwaitingJob (dispatch only once Bunny finished the encode)", () => {
  const bunny = (over: Record<string, unknown> = {}) => ({ guid: GUID, status: 4, length: 5400, width: 1920, height: 1080, availableResolutions: ["240p", "360p", "720p"], encodeProgress: 100, ...over });

  it("still encoding (status 3) or no playable variant yet → waiting, nothing spawned", async () => {
    expect(await processAwaitingJob(seedJob(), new Date(), bunny({ status: 3 }))).toBe("waiting");
    expect(await processAwaitingJob(seedJob(), new Date(), bunny({ availableResolutions: [] }))).toBe("waiting");
    expect(spawnMatchWorker).not.toHaveBeenCalled();
  });
  it("finished + variant → real length stored, reservation recomputed from it, smallest variant ≥ proxy height, dispatched", async () => {
    seedJob({ duration_sec: null, reservation_usd: 9 });
    expect(await processAwaitingJob(job(), new Date(), bunny())).toBe("dispatched");
    const j = job();
    expect(j).toMatchObject({ status: "dispatched", duration_sec: 5400, target_variant: "360p" });
    expect(j.reservation_usd).toBeLessThan(9);
    expect((j.estimate as { basis: string }).basis).toBe("bunny_length");
  });
  it("Bunny error → failed encode_failed; too long → video_too_long; never encoded in time → encode_timeout", async () => {
    await processAwaitingJob(seedJob(), new Date(), bunny({ status: 5 }));
    expect(job().error).toMatchObject({ code: "encode_failed" });
    await processAwaitingJob(seedJob(), new Date(), bunny({ length: 4 * 3600 }));
    expect(job().error).toMatchObject({ code: "video_too_long" });
    await processAwaitingJob(seedJob({ created_at: new Date(Date.now() - 100 * 3600_000).toISOString() }), new Date(), bunny({ status: 3 }));
    expect(job().error).toMatchObject({ code: "encode_timeout" });
    expect(spawnMatchWorker).not.toHaveBeenCalled();
  });
});

describe("worker ops", () => {
  it("upload_session refuses a proxy whose duration does not match Bunny's length", async () => {
    const r = await stepUploadSession(seedJob({ status: "preparing", dispatch_epoch: 1 }), {
      op: "upload_session", jobId: JOB_ID, epoch: 1, bytes: 1000, mime: "video/mp4", sha256: "a".repeat(64), durationSec: 1700,
    });
    expect(r.ok).toBe(false);
    expect(job()).toMatchObject({ status: "failed", error: { code: "duration_mismatch" } });
    expect(files.startResumableSession).not.toHaveBeenCalled();
  });
  it("upload_session mints a session for the exact bytes with displayName vitas-match-{job}-{epoch}", async () => {
    const r = await stepUploadSession(seedJob({ status: "preparing", dispatch_epoch: 2 }), {
      op: "upload_session", jobId: JOB_ID, epoch: 2, bytes: 5000, mime: "video/mp4", sha256: "b".repeat(64), durationSec: 1801,
    });
    expect(r).toMatchObject({ ok: true, data: { displayName: geminiDisplayName(JOB_ID, 2) } });
    expect(files.startResumableSession).toHaveBeenCalledWith({ bytes: 5000, mime: "video/mp4", displayName: geminiDisplayName(JOB_ID, 2) });
    expect(job()).toMatchObject({ status: "uploading", proxy: { bytes: 5000 } });
  });
  it("proxy_ready with a file that does not match the declared proxy deletes it and fails the job", async () => {
    seedJob({ status: "uploading", dispatch_epoch: 1, proxy: { bytes: 5000, sha256: "b".repeat(64), durationSec: 1800, mime: "video/mp4" } });
    files.getFile.mockResolvedValueOnce({ ok: true, file: { name: "files/abc", displayName: "someone-else", sizeBytes: "5000", uri: FILE_URI, state: "ACTIVE" } });
    await stepProxyReady(job(), { op: "proxy_ready", jobId: JOB_ID, epoch: 1, file: { name: "files/abc", uri: FILE_URI }, bytes: 5000, sha256: "b".repeat(64), durationSec: 1800 });
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc");
    expect(job()).toMatchObject({ status: "failed", error: { code: "gemini_upload_failed" } });
  });
  it("begin on an active file skips the transcode; on a terminal job says stop", async () => {
    expect(await stepBegin(seedJob({ status: "observing", dispatch_epoch: 1 }), 1)).toEqual({ ok: true, data: { action: "advance", epoch: 1 } });
    expect(await stepBegin(seedJob({ status: "cancelled", dispatch_epoch: 1 }), 1)).toEqual({ ok: true, data: { action: "stop", epoch: 1, state: "cancelled" } });
  });
});

describe("advance · observing", () => {
  const observingJob = () =>
    seedJob({ status: "observing", dispatch_epoch: 1, gemini_file_name: "files/abc", gemini_file_uri: FILE_URI, segments_total: 2 });
  const seedSegments = () =>
    db.segs.set(JOB_ID, [0, 1].map((idx) => ({ match_analysis_id: JOB_ID, idx, start_sec: idx * 900, end_sec: (idx + 1) * 900, status: "pending", attempts: 0, invalid_attempts: 0, cost_usd: 0, lease_until: null, lease_epoch: null, result: null, error: null })));

  it("one bounded unit per call: claims ONE segment, stores the normalised result with visual basis and bills the real usage", async () => {
    observingJob();
    seedSegments();
    const raw = { ...segObs(), evidence: [{ t_start: 100, t_end: 110, team: "home", category: "build_up", text: "Salida corta" }, { t_start: 120, t_end: 125, team: "away", category: "pressing", text: "El #11 presiona" }] };
    generateJson.mockResolvedValueOnce({ ok: true, json: raw, usage: VIDEO_USAGE, finishReason: "STOP", modelVersion: "m" });
    const r = await advanceJob(job());
    expect(r).toEqual({ kind: "state", state: "observing", retryAfterSec: 0 });
    expect(generateJson).toHaveBeenCalledTimes(1);
    const s0 = segs()[0] as unknown as { status: string; result: { visual_basis: string; observation: { evidence: unknown[] }; guard: { items_dropped: number } } };
    expect(s0.status).toBe("done");
    expect(s0.result.visual_basis).toBe("confirmed");
    expect(s0.result.observation.evidence).toHaveLength(1); // el «#11» se descartó
    expect(s0.result.guard.items_dropped).toBe(1);
    expect(segs()[1].status).toBe("pending");
    expect(spend.recorded).toEqual([{ service: "gemini", usd: expect.any(Number) }]);
    expect(spend.recorded[0].usd).toBeGreaterThan(0);
    expect(job().segments_done).toBe(1);
  });
  it("a reply whose usage shows NO video tokens is never stored as an observation (no_visual_input)", async () => {
    observingJob();
    seedSegments();
    generateJson.mockResolvedValue({ ok: true, json: segObs(), usage: { promptTokenCount: 3000, promptTokensDetails: [{ modality: "TEXT", tokenCount: 3000 }] }, finishReason: "STOP", modelVersion: "m" });
    await advanceJob(job());
    expect(segs()[0]).toMatchObject({ status: "pending", result: null, error: { kind: "no_visual_input" } });
    await advanceJob(job()); // como mucho 1 reintento
    expect(segs()[0]).toMatchObject({ status: "failed", result: null, error: { kind: "no_visual_input" } });
  });
  it("budget is checked BEFORE each segment: exhausted → failed budget_exhausted keeping done segments, Gemini not called", async () => {
    observingJob();
    seedSegments();
    db.segs.get(JOB_ID)![0].status = "done";
    db.segs.get(JOB_ID)![0].result = { observation: segObs({ evidence: [{ t_start: 10, t_end: 20, team: "home", category: "build_up", text: "Salida corta" }] }), visual_basis: "confirmed", time_base_applied: "absolute", guard: { keys_stripped: 0, items_dropped: 0 }, malformed_dropped: 0, out_of_range_dropped: 0 };
    spend.exceeded = true;
    const r = await advanceJob(job());
    expect(r).toMatchObject({ state: "failed" });
    expect(generateJson).not.toHaveBeenCalled();
    expect(job()).toMatchObject({ status: "failed", reservation_usd: 0, error: { code: "budget_exhausted" }, report_gate: { code: "report_budget_exhausted" } });
    expect(segs().map((s) => s.status)).toEqual(["done", "skipped"]);
    const obs = job().observation as { coverage: { analysed_fraction: { value: number } } };
    expect(obs.coverage.analysed_fraction.value).toBe(0.5);
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc");
  });
  it("a stale epoch cannot claim (fenced inside the claim)", async () => {
    observingJob();
    seedSegments();
    const old = { ...job(), dispatch_epoch: 0 } as MatchJobRow;
    const r = await advanceJob(old);
    expect(r).toEqual({ kind: "superseded" });
    expect(generateJson).not.toHaveBeenCalled();
  });
  it("two simultaneous advances on the last pending segment → ONE generateContent; a done segment is never re-billed", async () => {
    observingJob();
    db.segs.set(JOB_ID, [{ match_analysis_id: JOB_ID, idx: 0, start_sec: 0, end_sec: 1800, status: "pending", attempts: 0, invalid_attempts: 0, cost_usd: 0, lease_until: null, lease_epoch: null, result: null, error: null }]);
    generateJson.mockResolvedValue({ ok: true, json: segObs({ evidence: [{ t_start: 10, t_end: 20, team: "home", category: "build_up", text: "Salida corta" }] }), usage: VIDEO_USAGE, finishReason: "STOP", modelVersion: "m" });
    const [a, b] = await Promise.all([advanceJob(job()), advanceJob(job())]);
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect([a, b]).toContainEqual({ kind: "state", state: "observing", retryAfterSec: expect.any(Number) });
    expect(segs()[0].status).toBe("done");
    await advanceJob(job()); // todos terminales → aggregating, sin volver a pedir el tramo hecho
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(job().status).toBe("aggregating");
    expect(spend.recorded.filter((s) => s.service === "gemini")).toHaveLength(1);
  });
  it("all segments terminal → aggregating (the Gemini file is deleted as soon as it is no longer needed)", async () => {
    observingJob();
    seedSegments();
    for (const s of db.segs.get(JOB_ID)!) s.status = "failed";
    await advanceJob(job());
    expect(job().status).toBe("aggregating");
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc");
  });
});

describe("advance · Gemini says the file is gone while the DB still has it attached (not deleted, not expiring)", () => {
  const DONE_RESULT = { observation: segObs({ evidence: [{ t_start: 10, t_end: 20, team: "home", category: "build_up", text: "Salida corta" }] }), visual_basis: "confirmed", time_base_applied: "absolute", guard: { keys_stripped: 0, items_dropped: 0 }, malformed_dropped: 0, out_of_range_dropped: 0 };
  const lostFileJob = (status: "observing" | "gemini_processing", over: Record<string, unknown> = {}) =>
    seedJob({
      status,
      dispatch_epoch: 1,
      dispatch_attempts: 1,
      heartbeat_at: new Date().toISOString(),
      proxy: { bytes: 5000, sha256: "b".repeat(64), durationSec: 1800, mime: "video/mp4" },
      gemini_file_name: "files/abc",
      gemini_file_uri: FILE_URI,
      gemini_file_display_name: geminiDisplayName(JOB_ID, 1),
      gemini_file_expires_at: new Date(Date.now() + 40 * 3600_000).toISOString(),
      segments_total: 2,
      ...over,
    });
  const seedDoneAndPending = () =>
    db.segs.set(JOB_ID, [0, 1].map((idx) => ({ match_analysis_id: JOB_ID, idx, start_sec: idx * 900, end_sec: (idx + 1) * 900, status: idx === 0 ? "done" : "pending", attempts: idx === 0 ? 1 : 0, invalid_attempts: 0, cost_usd: idx === 0 ? 0.05 : 0, lease_until: null, lease_epoch: idx === 0 ? 1 : null, result: idx === 0 ? DONE_RESULT : null, error: null })));
  const FILE_404 = { ok: false, kind: "file_unavailable", status: 404, usage: null, message: "HTTP 404" };

  /** Re-despachado a `dispatched` con los campos del fichero limpios: el siguiente worker re-transcodifica. */
  async function expectRetranscode() {
    expect(job()).toMatchObject({
      status: "dispatched",
      dispatch_epoch: 2,
      dispatch_attempts: 2,
      proxy: null,
      gemini_file_name: null,
      gemini_file_uri: null,
      gemini_file_display_name: null,
      gemini_file_expires_at: null,
      gemini_file_deleted_at: null,
    });
    expect(spawnMatchWorker).toHaveBeenCalledTimes(1);
    expect(spawnMatchWorker).toHaveBeenCalledWith({ jobId: JOB_ID, epoch: 2 });
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc"); // best effort: 404 = ya no está
    // The billed segment is kept as is and will never be asked again.
    expect(segs()[0]).toMatchObject({ status: "done", attempts: 1, result: DONE_RESULT });
    // The epoch-2 worker transcodes again instead of advancing on the dead file.
    process.env.BUNNY_CDN_HOSTNAME = "vz-test.b-cdn.net";
    expect(await stepBegin(job(), 2)).toMatchObject({ ok: true, data: { action: "transcode", epoch: 2 } });
    expect(job().status).toBe("preparing");
  }

  it("observing + generateContent file_unavailable → dispatched (re-transcode), done segments kept, the lost segment back to pending without spending an attempt", async () => {
    lostFileJob("observing");
    seedDoneAndPending();
    generateJson.mockResolvedValueOnce(FILE_404);
    expect(await advanceJob(job())).toEqual({ kind: "superseded" });
    expect(segs()[1]).toMatchObject({ status: "pending", attempts: 0, result: null });
    await expectRetranscode();

    // Full resume on a NEW upload: only the pending segment is asked (and billed) again.
    const NEW_URI = "https://generativelanguage.googleapis.com/v1beta/files/new";
    const proxy = { bytes: 6000, sha256: "c".repeat(64), durationSec: 1800 };
    expect(await stepUploadSession(job(), { op: "upload_session", jobId: JOB_ID, epoch: 2, mime: "video/mp4", ...proxy })).toMatchObject({ ok: true });
    files.getFile.mockResolvedValueOnce({ ok: true, file: { name: "files/new", displayName: geminiDisplayName(JOB_ID, 2), sizeBytes: "6000", uri: NEW_URI, state: "PROCESSING" } });
    await stepProxyReady(job(), { op: "proxy_ready", jobId: JOB_ID, epoch: 2, file: { name: "files/new", uri: NEW_URI }, ...proxy });
    expect(job()).toMatchObject({ status: "gemini_processing", gemini_file_name: "files/new" });
    files.getFile.mockResolvedValueOnce({ ok: true, file: { name: "files/new", state: "ACTIVE", uri: NEW_URI } });
    await advanceJob(job());
    expect(job()).toMatchObject({ status: "observing", segments_total: 2 });
    generateJson.mockResolvedValueOnce({ ok: true, json: segObs(), usage: VIDEO_USAGE, finishReason: "STOP", modelVersion: "m" });
    await advanceJob(job());
    expect(generateJson).toHaveBeenCalledTimes(2); // the lost call + the resumed segment 1, never segment 0 again
    expect(JSON.stringify(generateJson.mock.calls[1][0])).toContain(NEW_URI);
    expect(segs().map((s) => s.status)).toEqual(["done", "done"]);
    expect(segs()[0]).toMatchObject({ attempts: 1, result: DONE_RESULT });
  });

  it("gemini_processing + files.get 404 → dispatched (re-transcode), done segments kept", async () => {
    lostFileJob("gemini_processing");
    seedDoneAndPending();
    files.getFile.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await advanceJob(job())).toEqual({ kind: "superseded" });
    expect(generateJson).not.toHaveBeenCalled();
    expect(segs()[1]).toMatchObject({ status: "pending", attempts: 0 });
    await expectRetranscode();
  });

  it("with no dispatch left the job fails dispatch_exhausted KEEPING the billed segments (partial observation, honest coverage)", async () => {
    lostFileJob("observing", { dispatch_attempts: 3 });
    seedDoneAndPending();
    generateJson.mockResolvedValueOnce(FILE_404);
    expect(await advanceJob(job())).toMatchObject({ kind: "state", state: "failed" });
    expect(spawnMatchWorker).not.toHaveBeenCalled();
    expect(job()).toMatchObject({ status: "failed", reservation_usd: 0, error: { code: "dispatch_exhausted" }, segments_done: 1, report_gate: null });
    expect(segs().map((s) => s.status)).toEqual(["done", "skipped"]);
    const obs = job().observation as { coverage: { analysed_fraction: { value: number } } };
    expect(obs.coverage.analysed_fraction.value).toBe(0.5);
  });

  it("the spawn-failure exit to dispatch_exhausted also keeps the billed segments", async () => {
    lostFileJob("observing", { dispatch_epoch: 2, dispatch_attempts: 2, heartbeat_at: new Date(Date.now() - 3600_000).toISOString() });
    seedDoneAndPending();
    spawnMatchWorker.mockResolvedValueOnce({ ok: false, reason: "http_500" });
    const out = await dispatchJob(job(), "stale_heartbeat");
    expect(out.kind).toBe("failed");
    expect(job()).toMatchObject({ status: "failed", dispatch_attempts: 3, error: { code: "dispatch_exhausted" }, segments_done: 1 });
    expect(segs().map((s) => s.status)).toEqual(["done", "skipped"]);
    const obs = job().observation as { coverage: { analysed_fraction: { value: number } } };
    expect(obs.coverage.analysed_fraction.value).toBe(0.5);
    expect(spend.recorded).toEqual([]); // a failed spawn is never billed
  });
});

describe("advance · aggregating / reporting", () => {
  it("0 analysed segments → completed with report_no_analysed_segments (report gated, never invented)", async () => {
    seedJob({ status: "aggregating", dispatch_epoch: 1, segments_total: 1 });
    db.segs.set(JOB_ID, [{ match_analysis_id: JOB_ID, idx: 0, start_sec: 0, end_sec: 1800, status: "failed", attempts: 3, invalid_attempts: 0, cost_usd: 0, result: null, error: { kind: "timeout", attempts: 3 } }]);
    await advanceJob(job());
    expect(job()).toMatchObject({ status: "completed", report: null, report_gate: { code: "report_no_analysed_segments" }, reservation_usd: 0 });
    expect(generateMatchReportV2).not.toHaveBeenCalled();
  });
  it("reporting without ANTHROPIC_API_KEY → completed with report_engine_unavailable (honest abstention)", async () => {
    const { aggregateMatch } = await import("../aggregate");
    const { CONF, doneSegment } = await import("./fixtures");
    const observation = aggregateMatch({ durationSec: 900, segments: [doneSegment(0, 0, 900)], locale: "es", geminiModel: "gemini-2.5-flash", confidence: CONF });
    seedJob({ status: "reporting", dispatch_epoch: 1, observation });
    await advanceJob(job());
    expect(job()).toMatchObject({ status: "completed", report: null, report_gate: { code: "report_engine_unavailable" } });
    expect(generateMatchReportV2).not.toHaveBeenCalled();
  });
  it("reporting bills the Claude usage priced with the model that answered and stores it", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const { aggregateMatch } = await import("../aggregate");
    const { CONF, doneSegment } = await import("./fixtures");
    const observation = aggregateMatch({ durationSec: 900, segments: [doneSegment(0, 0, 900)], locale: "es", geminiModel: "gemini-2.5-flash", confidence: CONF });
    seedJob({ status: "reporting", dispatch_epoch: 1, observation });
    generateMatchReportV2.mockResolvedValueOnce({ kind: "gate", gate: { code: "report_engine_error", reason: "x" }, model: "claude-opus-4-8", usage: { input_tokens: 10000, output_tokens: 1000 } });
    await advanceJob(job());
    expect(job()).toMatchObject({ status: "completed", report_model: "claude-opus-4-8", report_gate: { code: "report_engine_error" } });
    // 10k × $5 + 1k × $25 per MTok (Opus 4.8, the fallback that answered)
    expect(spend.recorded).toEqual([{ service: "claude", usd: 0.075 }]);
  });
});

describe("kill switch and tick", () => {
  it("with the flag off the tick dispatches nothing and stops in-flight jobs (analysis_disabled), sweeping Gemini files", async () => {
    delete process.env.MATCH_VIDEO_ENABLED;
    seedJob({ status: "observing", dispatch_epoch: 1, gemini_file_name: "files/abc", gemini_file_uri: FILE_URI });
    const r = await runTick();
    expect(r.failedJobs).toBe(1);
    expect(spawnMatchWorker).not.toHaveBeenCalled();
    expect(job()).toMatchObject({ status: "failed", error: { code: "analysis_disabled" }, reservation_usd: 0 });
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc");
  });
  it("stepWhenDisabled makes the worker exit without opening an upload", async () => {
    const j = seedJob({ status: "preparing", dispatch_epoch: 1 });
    const r = await stepWhenDisabled(j, { op: "upload_session", jobId: JOB_ID, epoch: 1, bytes: 1, mime: "video/mp4", sha256: "a".repeat(64), durationSec: 1 });
    expect(r.ok).toBe(false);
    expect(files.startResumableSession).not.toHaveBeenCalled();
    expect(job().status).toBe("failed");
  });
  it("tick: a stale heartbeat is re-dispatched with epoch++ KEEPING the attached file (named in the old epoch); the next worker resumes without re-transcode", async () => {
    // Epoch 2 uploaded files/abc (displayName …-2) after epoch 1 died mid-upload (files/zombie, …-1).
    seedJob({ status: "observing", dispatch_epoch: 2, dispatch_attempts: 2, heartbeat_at: new Date(Date.now() - 3600_000).toISOString(), gemini_file_name: "files/abc", gemini_file_uri: FILE_URI, gemini_file_display_name: geminiDisplayName(JOB_ID, 2), gemini_file_expires_at: new Date(Date.now() + 40 * 3600_000).toISOString(), segments_total: 2 });
    db.segs.set(JOB_ID, [0, 1].map((idx) => ({ match_analysis_id: JOB_ID, idx, start_sec: idx * 900, end_sec: (idx + 1) * 900, status: idx === 0 ? "done" : "pending", attempts: idx === 0 ? 1 : 0, invalid_attempts: 0, cost_usd: 0, lease_until: null, lease_epoch: null, result: null, error: null })));
    files.listFilesByDisplayNamePrefix.mockResolvedValueOnce({
      files: [
        { name: "files/abc", displayName: geminiDisplayName(JOB_ID, 2), createTime: new Date(Date.now() - 2 * 3600_000).toISOString() },
        { name: "files/zombie", displayName: geminiDisplayName(JOB_ID, 1), createTime: new Date(Date.now() - 3 * 3600_000).toISOString() },
      ],
      more: false,
    });
    const r = await runTick();
    expect(r.redispatched).toBe(1);
    expect(job()).toMatchObject({ status: "observing", dispatch_epoch: 3, gemini_file_name: "files/abc", gemini_file_deleted_at: null }); // fichero aún ACTIVE ⇒ sin re-transcode
    expect(files.deleteFile).toHaveBeenCalledWith("files/zombie");
    expect(files.deleteFile).not.toHaveBeenCalledWith("files/abc");
    expect(r.geminiFilesDeleted).toBe(1);

    // The epoch-3 worker's advance uses the kept file: it claims the pending segment, no new spawn.
    spawnMatchWorker.mockClear();
    generateJson.mockResolvedValueOnce({ ok: true, json: segObs(), usage: VIDEO_USAGE, finishReason: "STOP", modelVersion: "m" });
    const a = await advanceJob(job());
    expect(a).toEqual({ kind: "state", state: "observing", retryAfterSec: 0 });
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(spawnMatchWorker).not.toHaveBeenCalled();
    expect(job()).toMatchObject({ dispatch_epoch: 3, dispatch_attempts: 3, gemini_file_name: "files/abc" });
    expect(segs()[1]).toMatchObject({ status: "done", lease_epoch: 3 });
  });
  it("orphan sweep rule: a file attached to a live job is never deleted whatever its epoch or age; the rest go when terminal/unknown, from another epoch, or older than 24 h", async () => {
    const { shouldSweepGeminiFile } = await import("../driver");
    const now = new Date();
    const young = new Date(now.getTime() - 3600_000).toISOString();
    const old = new Date(now.getTime() - 30 * 3600_000).toISOString();
    const ref = (epoch: number) => ({ jobId: JOB_ID, epoch });
    const live = { status: "observing" as const, dispatch_epoch: 3, gemini_file_name: "files/abc", gemini_file_deleted_at: null };
    // attached to the live job: kept even from an older epoch and past 24 h
    expect(shouldSweepGeminiFile({ name: "files/abc", createTime: young }, ref(2), live, now)).toBe(false);
    expect(shouldSweepGeminiFile({ name: "files/abc", createTime: old }, ref(1), live, now)).toBe(false);
    // unattached upload of the CURRENT epoch (before proxy_ready): kept while young, swept past 24 h
    expect(shouldSweepGeminiFile({ name: "files/new", createTime: young }, ref(3), live, now)).toBe(false);
    expect(shouldSweepGeminiFile({ name: "files/new", createTime: old }, ref(3), live, now)).toBe(true);
    // unattached upload of a superseded epoch: swept at once
    expect(shouldSweepGeminiFile({ name: "files/zombie", createTime: young }, ref(2), live, now)).toBe(true);
    // terminal or unknown job: swept (even the attached file); a file the DB already marks deleted is not "attached"
    expect(shouldSweepGeminiFile({ name: "files/abc", createTime: young }, ref(3), { ...live, status: "completed" }, now)).toBe(true);
    expect(shouldSweepGeminiFile({ name: "files/abc", createTime: young }, ref(3), undefined, now)).toBe(true);
    expect(shouldSweepGeminiFile({ name: "files/abc", createTime: young }, ref(2), { ...live, gemini_file_deleted_at: young }, now)).toBe(true);
  });
  it("tick does not re-dispatch while the heartbeat is fresh", async () => {
    seedJob({ status: "preparing", dispatch_epoch: 1, dispatch_attempts: 1, heartbeat_at: new Date().toISOString() });
    const r = await runTick();
    expect(r.redispatched).toBe(0);
    expect(spawnMatchWorker).not.toHaveBeenCalled();
    expect(job().dispatch_epoch).toBe(1);
  });
  it("cancel releases the reservation, skips open segments and deletes the file", async () => {
    seedJob({ status: "observing", dispatch_epoch: 1, gemini_file_name: "files/abc" });
    db.segs.set(JOB_ID, [{ match_analysis_id: JOB_ID, idx: 0, start_sec: 0, end_sec: 900, status: "pending", attempts: 0, invalid_attempts: 0, cost_usd: 0 }]);
    await cancelJob(job());
    expect(job()).toMatchObject({ status: "cancelled", reservation_usd: 0 });
    expect(segs()[0].status).toBe("skipped");
    expect(files.deleteFile).toHaveBeenCalledWith("files/abc");
  });
});
