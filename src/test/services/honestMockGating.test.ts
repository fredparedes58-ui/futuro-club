/**
 * VITAS · Tests — detectores simulados de balón parado y highlights (honestidad)
 *
 * Invariantes (CLAUDE.md #1-3 · .claude/rules/metricas.md):
 *  - un vídeo REAL no puede recibir jugadas/clips inventados: se bloquea con
 *    gate_reason y no se guarda nada;
 *  - lo generado para partidos demo es MOCK declarado (provenance "MOCK");
 *  - lo guardado antes de este cambio (siempre simulado) se lee como MOCK.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  runDetection,
  SetPieceVideoEvents,
  setPieceDetectionGate,
  generateRecommendationsFromEvents,
} from "@/services/real/setPieceVideoDetector";
import { SetPieceCustomStorage } from "@/services/real/setPieceCustomStorage";
import {
  runHighlightsDetection,
  createManualReel,
  reelHasSimulatedClips,
  highlightsDetectionGate,
} from "@/services/real/highlightsDetector";
import { HighlightsStorage } from "@/services/real/highlightsStorage";
import type { SetPieceEvent } from "@/lib/setPiece/types";

beforeEach(() => {
  localStorage.clear();
});

describe("setPieceVideoDetector — sin jugadas inventadas sobre vídeos reales", () => {
  it(
    "vídeo real del usuario ⇒ bloqueado con gate_reason y NADA guardado",
    async () => {
      const res = await runDetection("video_1727_real", "Mi partido real");
      expect(res).toMatchObject({ status: "gated", events: [] });
      expect(typeof (res as { gate_reason: unknown }).gate_reason).toBe("string");
      expect(((res as { gate_reason: string }).gate_reason ?? "").length).toBeGreaterThan(0);
      expect(SetPieceVideoEvents.getAll()).toHaveLength(0);
      expect(SetPieceCustomStorage.getCustomEvents()).toHaveLength(0);
    },
    10_000,
  );

  it("partido demo ⇒ jugadas de EJEMPLO con provenance MOCK (sin 🎥 «desde vídeo»)", async () => {
    const res = await runDetection("demo_match_riveralfc_2026_05_24", "vs Rival FC", { eventCount: 3 });
    expect(res.status).toBe("mock");
    if (res.status !== "mock") return;
    expect(res.provenance).toBe("MOCK");
    expect(res.events).toHaveLength(3);
    for (const e of res.events) {
      expect(e.provenance).toBe("MOCK");
      expect(e.matchLabel).not.toContain("🎥");
    }
    expect(SetPieceVideoEvents.getAll().every((e) => e.provenance === "MOCK")).toBe(true);
  });

  it("eventos guardados ANTES del cambio (sin provenance) se leen como MOCK", () => {
    localStorage.setItem(
      "vitas_setpiece_video_events",
      JSON.stringify([{ id: "video_event_x_0", sourceVideoId: "video_x", source: "video" }]),
    );
    expect(SetPieceVideoEvents.getAll()[0].provenance).toBe("MOCK");
  });

  it("gate: solo los partidos demo quedan sin bloquear", () => {
    expect(setPieceDetectionGate("demo_match_cdnorte_2026_05_03")).toBeNull();
    expect(setPieceDetectionGate("video_123")).toBeTruthy();
  });

  it("las recomendaciones derivadas NO afirman venir «de tus vídeos»", async () => {
    const res = await runDetection("demo_match_tigresfc_2026_05_10", "vs Tigres", { eventCount: 14 });
    const recs = generateRecommendationsFromEvents(
      (res.status === "mock" ? res.events : []).map((e) => ({ ...e, isOffensive: true })) as SetPieceEvent[],
    );
    for (const r of recs) {
      expect(r.description).not.toMatch(/tus videos|tus vídeos/i);
      expect(r.basedOn).toMatch(/ejemplo/i);
    }
  });
});

describe("highlightsDetector — sin momentos inventados sobre vídeos reales", () => {
  const base = {
    videoTitle: "Mi partido",
    videoUrl: "",
    videoDurationSec: 5400,
    targetDurationSec: 30,
    momentTypes: ["goal", "shot"] as const,
  };

  it(
    "vídeo real ⇒ bloqueado con gate_reason y ningún reel guardado",
    async () => {
      const res = await runHighlightsDetection({ ...base, momentTypes: [...base.momentTypes], videoId: "video_real_1" });
      expect(res).toMatchObject({ status: "gated", reel: null });
      expect(HighlightsStorage.getAll()).toHaveLength(0);
    },
    10_000,
  );

  it("partido demo ⇒ reel de EJEMPLO (MOCK) con clips simulados", async () => {
    const res = await runHighlightsDetection({
      ...base,
      momentTypes: [...base.momentTypes],
      videoId: "demo_reel_riveralfc_2026_05_24",
    });
    expect(res.status).toBe("mock");
    if (res.status !== "mock") return;
    expect(res.reel.provenance).toBe("MOCK");
    expect(reelHasSimulatedClips(res.reel)).toBe(true);
  });

  it("vídeo real ⇒ reel VACÍO para clips manuales (nada inventado)", () => {
    const reel = createManualReel({ videoId: "video_real_1", videoTitle: "Mi partido", videoUrl: "" });
    expect(reel.clips).toEqual([]);
    expect(reel.provenance).toBeUndefined();
    expect(reelHasSimulatedClips(reel)).toBe(false);
    expect(highlightsDetectionGate("video_real_1")).toBeTruthy();
  });

  it("un clip no manual (reels antiguos) cuenta como simulado", () => {
    expect(reelHasSimulatedClips({ clips: [{ manual: false } as never] })).toBe(true);
    expect(reelHasSimulatedClips({ clips: [{ manual: true } as never] })).toBe(false);
  });
});
