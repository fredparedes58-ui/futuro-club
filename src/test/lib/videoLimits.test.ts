/**
 * videoLimits — límites compartidos cliente + api/ (fase 0 partido completo)
 */
import { describe, it, expect } from "vitest";
import {
  MAX_MATCH_DURATION_MIN,
  MAX_MATCH_DURATION_SEC,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_GB,
  SYNC_ANALYSIS_MAX_DURATION_SEC,
  SYNC_ANALYSIS_GATE_CODE,
  MATCH_DURATION_GATE_CODE,
  VIDEO_LIMIT_SOURCES,
  checkUploadSize,
  checkMatchDuration,
  evaluateSyncAnalysisGate,
  knownDurationSec,
  durationMinutesForDisplay,
} from "@/lib/shared/videoLimits";

describe("videoLimits · constantes", () => {
  it("un partido completo (90' + prórroga + penaltis + margen) cabe: 150 min", () => {
    expect(MAX_MATCH_DURATION_MIN).toBe(150);
    expect(MAX_MATCH_DURATION_SEC).toBe(150 * 60);
    // 90 + 30 de prórroga + ~15 de penaltis/descuento
    expect(MAX_MATCH_DURATION_MIN).toBeGreaterThanOrEqual(90 + 30 + 15);
  });

  it("el tope de subida ya no es 2048 MB: 20 GB (pendiente de validar)", () => {
    expect(MAX_UPLOAD_SIZE_MB).toBe(20480);
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(20480 * 1024 * 1024);
    expect(MAX_UPLOAD_SIZE_GB).toBe(20);
    expect(MAX_UPLOAD_SIZE_MB).toBeGreaterThan(2048);
  });

  it("el análisis síncrono de clips cortos es de 300 s", () => {
    expect(SYNC_ANALYSIS_MAX_DURATION_SEC).toBe(300);
  });

  it("cada constante declara su procedencia (fuente o 'pendiente de validar')", () => {
    expect(VIDEO_LIMIT_SOURCES.MAX_MATCH_DURATION_MIN).toMatch(/producto/);
    expect(VIDEO_LIMIT_SOURCES.MAX_UPLOAD_SIZE_MB).toMatch(/pendiente de validar/);
    expect(VIDEO_LIMIT_SOURCES.SYNC_ANALYSIS_MAX_DURATION_SEC).toMatch(/pendiente de validar/);
  });
});

describe("knownDurationSec", () => {
  it("devuelve la primera duración finita > 0", () => {
    expect(knownDurationSec(0, null, 42)).toBe(42);
    expect(knownDurationSec(10, 42)).toBe(10);
  });
  it("0 / null / NaN / Infinity / negativo = desconocida → null (nunca 0)", () => {
    expect(knownDurationSec(0)).toBeNull();
    expect(knownDurationSec(null, undefined)).toBeNull();
    expect(knownDurationSec(Number.NaN)).toBeNull();
    expect(knownDurationSec(Number.POSITIVE_INFINITY)).toBeNull();
    expect(knownDurationSec(-5)).toBeNull();
  });
});

describe("checkUploadSize", () => {
  it("acepta 2049 MB (antes rechazado) y exactamente el máximo", () => {
    expect(checkUploadSize(2049 * 1024 * 1024).ok).toBe(true);
    expect(checkUploadSize(MAX_UPLOAD_SIZE_BYTES).ok).toBe(true);
  });
  it("rechaza por encima del máximo", () => {
    const r = checkUploadSize(MAX_UPLOAD_SIZE_BYTES + 1);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("file_too_large");
      expect(r.maxBytes).toBe(MAX_UPLOAD_SIZE_BYTES);
    }
  });
});

describe("checkMatchDuration (gate de subida)", () => {
  it("permite un partido de 90' y el límite exacto", () => {
    expect(checkMatchDuration(90 * 60).allowed).toBe(true);
    expect(checkMatchDuration(MAX_MATCH_DURATION_SEC).allowed).toBe(true);
  });
  it("bloquea por encima de 150 min con la duración REAL", () => {
    const g = checkMatchDuration(MAX_MATCH_DURATION_SEC + 1);
    expect(g.allowed).toBe(false);
    if (g.allowed === false) {
      expect(g.reason).toBe(MATCH_DURATION_GATE_CODE);
      expect(g.durationSec).toBe(MAX_MATCH_DURATION_SEC + 1);
      expect(g.maxDurationSec).toBe(MAX_MATCH_DURATION_SEC);
    }
  });
  it("duración desconocida → NO bloquea y NO inventa (durationSec null)", () => {
    expect(checkMatchDuration(null)).toEqual({ allowed: true, durationSec: null });
    expect(checkMatchDuration(0)).toEqual({ allowed: true, durationSec: null });
    expect(checkMatchDuration(undefined)).toEqual({ allowed: true, durationSec: null });
  });
});

describe("evaluateSyncAnalysisGate (clips cortos)", () => {
  it("permite un clip de 4 min y el límite exacto (300 s)", () => {
    expect(evaluateSyncAnalysisGate(240).allowed).toBe(true);
    expect(evaluateSyncAnalysisGate(300).allowed).toBe(true);
  });
  it("rechaza un partido completo", () => {
    const g = evaluateSyncAnalysisGate(95 * 60);
    expect(g.allowed).toBe(false);
    if (g.allowed === false) {
      expect(g.reason).toBe(SYNC_ANALYSIS_GATE_CODE);
      expect(g.durationSec).toBe(95 * 60);
      expect(g.maxDurationSec).toBe(300);
    }
  });
  it("duración desconocida → permitido con durationSec null (no se inventa)", () => {
    expect(evaluateSyncAnalysisGate(null)).toEqual({ allowed: true, durationSec: null });
  });
});

describe("durationMinutesForDisplay", () => {
  it("redondea hacia arriba (150,2 min nunca se muestra como 150)", () => {
    expect(durationMinutesForDisplay(150 * 60 + 12)).toBe(151);
    expect(durationMinutesForDisplay(95 * 60)).toBe(95);
  });
});
