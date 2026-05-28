/**
 * VITAS · Drill Classifier
 *
 * Classifies each training segment into a specific drill category.
 * Maps classified drills to the existing DRILLS_LIBRARY when possible.
 *
 * Sprint 14: Coaching Assistant — Segmentation & Metrics
 */

import type { Track, BallTrack } from "@/lib/yolo/types";
import type {
  TrainingSegment,
  ClassifiedDrill,
  DrillCategory,
} from "@/lib/shared/sessionTypes";
import { DRILLS_LIBRARY, type DrillDocument } from "../../data/drillsLibrary";

// ─── Detection Signal Ranges (for matching with DRILLS_LIBRARY) ────────────

interface DetectionSignals {
  playerSpreadRange: [number, number]; // [min, max] meters
  intensityRange: [number, number]; // [min, max] avg speed m/s
  ballTouchRange: [number, number]; // [min, max] touches/min
  playerCountRange: [number, number]; // [min, max] players
}

/** Category detection profiles — used when DRILLS_LIBRARY match fails */
const CATEGORY_PROFILES: Record<DrillCategory, DetectionSignals> = {
  rondo: {
    playerSpreadRange: [3, 8],
    intensityRange: [1.0, 3.0],
    ballTouchRange: [20, 60],
    playerCountRange: [4, 8],
  },
  possession: {
    playerSpreadRange: [8, 20],
    intensityRange: [1.5, 3.5],
    ballTouchRange: [10, 30],
    playerCountRange: [6, 16],
  },
  positional_play: {
    playerSpreadRange: [10, 25],
    intensityRange: [1.5, 3.5],
    ballTouchRange: [8, 25],
    playerCountRange: [8, 16],
  },
  small_sided_game: {
    playerSpreadRange: [15, 35],
    intensityRange: [2.5, 5.0],
    ballTouchRange: [10, 30],
    playerCountRange: [6, 14],
  },
  full_game: {
    playerSpreadRange: [25, 50],
    intensityRange: [2.5, 5.5],
    ballTouchRange: [5, 20],
    playerCountRange: [14, 22],
  },
  shooting_drill: {
    playerSpreadRange: [5, 20],
    intensityRange: [2.0, 4.5],
    ballTouchRange: [5, 15],
    playerCountRange: [3, 10],
  },
  pressing_drill: {
    playerSpreadRange: [8, 20],
    intensityRange: [3.0, 5.5],
    ballTouchRange: [8, 20],
    playerCountRange: [6, 16],
  },
  transition_drill: {
    playerSpreadRange: [10, 30],
    intensityRange: [3.0, 5.5],
    ballTouchRange: [8, 20],
    playerCountRange: [6, 16],
  },
  individual_technique: {
    playerSpreadRange: [2, 10],
    intensityRange: [0.5, 2.5],
    ballTouchRange: [15, 50],
    playerCountRange: [1, 6],
  },
  set_piece_practice: {
    playerSpreadRange: [10, 25],
    intensityRange: [0.5, 2.0],
    ballTouchRange: [3, 10],
    playerCountRange: [6, 16],
  },
  physical_conditioning: {
    playerSpreadRange: [3, 15],
    intensityRange: [3.5, 6.0],
    ballTouchRange: [0, 3],
    playerCountRange: [4, 22],
  },
  warmup: {
    playerSpreadRange: [3, 15],
    intensityRange: [0.3, 2.0],
    ballTouchRange: [0, 10],
    playerCountRange: [4, 22],
  },
  cooldown: {
    playerSpreadRange: [3, 15],
    intensityRange: [0.2, 1.5],
    ballTouchRange: [0, 5],
    playerCountRange: [4, 22],
  },
};

// ─── Segment-to-Category Mapping ───────────────────────────────────────────

/** Map SegmentType to candidate DrillCategories */
function getCandidateCategories(
  segmentType: TrainingSegment["type"],
): DrillCategory[] {
  switch (segmentType) {
    case "warmup":
      return ["warmup"];
    case "cooldown":
      return ["cooldown"];
    case "technical":
      return [
        "rondo",
        "individual_technique",
        "possession",
        "shooting_drill",
      ];
    case "tactical":
      return [
        "positional_play",
        "possession",
        "pressing_drill",
        "transition_drill",
        "set_piece_practice",
      ];
    case "physical":
      return ["physical_conditioning"];
    case "game_small_sided":
      return ["small_sided_game"];
    case "game_full":
      return ["full_game"];
    case "transition_break":
      return ["warmup", "cooldown"];
  }
}

