/**
 * tusUploadSession — persistencia de sesiones TUS reanudables y su descarte.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TUS_SESSIONS_STORAGE_KEY,
  RESUME_MIN_REMAINING_SEC,
  loadTusSession,
  saveTusSession,
  clearTusSession,
  clearTusSessionsForVideo,
  tusErrorStatus,
  isTusSessionRejection,
  type TusUploadSession,
} from "@/lib/tusUploadSession";

const NOW = 1_800_000_000;

function session(videoId: string, extra: Partial<TusUploadSession> = {}): TusUploadSession {
  return {
    videoId,
    uploadUrl: `https://video.bunnycdn.com/library/42/videos/${videoId}`,
    authSignature: "sig",
    authExpire: NOW + 86400,
    libraryId: 42,
    playerId: null,
    tusUploadUrl: null,
    savedAt: 0,
    ...extra,
  };
}

describe("tusUploadSession", () => {
  beforeEach(() => localStorage.clear());

  it("guarda y reanuda la sesión del mismo fichero y jugador", () => {
    saveTusSession("fp-a", session("v-a", { playerId: "p1" }));
    expect(loadTusSession("fp-a", { playerId: "p1", nowSec: NOW })?.videoId).toBe("v-a");
    expect(loadTusSession("fp-a", { playerId: "p2", nowSec: NOW })).toBeNull();
  });

  it("descarta (y purga) sesiones que caducan en menos de RESUME_MIN_REMAINING_SEC", () => {
    saveTusSession("fp-a", session("v-a", { authExpire: NOW + RESUME_MIN_REMAINING_SEC - 1 }));
    expect(loadTusSession("fp-a", { playerId: null, nowSec: NOW })).toBeNull();
    expect(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY)).toBeNull();
  });

  it("clearTusSession borra solo esa huella", () => {
    saveTusSession("fp-a", session("v-a"));
    saveTusSession("fp-b", session("v-b"));
    clearTusSession("fp-a");
    expect(loadTusSession("fp-a", { playerId: null, nowSec: NOW })).toBeNull();
    expect(loadTusSession("fp-b", { playerId: null, nowSec: NOW })?.videoId).toBe("v-b");
  });

  it("clearTusSessionsForVideo borra toda sesión de ese vídeo (al borrarlo) y conserva el resto", () => {
    saveTusSession("fp-a", session("v-del"));
    saveTusSession("fp-a2", session("v-del", { playerId: "p1" }));
    saveTusSession("fp-b", session("v-keep"));
    clearTusSessionsForVideo("v-del");
    expect(loadTusSession("fp-a", { playerId: null, nowSec: NOW })).toBeNull();
    expect(loadTusSession("fp-a2", { playerId: "p1", nowSec: NOW })).toBeNull();
    expect(loadTusSession("fp-b", { playerId: null, nowSec: NOW })?.videoId).toBe("v-keep");

    clearTusSessionsForVideo("v-keep");
    expect(localStorage.getItem(TUS_SESSIONS_STORAGE_KEY)).toBeNull();
  });

  it("clearTusSessionsForVideo no rompe con almacenamiento corrupto o id vacío", () => {
    localStorage.setItem(TUS_SESSIONS_STORAGE_KEY, "{not json");
    expect(() => clearTusSessionsForVideo("v")).not.toThrow();
    expect(() => clearTusSessionsForVideo("")).not.toThrow();
  });

  describe("tusErrorStatus", () => {
    it("lee el código de un DetailedError de tus-js-client", () => {
      expect(tusErrorStatus({ originalResponse: { getStatus: () => 401 } })).toBe(401);
    });
    it("null si no hay respuesta HTTP (red caída, abortado) o no es un error de tus", () => {
      expect(tusErrorStatus(new Error("network down"))).toBeNull();
      expect(tusErrorStatus({ originalResponse: null })).toBeNull();
      expect(tusErrorStatus({ originalResponse: { getStatus: () => "401" } })).toBeNull();
      expect(tusErrorStatus(null)).toBeNull();
      expect(tusErrorStatus("x")).toBeNull();
    });
  });

  describe("isTusSessionRejection", () => {
    it.each([400, 401, 403, 404, 410, 413])("HTTP %i = rechazo definitivo de la sesión", (s) => {
      expect(isTusSessionRejection(s)).toBe(true);
    });
    it.each([null, 409, 423, 500, 502, 503, 200, 0])(
      "%s = transitorio o sin respuesta → la sesión se conserva",
      (s) => {
        expect(isTusSessionRejection(s as number | null)).toBe(false);
      },
    );
  });
});
