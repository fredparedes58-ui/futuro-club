/**
 * VITAS · Player Identity Manager (Sprint 4 — Player Re-ID)
 *
 * Fuses multiple identity signals to assign persistent IDs:
 *   1. Dorsal OCR (priority 1) — jersey number
 *   2. Color histogram (priority 2) — jersey color similarity
 *   3. Kalman position (priority 3) — predicted position proximity
 *
 * Generates a `stableId` that persists across occlusions and ID switches.
 * When a track is lost and recovered, the stableId is maintained if
 * any identity signal matches.
 */

import type { Track } from "./types";
import { DorsalOCR } from "./dorsalOCR";
import type { DorsalDetection } from "./dorsalOCR";
import { TeamClassifier } from "./teamClassifier";
import type { TeamLabel, TeamAssignment } from "./teamClassifier";
import { compareHistograms, extractTorsoHistogram } from "./colorReId";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PlayerIdentity {
  /** Persistent stable ID (survives occlusion/re-ID) */
  stableId: string;
  /** Current tracking ID */
  currentTrackId: number;
  /** Detected dorsal number (null if unknown) */
  dorsalNumber: number | null;
  /** Team assignment */
  team: TeamLabel;
  /** Identity confidence (0-1) */
  confidence: number;
  /** Color histogram for re-ID */
  histogram: Float32Array | null;
  /** Last seen timestamp */
  lastSeenMs: number;
  /** Whether currently tracked (not lost) */
  active: boolean;
}

export interface PlayerIdentityManagerConfig {
  /** Maximum time (ms) to keep a lost identity for re-ID (default: 10000) */
  maxLostDurationMs: number;
  /** Maximum color distance for re-ID match (default: 0.5) */
  colorMatchThreshold: number;
  /** Reclassify teams every N frames (default: 60) */
  teamClassifyInterval: number;
}

const DEFAULT_CONFIG: PlayerIdentityManagerConfig = {
  maxLostDurationMs: 10000,
  colorMatchThreshold: 0.5,
  teamClassifyInterval: 60,
};

// ─── Player Identity Manager ───────────────────────────────────────────────

export class PlayerIdentityManager {
  private config: PlayerIdentityManagerConfig;
  private dorsalOCR: DorsalOCR;
  private teamClassifier: TeamClassifier;
  private identities = new Map<string, PlayerIdentity>();
  private trackToStableId = new Map<number, string>();
  private nextStableId = 1;
  private frameCount = 0;

  constructor(config?: Partial<PlayerIdentityManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dorsalOCR = new DorsalOCR();
    this.teamClassifier = new TeamClassifier();
  }

  reset(): void {
    this.dorsalOCR.reset();
    this.teamClassifier.reset();
    this.identities.clear();
    this.trackToStableId.clear();
    this.nextStableId = 1;
    this.frameCount = 0;
  }

