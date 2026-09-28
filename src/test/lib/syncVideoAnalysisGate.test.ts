/**
 * Gate honesto de las rutas de análisis rápido (TeamBaseline / CompareRival) +
 * getServerVideoUrl (nunca un blob: hacia el servidor).
 */
import { describe, it, expect, vi } from "vitest";
import type { TFunction } from "i18next";
import {
  resolveSyncAnalysisInput,
  syncAnalysisRefusalMessage,
  finalizeSyncGateMessage,
} from "@/lib/syncVideoAnalysisGate";
import { getBestVideoUrl, getServerVideoUrl, type VideoRecord } from "@/services/real/videoService";
import { SYNC_ANALYSIS_GATE_CODE, SYNC_ANALYSIS_MAX_DURATION_MIN } from "@/lib/shared/videoLimits";

const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key,
) as unknown as TFunction;

function rec(overrides: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: "3f1c-guid",
    title: "clip",
    playerId: null,
    status: "finished",
    statusCode: 4,
    encodeProgress: 100,
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    storageSize: 0,
    thumbnailUrl: null,
    embedUrl: "",
    streamUrl: null,
    dateUploaded: "2026-09-28T00:00:00Z",
    ...overrides,
  };
}

const CDN = "https://vz-abc.b-cdn.net/3f1c-guid/playlist.m3u8";

describe("getServerVideoUrl", () => {
  it("HLS de Bunny → MP4 http (misma conversión que getBestVideoUrl)", () => {
    const v = rec({ streamUrl: CDN });
    expect(getServerVideoUrl(v)).toEqual({ url: "https://vz-abc.b-cdn.net/3f1c-guid/play_720p.mp4", reason: null });
    expect(getBestVideoUrl(v)).toBe("https://vz-abc.b-cdn.net/3f1c-guid/play_720p.mp4");
  });

  it("encode sin terminar (poll agotado) → null + encoding_pending, NUNCA el blob:", () => {
    const v = rec({ status: "uploaded", statusCode: 1, localPath: "blob:http://localhost/abc" });
    expect(getBestVideoUrl(v)).toBe("blob:http://localhost/abc"); // reproducción local: sí
    expect(getServerVideoUrl(v)).toEqual({ url: null, reason: "encoding_pending" });
  });

  it("vídeo solo local (sin CDN) → null + local_only", () => {
    const v = rec({ id: "local-abc", streamUrl: "blob:http://localhost/x", localPath: "blob:http://localhost/x" });
    expect(getServerVideoUrl(v)).toEqual({ url: null, reason: "local_only" });
  });

  it("sin registro → no_url", () => {
    expect(getServerVideoUrl(null)).toEqual({ url: null, reason: "no_url" });
  });
});

describe("resolveSyncAnalysisInput", () => {
  it("clip corto con CDN → ok + URL http", () => {
    const r = resolveSyncAnalysisInput(rec({ streamUrl: CDN, duration: 120 }), null);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.url.startsWith("https://")).toBe(true);
  });

  it("partido completo (duración de Bunny) → too_long, sin llamar al agente", () => {
    const r = resolveSyncAnalysisInput(rec({ streamUrl: CDN, duration: 95 * 60 }), null);
    expect(r).toEqual({ kind: "too_long", durationSec: 95 * 60 });
  });

  it("sin duración de Bunny usa la del navegador", () => {
    const r = resolveSyncAnalysisInput(rec({ streamUrl: CDN, duration: 0 }), 100 * 60);
    expect(r).toEqual({ kind: "too_long", durationSec: 100 * 60 });
  });

  it("duración desconocida → NO bloquea ni inventa (durationSec null)", () => {
    const r = resolveSyncAnalysisInput(rec({ streamUrl: CDN, duration: 0 }), null);
    expect(r).toEqual({ kind: "ok", url: "https://vz-abc.b-cdn.net/3f1c-guid/play_720p.mp4", durationSec: null });
  });

  it("codificación en curso → encoding_pending (no manda blob:)", () => {
    const r = resolveSyncAnalysisInput(
      rec({ status: "uploaded", localPath: "blob:http://localhost/abc" }),
      60,
    );
    expect(r).toEqual({ kind: "encoding_pending" });
  });
});

describe("mensajes traducidos", () => {
  it("too_long interpola duración (min, redondeo arriba) y máximo", () => {
    const msg = syncAnalysisRefusalMessage(t, { kind: "too_long", durationSec: 95 * 60 + 1 });
    expect(msg).toBe(
      `videoUpload.syncAnalysisTooLong ${JSON.stringify({ duration: 96, max: SYNC_ANALYSIS_MAX_DURATION_MIN })}`,
    );
  });

  it("cada motivo tiene su clave", () => {
    expect(syncAnalysisRefusalMessage(t, { kind: "encoding_pending" })).toBe("videoUpload.notReadyEncoding");
    expect(syncAnalysisRefusalMessage(t, { kind: "local_only" })).toBe("videoUpload.notReadyLocalOnly");
    expect(syncAnalysisRefusalMessage(t, { kind: "no_url" })).toBe("videoUpload.notReadyNoUrl");
  });

  it("finalizeSyncGateMessage reconoce el 422 del gate y usa la duración del servidor", () => {
    const body = {
      ok: false,
      errorDetail: { code: SYNC_ANALYSIS_GATE_CODE, message: "x", durationSec: 5400, maxDurationSec: 300 },
    };
    expect(finalizeSyncGateMessage(t, body)).toBe(
      `videoUpload.syncAnalysisTooLong ${JSON.stringify({ duration: 90, max: SYNC_ANALYSIS_MAX_DURATION_MIN })}`,
    );
  });

  it("finalizeSyncGateMessage ignora otras respuestas", () => {
    expect(finalizeSyncGateMessage(t, { ok: true, data: { ready: false } })).toBeNull();
    expect(finalizeSyncGateMessage(t, { errorDetail: { code: "bunny_query_failed" } })).toBeNull();
    expect(finalizeSyncGateMessage(t, null)).toBeNull();
  });
});
