/**
 * VITAS · Scanning Intelligence Detector (Sprint 17)
 *
 * Extends existing scan detection. Correlates scans in 10s pre-reception
 * window with quality of decision post-reception.
 *
 * Input: ScanEvent[] (from PoseAnalyzer) + LinkedEvent[].
 * Output: ScanningProfile with avgScansPreReception, scanEffectiveness,
 *         percentileForAge.
 */

import type { LinkedEvent, ScanCorrelation, ScanningProfile, DetectorConfig } from "./types";
import { DEFAULT_DETECTOR_CONFIG } from "./types";

// ─── ScanEvent (from poseAnalyzer.ts) ────────────────────────────────────

interface ScanEvent {
  trackId: number;
  timestampMs: number;
  direction: "left" | "right";
  durationMs: number;
}

// ─── Age-based benchmarks ────────────────────────────────────────────────

/** Scanning frequency benchmarks: scans per possession/reception window */
const SCAN_BENCHMARKS: Record<string, { avg: number; elite: number }> = {
  "sub-10":  { avg: 0.3, elite: 1.0 },
  "sub-12":  { avg: 0.5, elite: 1.5 },
  "sub-14":  { avg: 1.0, elite: 2.5 },
  "sub-16":  { avg: 1.5, elite: 3.5 },
  "sub-18":  { avg: 2.0, elite: 4.0 },
  "adult":   { avg: 3.0, elite: 6.0 },
};

function getAgeGroup(age: number): string {
  if (age < 10) return "sub-10";
  if (age < 12) return "sub-12";
  if (age < 14) return "sub-14";
  if (age < 16) return "sub-16";
  if (age < 18) return "sub-18";
  return "adult";
}

function estimatePercentile(avgScans: number, age: number): number {
  const group = getAgeGroup(age);
  const bench = SCAN_BENCHMARKS[group] ?? SCAN_BENCHMARKS["sub-14"];

  if (avgScans >= bench.elite) return Math.min(99, 90 + (avgScans - bench.elite) / bench.elite * 10);
  if (avgScans >= bench.avg) {
    const range = bench.elite - bench.avg;
    const pos = (avgScans - bench.avg) / (range || 1);
    return 50 + pos * 40; // 50-90
  }
  // Below average
  const ratio = avgScans / (bench.avg || 1);
  return Math.max(1, ratio * 50);
}

// ─── Constants ───────────────────────────────────────────────────────────

/** Pre-reception scan window (10 seconds before reception) */
const SCAN_WINDOW_PRE_MS = 10_000;

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Detect scanning intelligence for a specific player.
 * Correlates scans before each reception with decision quality.
 */
export function detectScanningIntelligence(
  scanEvents: ScanEvent[],
  linkedEvents: LinkedEvent[],
  trackId: number,
  config: Partial<DetectorConfig> = {},
): ScanningProfile {
  const cfg = { ...DEFAULT_DETECTOR_CONFIG, ...config };

  // Filter for this player
  const playerScans = scanEvents.filter(s => s.trackId === trackId);
  const playerEvents = linkedEvents.filter(
    e => e.trackId === trackId && e.confidence >= cfg.minConfidence,
  );

  if (playerEvents.length === 0) {
    return {
      trackId,
      avgScansPreReception: 0,
      scanEffectiveness: 0,
      percentileForAge: 50,
      totalScans: playerScans.length,
      correlations: [],
      scansPerMinute: 0,
    };
  }

  // Build correlations: for each linked event, count scans in pre-reception window
  const correlations: ScanCorrelation[] = [];

  for (const event of playerEvents) {
    const windowStart = event.receptionMs - SCAN_WINDOW_PRE_MS;
    const windowEnd = event.receptionMs;

    const scansInWindow = playerScans.filter(
      s => s.timestampMs >= windowStart && s.timestampMs <= windowEnd,
    );

    const scanCount = scansInWindow.length;
    const isGoodDecision = event.outcome === "successful";

    correlations.push({
      eventReceptionMs: event.receptionMs,
      trackId,
      scansPreReception: scanCount,
      decisionQuality: event.outcome,
      decisionTimeMs: event.decisionTimeMs,
      scanEffective: scanCount > 0 && isGoodDecision,
    });
  }

  // Calculate aggregates
  const scanCounts = correlations.map(c => c.scansPreReception);
  const avgScansPreReception = scanCounts.length > 0
    ? scanCounts.reduce((s, v) => s + v, 0) / scanCounts.length
    : 0;

  // Scan effectiveness: ratio of events where scans led to good decisions
  const eventsWithScans = correlations.filter(c => c.scansPreReception > 0);
  const effectiveScans = eventsWithScans.filter(c => c.scanEffective);
  const scanEffectiveness = eventsWithScans.length > 0
    ? effectiveScans.length / eventsWithScans.length
    : 0;

  // Calculate scans per minute from total duration
  const timeSpan = playerEvents.length > 1
    ? playerEvents[playerEvents.length - 1].executionMs - playerEvents[0].receptionMs
    : 0;
  const minutesPlayed = timeSpan / 60_000;
  const scansPerMinute = minutesPlayed > 0
    ? playerScans.length / minutesPlayed
    : 0;

  return {
    trackId,
    avgScansPreReception: Math.round(avgScansPreReception * 100) / 100,
    scanEffectiveness: Math.round(scanEffectiveness * 100) / 100,
    percentileForAge: Math.round(estimatePercentile(avgScansPreReception, cfg.playerAge)),
    totalScans: playerScans.length,
    correlations,
    scansPerMinute: Math.round(scansPerMinute * 100) / 100,
  };
}

/**
 * Detect scanning intelligence for all players in events.
 */
export function detectAllScanningIntelligence(
  scanEvents: ScanEvent[],
  linkedEvents: LinkedEvent[],
  config: Partial<DetectorConfig> = {},
): ScanningProfile[] {
  const trackIds = [...new Set(linkedEvents.map(e => e.trackId))];
  return trackIds.map(id => detectScanningIntelligence(scanEvents, linkedEvents, id, config));
}