// ─── Signal Matching ───────────────────────────────────────────────────────

function signalFitScore(
  signals: TrainingSegment["signals"],
  profile: DetectionSignals,
): number {
  let score = 0;
  let checks = 0;

  // Player spread
  if (
    signals.playerSpread >= profile.playerSpreadRange[0] &&
    signals.playerSpread <= profile.playerSpreadRange[1]
  ) {
    score += 1;
  } else {
    const mid =
      (profile.playerSpreadRange[0] + profile.playerSpreadRange[1]) / 2;
    const dist = Math.abs(signals.playerSpread - mid);
    const range = profile.playerSpreadRange[1] - profile.playerSpreadRange[0];
    score += Math.max(0, 1 - dist / (range || 1));
  }
  checks++;

  // Speed
  if (
    signals.avgSpeed >= profile.intensityRange[0] &&
    signals.avgSpeed <= profile.intensityRange[1]
  ) {
    score += 1;
  } else {
    const mid = (profile.intensityRange[0] + profile.intensityRange[1]) / 2;
    const dist = Math.abs(signals.avgSpeed - mid);
    const range = profile.intensityRange[1] - profile.intensityRange[0];
    score += Math.max(0, 1 - dist / (range || 1));
  }
  checks++;

  // Ball touch frequency
  if (
    signals.ballTouchFrequency >= profile.ballTouchRange[0] &&
    signals.ballTouchFrequency <= profile.ballTouchRange[1]
  ) {
    score += 1;
  } else {
    const mid = (profile.ballTouchRange[0] + profile.ballTouchRange[1]) / 2;
    const dist = Math.abs(signals.ballTouchFrequency - mid);
    const range = profile.ballTouchRange[1] - profile.ballTouchRange[0];
    score += Math.max(0, 1 - dist / (range || 1));
  }
  checks++;

  // Player count
  if (
    signals.playerCount >= profile.playerCountRange[0] &&
    signals.playerCount <= profile.playerCountRange[1]
  ) {
    score += 1;
  }
  checks++;

  return score / checks;
}

// ─── Library Matching ──────────────────────────────────────────────────────

/** Maps drill library categories to our DrillCategory type */
function mapLibraryCategory(
  libCategory: DrillDocument["category"],
): DrillCategory {
  const mapping: Record<DrillDocument["category"], DrillCategory> = {
    tecnica: "individual_technique",
    tactica: "positional_play",
    fisico: "physical_conditioning",
    disparo: "shooting_drill",
    transicion: "transition_drill",
    pressing: "pressing_drill",
  };
  return mapping[libCategory];
}

/**
 * Try to match a classified drill with an entry in DRILLS_LIBRARY
 */
