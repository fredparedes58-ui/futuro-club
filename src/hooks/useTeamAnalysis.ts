/**
 * VITAS · useTeamAnalysis Hook (Sprint 8)
 *
 * Combines TeamAnalysisEngine + FormationDetector + RivalAnalysisEngine
 * to provide real-time team-level analytics during video tracking.
 *
 * Usage:
 *   const { homeReport, awayReport, formation, passNetwork, rivalInsights } = useTeamAnalysis({
 *     enabled: true,
 *     analysisTarget: "home", // or "away" for rival scouting
 *   });
 */

import { useState, useRef, useCallback } from "react";
import { TeamAnalysisEngine } from "@/lib/tracking/teamAnalysisEngine";
import type {
  TeamAnalysisReport,
  TeamMetrics,
  PossessionStat,
} from "@/lib/tracking/teamAnalysisEngine";
import {
  detectFormation,
  buildFormationTimeline,
} from "@/lib/tracking/formationDetector";
import type {
  DetectedFormation,
  FormationTimeline,
} from "@/lib/tracking/formationDetector";
import { generateRivalScoutReport } from "@/lib/tracking/rivalAnalysisEngine";
import type { RivalScoutReport } from "@/lib/tracking/rivalAnalysisEngine";
import type { Track, FieldPoint } from "@/lib/yolo/types";
import type { BallTrack } from "@/lib/yolo/ballTracker";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseTeamAnalysisOptions {
  /** Enable team analysis processing */
  enabled?: boolean;
  /** Which team we are scouting against (for rival analysis) */
  rivalTeam?: "home" | "away";
}

