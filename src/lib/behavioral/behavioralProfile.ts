/**
 * VITAS · Behavioral Profile Compositor (Sprint 19)
 *
 * Combines all 7 detector outputs into a single BehavioralProfile.
 * Weights: decisionSpeed 0.20, scanning 0.15, resilience 0.20,
 *          clutch 0.15, leadership 0.10, mentalFatigue 0.10,
 *          unpredictability 0.10.
 *
 * Output: BehavioralProfile with mentalCompositeScore 0-100 +
 *         personalityArchetype.
 */

import type { BehavioralScores } from "@/lib/shared/sessionTypes";
import type { DecisionSpeedProfile, ScanningProfile } from "./types";
import type { ResilienceProfile } from "./resilienceDetector";
import type { ClutchProfile } from "./clutchDetector";
import type { LeadershipProfile } from "./leadershipDetector";
import type { MentalFatigueCurveResult } from "./mentalFatigueCurve";
import type { UnpredictabilityProfile } from "./unpredictabilityDetector";

// ─── Personality Archetypes ──────────────────────────────────────────────

export type PersonalityArchetype =
  | "commander"    // High leadership + resilience
  | "creator"      // High unpredictability + scanning
  | "engine"       // High physical + clutch, balanced mental
  | "ghost"        // High scanning + decision speed, low leadership
  | "warrior"      // High resilience + clutch
  | "architect";   // High scanning + decision speed + unpredictability

export interface BehavioralProfileResult {
  scores: BehavioralScores;
  /** Detailed dimension scores before weighting */
  dimensions: {
    decisionSpeed: number;
    scanningIntelligence: number;
    resilience: number;
    clutchFactor: number;
    leadership: number;
    mentalFatigue: number;
    unpredictability: number;
  };
  /** Top 3 strengths */
  strengths: string[];
  /** Top 2 development areas */
  developmentAreas: string[];
  /** Confidence based on data quality */
  confidence: number;
}

// ─── Dimension Weights ───────────────────────────────────────────────────

const WEIGHTS = {
  decisionSpeed: 0.20,
  scanningIntelligence: 0.15,
  resilience: 0.20,
  clutchFactor: 0.15,
  leadership: 0.10,
  mentalFatigue: 0.10,
  unpredictability: 0.10,
} as const;

// ─── Score Normalization ─────────────────────────────────────────────────

function normalizeDecisionSpeed(profile: DecisionSpeedProfile): number {
  return Math.min(100, Math.max(0, profile.percentileForAge));
}

function normalizeScanning(profile: ScanningProfile): number {
  return Math.min(100, Math.max(0, profile.percentileForAge));
}

function normalizeResilience(profile: ResilienceProfile): number {
  return Math.min(100, Math.max(0, profile.avgScore));
}

function normalizeClutch(profile: ClutchProfile): number {
  // ClutchFactor 0.5-1.5 → 0-100
  const clamped = Math.max(0.5, Math.min(1.5, profile.overallClutchFactor));
  return Math.round((clamped - 0.5) * 100);
}

function normalizeLeadership(profile: LeadershipProfile): number {
  return Math.min(100, Math.max(0, profile.leadershipScore));
}

function normalizeMentalFatigue(result: MentalFatigueCurveResult): number {
  return Math.min(100, Math.max(0, result.mentalFatigueScore));
}

function normalizeUnpredictability(profile: UnpredictabilityProfile): number {
  return Math.min(100, Math.max(0, profile.effectiveCreativity));
}

// ─── Archetype Detection ─────────────────────────────────────────────────

function detectArchetype(dims: BehavioralProfileResult["dimensions"]): PersonalityArchetype {
  const sorted = Object.entries(dims)
    .sort(([, a], [, b]) => b - a);

  const top2 = sorted.slice(0, 2).map(([k]) => k);
  const top1 = top2[0];

  // Commander: leadership + resilience dominant
  if (top2.includes("leadership") && (top2.includes("resilience") || dims.leadership > 70)) {
    return "commander";
  }
  // Creator: unpredictability + scanning
  if (top2.includes("unpredictability") && top2.includes("scanningIntelligence")) {
    return "creator";
  }
  // Warrior: resilience + clutch
  if (top2.includes("resilience") && top2.includes("clutchFactor")) {
    return "warrior";
  }
  // Ghost: scanning + decision speed, low leadership
  if (top2.includes("scanningIntelligence") && top2.includes("decisionSpeed") && dims.leadership < 40) {
    return "ghost";
  }
  // Architect: scanning + decision + unpredictability
  if (dims.scanningIntelligence > 60 && dims.decisionSpeed > 60 && dims.unpredictability > 50) {
    return "architect";
  }
  // Engine: balanced high scores
  if (top1 === "clutchFactor" || top1 === "mentalFatigue") {
    return "engine";
  }

  // Default based on strongest dimension
  if (top1 === "leadership") return "commander";
  if (top1 === "unpredictability") return "creator";
  if (top1 === "resilience") return "warrior";
  return "engine";
}

