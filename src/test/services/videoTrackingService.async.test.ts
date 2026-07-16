/**
 * Tests · V4.4 ruta async del videoTrackingService (enqueue + poll + mapeo).
 * Fake timers para no esperar los ticks de 10 s del polling real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer jwt" }),
}));

import {
  trackVideo,
  trackVideoAsync,
  mapModalResult,
  VideoTrackingCache,
} from "@/services/real/videoTrackingService";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

const RAW_MODAL_RESULT = {
  duration_sec: 5400,
  frames_processed: 27000,
  fps_source: 30,
  sample_fps: 5,
  players: [
    { track_id: 7, timestamp_ms: 1000, bbox: [1, 2, 3, 4], confidence: 0.9, team: "team_a", team_color: [255, 0, 0] },
  ],
  ball: [{ timestamp_ms: 1000, x: 0.5, y: 0.6, confidence: 0.8 }],
  ball_stops: [{ start_ms: 0, end_ms: 500, avg_x: 0.4, avg_y: 0.3 }],
  total_player_tracks: 22,
  total_ball_detections: 900,
  teams: { team_a: [255, 0, 0], team_b: [0, 0, 255] },
};

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("mapModalResult (snake_case crudo → TrackingResult camelCase)", () => {
  it("mapea todos los campos como la ruta síncrona", () => {
    const r = mapModalResult(RAW_MODAL_RESULT, "vid-1");
    expect(r.videoId).toBe("vid-1");
    expect(r.source).toBe("modal");
    expect(r.durationSec).toBe(5400);
    expect(r.players[0]).toMatchObject({
      trackId: 7, timestampMs: 1000, bbox: [1, 2, 3, 4], team: "team_a", teamColor: [255, 0, 0],
    });
    expect(r.ballStops[0]).toMatchObject({ startMs: 0, endMs: 500, x: 0.4, y: 0.3 });
    expect(r.teams).toEqual(RAW_MODAL_RESULT.teams);
  });

  it("tolera un result parcial (campos ausentes → defaults)", () => {
    const r = mapModalResult({}, "vid-2");
    expect(r.players).toEqual([]);
    expect(r.totalPlayerTracks).toBe(0);
  });
});

describe("trackVideoAsync", () => {
  it("503 en el enqueue → fallback null (async no configurado)", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: "real_inference_disabled" }, 503));
    const stages: string[] = [];
    const result = await trackVideoAsync({
      videoId: "v1", videoUrl: "https://cdn/x.mp4", durationSec: 5400,
      onProgress: (p) => stages.push(p.stage),
    });
    expect(result).toBeNull();
    expect(stages).toContain("fallback");
  });

  it("happy path: enqueue → poll processing → poll done → mapea y cachea", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { jobId: "job-1", status: "processing" } }, 202)) // enqueue
      .mockResolvedValueOnce(jsonRes({ data: { status: "processing" } }))                       // poll 1
      .mockResolvedValueOnce(jsonRes({ data: { status: "done", result: RAW_MODAL_RESULT } }));  // poll 2

    const stages: string[] = [];
    const promise = trackVideoAsync({
      videoId: "v2", videoUrl: "https://cdn/match.mp4", durationSec: 5400,
      onProgress: (p) => stages.push(p.stage),
    });

    await vi.advanceTimersByTimeAsync(10_000); // tick 1 → processing
    await vi.advanceTimersByTimeAsync(10_000); // tick 2 → done
    const result = await promise;

    expect(result).not.toBeNull();
    expect(result!.videoId).toBe("v2");
    expect(result!.players).toHaveLength(1);
    expect(stages).toEqual(expect.arrayContaining(["queued", "processing", "finished"]));

    // Cacheado para revisitas
    expect(VideoTrackingCache.get("v2")?.totalPlayerTracks).toBe(22);
  });

  it("job failed en el servidor → fallback null con mensaje", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { jobId: "job-3" } }, 202))
      .mockResolvedValueOnce(jsonRes({ data: { status: "failed", error: "gpu oom" } }));

    const messages: string[] = [];
    const promise = trackVideoAsync({
      videoId: "v3", videoUrl: "https://cdn/m.mp4", durationSec: 5400,
      onProgress: (p) => messages.push(p.message),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result).toBeNull();
    expect(messages.some((m) => m.includes("gpu oom"))).toBe(true);
  });

  it("dedup del servidor: enqueue devuelve deduped → reanuda polling del job existente", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { jobId: "job-old", status: "processing", deduped: true } }, 200))
      .mockResolvedValueOnce(jsonRes({ data: { status: "done", result: RAW_MODAL_RESULT } }));
    const promise = trackVideoAsync({ videoId: "v4", videoUrl: "https://cdn/m.mp4", durationSec: 5400 });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result!.totalPlayerTracks).toBe(22);
  });
});

describe("trackVideo con allowAsync", () => {
  it("vídeo largo + allowAsync → desvía a la cola async (no stage too_long)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: { jobId: "job-5" } }, 202))
      .mockResolvedValueOnce(jsonRes({ data: { status: "done", result: RAW_MODAL_RESULT } }));
    const stages: string[] = [];
    const promise = trackVideo({
      videoId: "v5", videoUrl: "https://cdn/m.mp4", durationSec: 5400, allowAsync: true,
      onProgress: (p) => stages.push(p.stage),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(stages).not.toContain("too_long");
    // el enqueue fue a track-async, no al proxy síncrono
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/coaching/track-async");
  });

  it("vídeo largo SIN allowAsync → comportamiento actual intacto (too_long + null)", async () => {
    const stages: string[] = [];
    const result = await trackVideo({
      videoId: "v6", videoUrl: "https://cdn/m.mp4", durationSec: 5400,
      onProgress: (p) => stages.push(p.stage),
    });
    expect(result).toBeNull();
    expect(stages).toContain("too_long");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