export interface UseTeamAnalysisReturn {
  /** Full team analysis report */
  teamReport: TeamAnalysisReport | null;
  /** Home team formation timeline */
  homeFormation: FormationTimeline | null;
  /** Away team formation timeline */
  awayFormation: FormationTimeline | null;
  /** Rival scouting report */
  rivalReport: RivalScoutReport | null;
  /** Latest possession stats */
  possession: PossessionStat | null;
  /** Feed a frame of data */
  processFrame: (
    tracks: Track[],
    identities: Map<number, PlayerIdentity>,
    ballTrack: BallTrack | null,
    ballTeam: "home" | "away" | "contested" | "none",
    timestampMs: number,
  ) => void;
  /** Record a pass event for pass network */
  addPassEvent: (
    team: "home" | "away",
    fromId: number,
    toId: number,
    distanceM: number,
    success: boolean,
    timestampMs: number,
  ) => void;
  /** Record a defensive action */
  addDefensiveAction: (team: "home" | "away", posX: number) => void;
  /** Generate final reports */
  generateReports: () => void;
  /** Reset all state */
  reset: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

const FORMATION_DETECT_INTERVAL = 30_000; // detect formation every 30s

export function useTeamAnalysis(
  options: UseTeamAnalysisOptions = {},
): UseTeamAnalysisReturn {
  const { enabled = false, rivalTeam = "away" } = options;

  const engineRef = useRef(new TeamAnalysisEngine());
  const homeFormationsRef = useRef<DetectedFormation[]>([]);
  const awayFormationsRef = useRef<DetectedFormation[]>([]);
  const lastFormationDetectRef = useRef(0);

  // Accumulate rival positions for gap analysis
  const rivalPositionsRef = useRef<
    Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>
  >([]);

  const [teamReport, setTeamReport] = useState<TeamAnalysisReport | null>(null);
  const [homeFormation, setHomeFormation] = useState<FormationTimeline | null>(null);
  const [awayFormation, setAwayFormation] = useState<FormationTimeline | null>(null);
  const [rivalReport, setRivalReport] = useState<RivalScoutReport | null>(null);
  const [possession, setPossession] = useState<PossessionStat | null>(null);

  const processFrame = useCallback(
    (
      tracks: Track[],
      identities: Map<number, PlayerIdentity>,
      ballTrack: BallTrack | null,
      ballTeam: "home" | "away" | "contested" | "none",
      timestampMs: number,
    ) => {
      if (!enabled) return;

      engineRef.current.processFrame(tracks, identities, ballTrack, ballTeam, timestampMs);

      // Accumulate rival positions for later gap analysis
      const rivalPlayers: Array<{ trackId: number; pos: FieldPoint; speedMs: number }> = [];
      for (const track of tracks) {
        if (!track.lastFieldPos) continue;
        const identity = identities.get(track.id);
        if (identity?.team === rivalTeam) {
          rivalPlayers.push({
            trackId: track.id,
            pos: { fx: track.lastFieldPos.fx, fy: track.lastFieldPos.fy },
            speedMs: track.smoothSpeedMs,
          });
        }
      }
      if (rivalPlayers.length > 0) {
        rivalPositionsRef.current.push(rivalPlayers);
        // Keep max ~1000 frames for memory
        if (rivalPositionsRef.current.length > 1000) {
          rivalPositionsRef.current = rivalPositionsRef.current.slice(-800);
        }
      }

      // Periodic formation detection
      if (timestampMs - lastFormationDetectRef.current >= FORMATION_DETECT_INTERVAL) {
        lastFormationDetectRef.current = timestampMs;

        // Detect formations for both teams
        const homePlayers: Array<{ trackId: number; pos: FieldPoint }> = [];
        const awayPlayers: Array<{ trackId: number; pos: FieldPoint }> = [];

        for (const track of tracks) {
          if (!track.lastFieldPos) continue;
          const identity = identities.get(track.id);
          const entry = { trackId: track.id, pos: track.lastFieldPos };
          if (identity?.team === "home") homePlayers.push(entry);
          else if (identity?.team === "away") awayPlayers.push(entry);
        }

        if (homePlayers.length >= 7) {
          homeFormationsRef.current.push(
            detectFormation(homePlayers, "right", timestampMs),
          );
        }
        if (awayPlayers.length >= 7) {
          awayFormationsRef.current.push(
            detectFormation(awayPlayers, "left", timestampMs),
          );
        }
      }
    },
    [enabled, rivalTeam],
  );

  const addPassEvent = useCallback(
    (
      team: "home" | "away",
      fromId: number,
      toId: number,
      distanceM: number,
      success: boolean,
      timestampMs: number,
    ) => {
      if (!enabled) return;
      engineRef.current.addPassEvent(team, fromId, toId, distanceM, success, timestampMs);
    },
    [enabled],
  );

  const addDefensiveAction = useCallback(
    (team: "home" | "away", posX: number) => {
      if (!enabled) return;
      engineRef.current.addDefensiveAction(team, posX);
    },
    [enabled],
  );

  const generateReports = useCallback(() => {
    // Team analysis
    const report = engineRef.current.generateReport();
    setTeamReport(report);

    // Formation timelines
    const homeTimeline = buildFormationTimeline(homeFormationsRef.current);
    const awayTimeline = buildFormationTimeline(awayFormationsRef.current);
    setHomeFormation(homeTimeline);
    setAwayFormation(awayTimeline);

    // Possession
    if (report.cumulative) {
      setPossession(report.cumulative.possession);
    }

    // Rival scout report
    const rivalFormation =
      rivalTeam === "away"
        ? awayFormationsRef.current[awayFormationsRef.current.length - 1] ?? null
        : homeFormationsRef.current[homeFormationsRef.current.length - 1] ?? null;

    const rivalMetrics =
      rivalTeam === "away" ? report.cumulative.away : report.cumulative.home;
    const rivalPressing =
      rivalTeam === "away"
        ? report.cumulative.pressing.away
        : report.cumulative.pressing.home;
    const rivalPassNet =
      rivalTeam === "away" ? report.awayPassNetwork : report.homePassNetwork;

    const scout = generateRivalScoutReport({
      formation: rivalFormation,
      metrics: rivalMetrics,
      pressing: rivalPressing,
      passNetwork: rivalPassNet,
      possession: report.cumulative.possession,
      rivalPositions: rivalPositionsRef.current,
      durationMs: report.durationMs,
    });
    setRivalReport(scout);
  }, [rivalTeam]);

  const reset = useCallback(() => {
    engineRef.current.reset();
    homeFormationsRef.current = [];
    awayFormationsRef.current = [];
    rivalPositionsRef.current = [];
    lastFormationDetectRef.current = 0;
    setTeamReport(null);
    setHomeFormation(null);
    setAwayFormation(null);
    setRivalReport(null);
    setPossession(null);
  }, []);

  return {
    teamReport,
    homeFormation,
    awayFormation,
    rivalReport,
    possession,
    processFrame,
    addPassEvent,
    addDefensiveAction,
    generateReports,
    reset,
  };
}