// ─── Strengths & Development Areas ───────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  decisionSpeed: "Velocidad de decisión",
  scanningIntelligence: "Inteligencia de escaneo",
  resilience: "Resiliencia",
  clutchFactor: "Rendimiento bajo presión",
  leadership: "Liderazgo",
  mentalFatigue: "Resistencia mental",
  unpredictability: "Creatividad",
};

function generateStrengths(dims: BehavioralProfileResult["dimensions"]): string[] {
  return Object.entries(dims)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .filter(([, v]) => v >= 50)
    .map(([k, v]) => `${DIMENSION_LABELS[k]} (${Math.round(v)})`);
}

function generateDevelopmentAreas(dims: BehavioralProfileResult["dimensions"]): string[] {
  return Object.entries(dims)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 2)
    .filter(([, v]) => v < 50)
    .map(([k, v]) => `${DIMENSION_LABELS[k]} (${Math.round(v)})`);
}

// ─── Main Function ───────────────────────────────────────────────────────

export interface CompositorInput {
  decisionSpeed: DecisionSpeedProfile;
  scanning: ScanningProfile;
  resilience: ResilienceProfile;
  clutch: ClutchProfile;
  leadership: LeadershipProfile;
  mentalFatigue: MentalFatigueCurveResult;
  unpredictability: UnpredictabilityProfile;
}

/**
 * Compose a full behavioral profile from all 7 detector outputs.
 */
export function composeBehavioralProfile(input: CompositorInput): BehavioralProfileResult {
  const dimensions = {
    decisionSpeed: normalizeDecisionSpeed(input.decisionSpeed),
    scanningIntelligence: normalizeScanning(input.scanning),
    resilience: normalizeResilience(input.resilience),
    clutchFactor: normalizeClutch(input.clutch),
    leadership: normalizeLeadership(input.leadership),
    mentalFatigue: normalizeMentalFatigue(input.mentalFatigue),
    unpredictability: normalizeUnpredictability(input.unpredictability),
  };

  // Weighted composite
  const mentalComposite = Math.round(
    dimensions.decisionSpeed * WEIGHTS.decisionSpeed +
    dimensions.scanningIntelligence * WEIGHTS.scanningIntelligence +
    dimensions.resilience * WEIGHTS.resilience +
    dimensions.clutchFactor * WEIGHTS.clutchFactor +
    dimensions.leadership * WEIGHTS.leadership +
    dimensions.mentalFatigue * WEIGHTS.mentalFatigue +
    dimensions.unpredictability * WEIGHTS.unpredictability,
  );

  const archetype = detectArchetype(dimensions);

  // Confidence: based on sample counts
  const sampleFactors = [
    Math.min(1, input.decisionSpeed.sampleCount / 10),
    Math.min(1, input.scanning.totalScans / 20),
    Math.min(1, input.resilience.errorCount / 5),
    Math.min(1, (input.clutch.highPressureEvents + input.clutch.lowPressureEvents) / 10),
    Math.min(1, input.leadership.communicationFrequencyPer90 / 5),
    input.mentalFatigue.segments.length >= 3 ? 1 : 0.5,
    Math.min(1, input.unpredictability.eventCount / 10),
  ];
  const confidence = sampleFactors.reduce((s, v) => s + v, 0) / sampleFactors.length;

  return {
    scores: {
      decisionSpeed: dimensions.decisionSpeed,
      scanningIntelligence: dimensions.scanningIntelligence,
      resilience: dimensions.resilience,
      clutchFactor: dimensions.clutchFactor,
      leadership: dimensions.leadership,
      mentalFatigue: dimensions.mentalFatigue,
      unpredictability: dimensions.unpredictability,
      mentalComposite,
      archetype,
    },
    dimensions,
    strengths: generateStrengths(dimensions),
    developmentAreas: generateDevelopmentAreas(dimensions),
    confidence: Math.round(confidence * 100) / 100,
  };
}
