/**
 * VITAS · Agents Router
 * Consolidates Edge agent endpoints into one Vercel function.
 * Includes report agents needed by pipeline-orchestrator.
 */
import { errorResponse } from "../_lib/apiResponse";

import phvCalculator from "./_phv-calculator";
import playerSimilarity from "./_player-similarity";
import roleProfile from "./_role-profile";
import scoutInsight from "./_scout-insight";
import tacticalLabel from "./_tactical-label";
import teamIntelligence from "./_team-intelligence";
import invalidateCache from "./_invalidate-cache";
import pipelineOrchestrator from "./_pipeline-orchestrator";
// Report agents (called by pipeline-orchestrator for 6 parallel reports)
import playerReport from "./_player-report";
import labBiomechanicsReport from "./_lab-biomechanics-report";
import dnaProfile from "./_dna-profile";
import bestMatchNarrator from "./_best-match-narrator";
import projectionReport from "./_projection-report";
import developmentPlan from "./_development-plan";
// Supporting agents
import vsiCalculator from "./_vsi-calculator";
import scanDetector from "./_scan-detector";
// Sprint 7: fatigue report agent
import fatigueReport from "./_fatigue-report";
// Sprint 8: team + rival report agents
import teamReport from "./_team-report";
import rivalScoutReport from "./_rival-scout-report";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "phv-calculator": phvCalculator,
  "player-similarity": playerSimilarity,
  "role-profile": roleProfile,
  "scout-insight": scoutInsight,
  "tactical-label": tacticalLabel,
  "team-intelligence": teamIntelligence,
  "invalidate-cache": invalidateCache,
  "pipeline-orchestrator": pipelineOrchestrator,
  // Report agents
  "player-report": playerReport,
  "lab-biomechanics-report": labBiomechanicsReport,
  "dna-profile": dnaProfile,
  "best-match-narrator": bestMatchNarrator,
  "projection-report": projectionReport,
  "development-plan": developmentPlan,
  // Supporting
  "vsi-calculator": vsiCalculator,
  "scan-detector": scanDetector,
  // Sprint 7: fatigue report
  "fatigue-report": fatigueReport,
  // Sprint 8: team + rival reports
  "team-report": teamReport,
  "rival-scout-report": rivalScoutReport,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Agent "${action}" not found`, 404);
  return fn(req);
}
