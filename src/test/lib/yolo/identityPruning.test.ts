/**
 * VITAS · bounded per-track memory in the identity stack.
 *
 * DorsalOCR and PlayerIdentityManager kept one entry per ByteTrack id for the
 * whole match (a fresh id is issued after every occlusion). Stale ids are now
 * forgotten. Kit colour only, never the face (.claude/rules/identidad.md).
 */
import { describe, it, expect } from "vitest";
import { DorsalOCR } from "@/lib/yolo/dorsalOCR";
import { PlayerIdentityManager } from "@/lib/yolo/playerIdentityManager";
import type { Track } from "@/lib/yolo/types";
import { KITS, kitPatch, multiPlayerFrame, PATCH_BBOX } from "./kitPatches";

function track(id: number, bbox: [number, number, number, number]): Track {
  return {
    id,
    bbox,
    keypoints: [],
    age: 0,
    positions: [],
    lastFieldPos: null,
    lastTimestampMs: 0,
    speedMs: 0,
    smoothSpeedMs: 0,
    accelMs2: 0,
    distanceM: 0,
    sprintCount: 0,
  };
}

describe("DorsalOCR — stale track pruning", () => {
  it("forgets tracks not processed for maxStaleFrames", () => {
    const ocr = new DorsalOCR({ maxStaleFrames: 50 });
    const frame = kitPatch(KITS.white);
    for (let k = 0; k < 40; k++) {
      // Each short-lived track is seen once, 20 frames after the previous one.
      ocr.processFrame(500 + k, frame, PATCH_BBOX, k * 20);
    }
    // At frame 780 only tracks processed at frames ≥ 730 remain (3 of 40).
    expect(ocr.trackedCount).toBeLessThanOrEqual(3);
    expect(ocr.getResult(500).totalFrames).toBe(0);
  });

  it("keeps a live track that keeps being processed", () => {
    const ocr = new DorsalOCR({ maxStaleFrames: 50 });
    const frame = kitPatch(KITS.white);
    for (let f = 0; f <= 500; f += 5) ocr.processFrame(1, frame, PATCH_BBOX, f);
    expect(ocr.trackedCount).toBe(1);
    expect(ocr.getResult(1).totalFrames).toBeGreaterThan(90);
  });
});

describe("PlayerIdentityManager — colour re-ID + expiry releases old track ids", () => {
  it("recovers a lost red player by kit colour and later forgets both of its track ids", () => {
    const mgr = new PlayerIdentityManager();
    const { frame, bboxes } = multiPlayerFrame([
      { kit: KITS.red, opts: { seed: 4 } },
      { kit: KITS.blue, opts: { seed: 8 } },
    ]);
    const [redBox, blueBox] = bboxes;

    // Frames 1-10: red = track 1, blue = track 2 (signatures stored on frames 5, 10).
    let t = 0;
    for (let f = 1; f <= 10; f++) mgr.processFrame([track(1, redBox), track(2, blueBox)], frame, (t += 100));
    // Frame 11: the red player is occluded → identity of track 1 becomes lost.
    mgr.processFrame([track(2, blueBox)], frame, (t += 100));
    // Frame 12: ByteTrack re-issues the red player as track 11.
    const recovered = mgr.processFrame([track(11, redBox), track(2, blueBox)], frame, (t += 100));
    const redIdentity = recovered.get(11)?.stableId;
    expect(redIdentity).toBeDefined();
    expect(redIdentity).not.toBe(recovered.get(2)?.stableId);
    expect(mgr.getAllIdentities().some((i) => i.stableId === redIdentity)).toBe(true);

    // The red player leaves for > maxLostDurationMs (10 s) → identity expires.
    mgr.processFrame([track(2, blueBox)], frame, (t += 100));
    mgr.processFrame([track(2, blueBox)], frame, (t += 11_000));

    expect(mgr.getAllIdentities().some((i) => i.stableId === redIdentity)).toBe(false);
    // Both old track ids (1 and 11) are released; only the live blue track stays mapped.
    expect(mgr.mappedTrackCount).toBe(1);
  });
});