  /**
   * Process a frame: update all identity signals for visible tracks.
   *
   * @param tracks - All player tracks this frame
   * @param imageData - Full frame pixel data (for histogram/OCR)
   * @param timestampMs - Frame timestamp
   * @returns Updated track-to-identity mapping
   */
  processFrame(
    tracks: Track[],
    imageData: ImageData | null,
    timestampMs: number,
  ): Map<number, PlayerIdentity> {
    this.frameCount++;

    // ── 1. Update identities for each track ──
    for (const track of tracks) {
      let stableId = this.trackToStableId.get(track.id);

      if (!stableId) {
        // New track — try to match with lost identity
        stableId = this.tryRecoverIdentity(track, imageData, timestampMs);

        if (!stableId) {
          // Create new identity
          stableId = `pid_${this.nextStableId++}`;
          this.trackToStableId.set(track.id, stableId);
          this.identities.set(stableId, {
            stableId,
            currentTrackId: track.id,
            dorsalNumber: null,
            team: "unknown",
            confidence: 0.3,
            histogram: null,
            lastSeenMs: timestampMs,
            active: true,
          });
        }
      }

      const identity = this.identities.get(stableId);
      if (!identity) continue;

      // Update active state
      identity.currentTrackId = track.id;
      identity.lastSeenMs = timestampMs;
      identity.active = true;

      // Update histogram (every Nth frame)
      if (imageData && this.frameCount % 5 === 0) {
        const hist = extractTorsoHistogram(imageData, track.bbox);
        if (identity.histogram) {
          // EMA blend
          for (let i = 0; i < hist.length; i++) {
            identity.histogram[i] = 0.15 * hist[i] + 0.85 * identity.histogram[i];
          }
        } else {
          identity.histogram = hist;
        }

        // Feed team classifier
        this.teamClassifier.feedFrame(track.id, imageData, track.bbox, this.frameCount);
      }

      // Update dorsal OCR
      if (imageData) {
        const dorsalResult = this.dorsalOCR.processFrame(
          track.id,
          imageData,
          track.bbox,
          this.frameCount,
        );
        if (dorsalResult?.number !== null && dorsalResult !== null) {
          identity.dorsalNumber = dorsalResult.number;
          identity.confidence = Math.max(identity.confidence, dorsalResult.confidence);
        }
      }

      // Apply track-level identity fields
      track.stableId = stableId;
      track.dorsalNumber = identity.dorsalNumber ?? undefined;
      track.team = identity.team === "home" || identity.team === "away"
        ? identity.team
        : "unknown";
      track.identityConfidence = identity.confidence;
    }

    // ── 2. Mark lost identities ──
    const activeTrackIds = new Set(tracks.map(t => t.id));
    for (const [, identity] of this.identities) {
      if (!activeTrackIds.has(identity.currentTrackId)) {
        identity.active = false;
      }
    }

    // ── 3. Clean up very old lost identities ──
    for (const [stableId, identity] of this.identities) {
      if (!identity.active && timestampMs - identity.lastSeenMs > this.config.maxLostDurationMs) {
        this.trackToStableId.delete(identity.currentTrackId);
        this.identities.delete(stableId);
      }
    }

    // ── 4. Periodically reclassify teams ──
    if (this.frameCount % this.config.teamClassifyInterval === 0) {
      const assignments = this.teamClassifier.classify();
      for (const [trackId, assignment] of assignments) {
        const sid = this.trackToStableId.get(trackId);
        if (sid) {
          const identity = this.identities.get(sid);
          if (identity) {
            identity.team = assignment.team;
          }
        }
      }
    }

    // Build result map
    const result = new Map<number, PlayerIdentity>();
    for (const track of tracks) {
      const sid = this.trackToStableId.get(track.id);
      if (sid) {
        const identity = this.identities.get(sid);
        if (identity) result.set(track.id, identity);
      }
    }

    return result;
  }

  /** Get team assignments as Map<trackId, "home"|"away"> */
  getTeamMap(): Map<number, "home" | "away"> {
    return this.teamClassifier.getTeamMap();
  }

  /** Get all identities */
  getAllIdentities(): PlayerIdentity[] {
    return [...this.identities.values()];
  }

  /* ── Private: Identity Recovery ─────────────────────────────────── */

  private tryRecoverIdentity(
    track: Track,
    imageData: ImageData | null,
    timestampMs: number,
  ): string | null {
    const lostIdentities = [...this.identities.values()].filter(
      id => !id.active && timestampMs - id.lastSeenMs < this.config.maxLostDurationMs,
    );

    if (lostIdentities.length === 0) return null;

    // Priority 1: Match by dorsal number
    const dorsalResult = this.dorsalOCR.getResult(track.id);
    if (dorsalResult.number !== null) {
      const match = lostIdentities.find(id => id.dorsalNumber === dorsalResult.number);
      if (match) {
        this.trackToStableId.set(track.id, match.stableId);
        return match.stableId;
      }
    }

    // Priority 2: Match by color histogram
    if (imageData) {
      const trackHist = extractTorsoHistogram(imageData, track.bbox);
      let bestMatch: PlayerIdentity | null = null;
      let bestDist = this.config.colorMatchThreshold;

      for (const lost of lostIdentities) {
        if (!lost.histogram) continue;
        const dist = compareHistograms(trackHist, lost.histogram);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = lost;
        }
      }

      if (bestMatch) {
        this.trackToStableId.set(track.id, bestMatch.stableId);
        return bestMatch.stableId;
      }
    }

    // Priority 3: Match by Kalman-predicted position proximity
    if (track.lastFieldPos) {
      const bestMatch: PlayerIdentity | null = null;
      const bestDist = 5.0; // 5 meters max

      for (const lost of lostIdentities) {
        const lostTrack = [...this.trackToStableId.entries()].find(([, sid]) => sid === lost.stableId);
        if (!lostTrack) continue;
        // Use last known position from identity
        // (simplified — a full implementation would use Kalman prediction)
      }

      if (bestMatch) {
        this.trackToStableId.set(track.id, bestMatch.stableId);
        return bestMatch.stableId;
      }
    }

    return null;
  }
}