function findLibraryMatch(
  category: DrillCategory,
  playerCount: number,
  _signals: TrainingSegment["signals"],
): string | null {
  // Filter library drills that could match
  const candidates = DRILLS_LIBRARY.filter((drill) => {
    const drillCategory = mapLibraryCategory(drill.category);

    // Category match or related category
    if (drillCategory !== category) {
      // Special case: rondo is in "tecnica" category
      if (category === "rondo" && drill.category === "tecnica") {
        return drill.name.toLowerCase().includes("rondo");
      }
      return false;
    }

    // Player count compatibility (drill.playerCount is string like "6" or "10-12")
    const countStr = drill.playerCount;
    if (countStr.includes("-")) {
      const [min, max] = countStr.split("-").map(Number);
      if (playerCount < min - 2 || playerCount > max + 2) return false;
    } else {
      const expected = parseInt(countStr, 10);
      if (Math.abs(playerCount - expected) > 3) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  // Return the first match (could be improved with better scoring)
  return candidates[0].id;
}

// ─── Subcategory Generation ────────────────────────────────────────────────

function generateSubcategory(
  category: DrillCategory,
  playerCount: number,
  signals: TrainingSegment["signals"],
): string {
  switch (category) {
    case "rondo": {
      // Estimate format: N-2 attackers vs 2 defenders
      const defenders = Math.min(3, Math.max(1, Math.floor(playerCount / 3)));
      return `rondo_${playerCount - defenders}v${defenders}`;
    }
    case "small_sided_game": {
      const perTeam = Math.floor(playerCount / 2);
      return `ssg_${perTeam}v${perTeam}`;
    }
    case "full_game":
      return playerCount >= 18 ? "game_9v9" : "game_7v7";
    case "possession":
      return signals.playerSpread > 15
        ? "possession_large_space"
        : "possession_reduced";
    case "pressing_drill":
      return signals.avgSpeed > 4.0
        ? "pressing_high_intensity"
        : "pressing_positional";
    case "transition_drill":
      return "transition_attack_defense";
    default:
      return category;
  }
}

// ─── Estimate Metrics ──────────────────────────────────────────────────────

function estimateDrillMetrics(
  segment: TrainingSegment,
  tracks: Track[],
  ballTrack: BallTrack | null,
): ClassifiedDrill["metrics"] {
  const activeTracks = tracks.filter((t) => t.age === 0);
  const totalPlayers = activeTracks.length || 1;

  // Estimate touches per player from ball touch frequency
  const totalTouchesEstimate =
    segment.signals.ballTouchFrequency * segment.durationMin;
  const avgTouchesPerPlayer = totalTouchesEstimate / totalPlayers;

  // Estimate passes per minute (subset of touches)
  const avgPassesPerMinute = segment.signals.ballTouchFrequency * 0.6; // ~60% of touches are passes

  // Pressure intensity based on speed variance and proximity
  const pressureIntensity = Math.min(
    100,
    Math.round(
      (segment.signals.avgSpeed / 5.0) * 50 +
        (segment.signals.ballTouchFrequency / 30) * 50,
    ),
  );

  // Estimate transitions from speed changes
  const transitionCount = Math.round(segment.durationMin * 0.5); // rough estimate

  // Goal attempts from shooting-related patterns
  const goalAttempts =
    segment.type === "game_small_sided" || segment.type === "game_full"
      ? Math.round(segment.durationMin * 0.3)
      : 0;

  return {
    avgTouchesPerPlayer: Math.round(avgTouchesPerPlayer * 10) / 10,
    avgPassesPerMinute: Math.round(avgPassesPerMinute * 10) / 10,
    pressureIntensity,
    transitionCount,
    goalAttempts,
  };
}

// ─── Main Classifier ───────────────────────────────────────────────────────

export interface ClassifierInput {
  segments: TrainingSegment[];
  /** Latest track snapshot for each segment (index aligned) */
  segmentTracks: Track[][];
  ballTrack: BallTrack | null;
}

/**
 * Classify each training segment into a specific drill category.
 *
 * Algorithm:
 * 1. For each segment, get candidate categories based on segment type
 * 2. Score each candidate against the segment's signals
 * 3. Pick the best-scoring category
 * 4. Try to match with DRILLS_LIBRARY
 * 5. Generate subcategory and metrics
 */
export function classifyDrills(input: ClassifierInput): ClassifiedDrill[] {
  const { segments, segmentTracks, ballTrack } = input;

  return segments.map((segment, i) => {
    const tracks = segmentTracks[i] ?? [];
    const candidates = getCandidateCategories(segment.type);

    // Score each candidate
    let bestCategory: DrillCategory = candidates[0];
    let bestScore = 0;

    for (const cat of candidates) {
      const profile = CATEGORY_PROFILES[cat];
      const score = signalFitScore(segment.signals, profile);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat;
      }
    }

    const playerCount = segment.signals.playerCount;

    // Try to match with library
    const matchedDrillId = findLibraryMatch(
      bestCategory,
      playerCount,
      segment.signals,
    );

    // Generate subcategory
    const subcategory = generateSubcategory(
      bestCategory,
      playerCount,
      segment.signals,
    );

    // Estimate space used
    const spaceUsedM2 =
      Math.PI * segment.signals.playerSpread * segment.signals.playerSpread;

    // Estimate ball in play percentage
    const ballInPlayPct =
      segment.signals.ballTouchFrequency > 5
        ? Math.min(100, segment.signals.ballTouchFrequency * 3)
        : 20;

    // Estimate metrics
    const metrics = estimateDrillMetrics(segment, tracks, ballTrack);

    return {
      segmentIndex: segment.segmentIndex,
      category: bestCategory,
      subcategory,
      playerCount,
      estimatedFormat:
        bestCategory === "small_sided_game" || bestCategory === "full_game"
          ? `${Math.floor(playerCount / 2)}v${Math.floor(playerCount / 2)}`
          : bestCategory === "rondo"
            ? subcategory.replace("rondo_", "")
            : `${playerCount} jugadores`,
      spaceUsedM2: Math.round(spaceUsedM2),
      ballInPlayPct: Math.round(ballInPlayPct),
      matchedDrillId,
      metrics,
      confidence: Math.round(bestScore * 100) / 100,
    };
  });
}
