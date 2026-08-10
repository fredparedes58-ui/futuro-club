/**
 * VITAS · Team Analysis Engine (Sprint 8)
 *
 * Computes team-level metrics from all tracked players:
 *   - Team centroid (center of mass)
 *   - Team spread (convex hull area)
 *   - Defensive line height
 *   - PPDA (Passes Per Defensive Action)
 *   - Build-up speed
 *   - Possession % (from ball tracking)
 *   - Pass network (edges between players)
 *   - Pressing intensity
 *
 * Operates on Track[] + BallTrack + team assignments from Re-ID.
 */

import type { Track, FieldPoint, FieldPosition } from "@/lib/yolo/types";
import type { BallTrack } from "@/lib/yolo/ballTracker";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamMetrics {
  /** Center of mass of all team players */
  centroid: FieldPoint;
  /** Convex hull area (m²) — how spread out the team is */
  spreadM2: number;
  /** Defensive line Y (average of back 4) — distance from own goal */
  defensiveLineX: number;
  /** Highest attacker position */
  attackingLineX: number;
  /** Team compactness: distance between defensive and attacking lines */
  compactnessM: number;
  /** Team width: lateral spread of all players */
  widthM: number;
  /** Average speed of all team players */
  avgSpeedMs: number;
  /** Total distance covered by team */
  totalDistanceM: number;
  /** Sprint count across all players */
  totalSprints: number;
  /** Number of tracked players */
  playerCount: number;
}

export interface PassNetworkEdge {
  fromTrackId: number;
  toTrackId: number;
  count: number;
  /** Average pass distance (m) */
  avgDistanceM: number;
  /** Success rate 0-1 */
  successRate: number;
}

export interface PassNetwork {
  team: "home" | "away";
  edges: PassNetworkEdge[];
  /** Average positions of each player during the analysis window */
  avgPositions: Map<number, FieldPoint>;
  /** Total passes */
  totalPasses: number;
  /** Pass completion rate */
  completionPct: number;
}

export interface PressingStat {
  /** PPDA: Passes allowed Per Defensive Action (lower = more intense pressing) */
  ppda: number;
  /** High press count: defensive actions in opponent's third (x > 70) */
  highPressCount: number;
  /** Counter-pressing actions within 5s of losing possession */
  counterPressCount: number;
  /** Average pressing height (x coordinate of defensive actions) */
  avgPressingHeightX: number;
}

export interface PossessionStat {
  homePct: number;
  awayPct: number;
  contestedPct: number;
  /** Possession in final third (x > 70) */
  homeFinalThirdPct: number;
  awayFinalThirdPct: number;
}

export interface TeamAnalysisWindow {
  startMs: number;
  endMs: number;
  home: TeamMetrics;
  away: TeamMetrics;
  pressing: { home: PressingStat; away: PressingStat };
  possession: PossessionStat;
}

export interface TeamAnalysisReport {
  /** Rolling windows (5 min each) */
  windows: TeamAnalysisWindow[];
  /** Cumulative metrics */
  cumulative: {
    home: TeamMetrics;
    away: TeamMetrics;
    possession: PossessionStat;
    pressing: { home: PressingStat; away: PressingStat };
  };
  /** Pass networks */
  homePassNetwork: PassNetwork;
  awayPassNetwork: PassNetwork;
  /** Session duration */
  durationMs: number;
}

// ─── Field constants ─────────────────────────────────────────────────────────

const FIELD_LENGTH = 105;
const FIELD_WIDTH = 68;
const WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling windows

// ─── Engine ──────────────────────────────────────────────────────────────────

export class TeamAnalysisEngine {
  private frames: Array<{
    timestampMs: number;
    homePlayers: Array<{ trackId: number; pos: FieldPoint; speedMs: number }>;
    awayPlayers: Array<{ trackId: number; pos: FieldPoint; speedMs: number }>;
    ballPos: FieldPoint | null;
    ballTeam: "home" | "away" | "contested" | "none";
  }> = [];

  private homePassEvents: Array<{
    fromId: number;
    toId: number;
    distanceM: number;
    success: boolean;
    timestampMs: number;
  }> = [];

  private awayPassEvents: Array<{
    fromId: number;
    toId: number;
    distanceM: number;
    success: boolean;
    timestampMs: number;
  }> = [];

  private defensiveActions = { home: 0, away: 0 };
  private opponentPasses = { home: 0, away: 0 };

  /**
   * Nº de frames ESPACIALES acumulados (solo se acumulan con calibración fiable).
   * 0 → no hay datos fiables → el informe sería solo defaults → el consumidor debe
   * tratarlo como "sin datos" (no mostrar 50/50 falso). Ver #21.
   */
  get frameCount(): number {
    return this.frames.length;
  }

  reset(): void {
    this.frames = [];
    this.homePassEvents = [];
    this.awayPassEvents = [];
    this.defensiveActions = { home: 0, away: 0 };
    this.opponentPasses = { home: 0, away: 0 };
  }

  /**
   * Feed a frame of tracking data.
   */
  processFrame(
    tracks: Track[],
    identities: Map<number, PlayerIdentity>,
    ballTrack: BallTrack | null,
    ballTeam: "home" | "away" | "contested" | "none",
    timestampMs: number,
    calibrationReliable = true,
  ): void {
    // TODO el análisis de equipo es espacial (posiciones y distancias en metros:
    // posesión por tercio, compacidad, amplitud, PPDA…). Sin calibración fiable esas
    // cifras serían píxeles disfrazados → NO acumulamos el frame (el informe reflejará
    // solo lo fiable, o quedará vacío). Anti-fallo-silencioso: mejor vacío que falso.
    if (!calibrationReliable) return;

    const homePlayers: Array<{ trackId: number; pos: FieldPoint; speedMs: number }> = [];
    const awayPlayers: Array<{ trackId: number; pos: FieldPoint; speedMs: number }> = [];

    for (const track of tracks) {
      if (!track.lastFieldPos) continue;
      const identity = identities.get(track.id);
      const team = identity?.team ?? "unknown";
      const entry = {
        trackId: track.id,
        pos: { fx: track.lastFieldPos.fx, fy: track.lastFieldPos.fy },
        speedMs: track.smoothSpeedMs,
      };
      if (team === "home") homePlayers.push(entry);
      else if (team === "away") awayPlayers.push(entry);
    }

    // BallTrack expone `fieldPos` (no `fieldPosition`) → antes ballPos era SIEMPRE
    // null → posesión en último tercio siempre 0% (fallo silencioso).
    const ballPos = ballTrack?.fieldPos
      ? { fx: ballTrack.fieldPos.fx, fy: ballTrack.fieldPos.fy }
      : null;

    this.frames.push({ timestampMs, homePlayers, awayPlayers, ballPos, ballTeam });

    // Track opponent passes for PPDA
    if (ballTeam === "home") this.opponentPasses.away++;
    else if (ballTeam === "away") this.opponentPasses.home++;
  }

  /**
   * Record a pass event detected by event detection engine.
   */
  addPassEvent(
    team: "home" | "away",
    fromId: number,
    toId: number,
    distanceM: number,
    success: boolean,
    timestampMs: number,
  ): void {
    const arr = team === "home" ? this.homePassEvents : this.awayPassEvents;
    arr.push({ fromId, toId, distanceM, success, timestampMs });
  }

  /**
   * Record a defensive action (tackle, interception, recovery).
   */
  addDefensiveAction(team: "home" | "away", posX: number): void {
    this.defensiveActions[team]++;
  }

  /**
   * Generate the full team analysis report.
   */
  generateReport(): TeamAnalysisReport {
    if (this.frames.length === 0) {
      return this._emptyReport();
    }

    const startMs = this.frames[0].timestampMs;
    const endMs = this.frames[this.frames.length - 1].timestampMs;
    const durationMs = endMs - startMs;

    // Build windows
    const windows: TeamAnalysisWindow[] = [];
    let windowStart = startMs;
    while (windowStart < endMs) {
      const windowEnd = Math.min(windowStart + WINDOW_MS, endMs);
      const windowFrames = this.frames.filter(
        (f) => f.timestampMs >= windowStart && f.timestampMs < windowEnd,
      );
      if (windowFrames.length > 0) {
        windows.push(this._computeWindow(windowFrames, windowStart, windowEnd));
      }
      windowStart = windowEnd;
    }

    // Cumulative
    const cumWindow = this._computeWindow(this.frames, startMs, endMs);

    return {
      windows,
      cumulative: {
        home: cumWindow.home,
        away: cumWindow.away,
        possession: cumWindow.possession,
        pressing: cumWindow.pressing,
      },
      homePassNetwork: this._buildPassNetwork("home"),
      awayPassNetwork: this._buildPassNetwork("away"),
      durationMs,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _computeWindow(
    frames: typeof this.frames,
    startMs: number,
    endMs: number,
  ): TeamAnalysisWindow {
    const home = this._computeTeamMetrics(frames.map((f) => f.homePlayers));
    const away = this._computeTeamMetrics(frames.map((f) => f.awayPlayers));

    // Possession
    let homeFrames = 0;
    let awayFrames = 0;
    let contestedFrames = 0;
    let homeFinalThird = 0;
    let awayFinalThird = 0;

    for (const f of frames) {
      if (f.ballTeam === "home") {
        homeFrames++;
        if (f.ballPos && f.ballPos.fx > 70) homeFinalThird++;
      } else if (f.ballTeam === "away") {
        awayFrames++;
        if (f.ballPos && f.ballPos.fx < 35) awayFinalThird++;
      } else {
        contestedFrames++;
      }
    }
    const total = Math.max(1, homeFrames + awayFrames + contestedFrames);

    const possession: PossessionStat = {
      homePct: Math.round((homeFrames / total) * 100),
      awayPct: Math.round((awayFrames / total) * 100),
      contestedPct: Math.round((contestedFrames / total) * 100),
      homeFinalThirdPct: homeFrames > 0 ? Math.round((homeFinalThird / homeFrames) * 100) : 0,
      awayFinalThirdPct: awayFrames > 0 ? Math.round((awayFinalThird / awayFrames) * 100) : 0,
    };

    // Pressing
    const homePPDA =
      this.opponentPasses.home > 0
        ? this.opponentPasses.home / Math.max(1, this.defensiveActions.home)
        : 15;
    const awayPPDA =
      this.opponentPasses.away > 0
        ? this.opponentPasses.away / Math.max(1, this.defensiveActions.away)
        : 15;

    return {
      startMs,
      endMs,
      home,
      away,
      pressing: {
        home: {
          ppda: Math.round(homePPDA * 10) / 10,
          highPressCount: 0,
          counterPressCount: 0,
          avgPressingHeightX: 0,
        },
        away: {
          ppda: Math.round(awayPPDA * 10) / 10,
          highPressCount: 0,
          counterPressCount: 0,
          avgPressingHeightX: 0,
        },
      },
      possession,
    };
  }

  private _computeTeamMetrics(
    framesPlayers: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>,
  ): TeamMetrics {
    if (framesPlayers.length === 0) return this._emptyTeamMetrics();

    let sumX = 0;
    let sumY = 0;
    let totalPoints = 0;
    let sumSpeed = 0;
    let minX = FIELD_LENGTH;
    let maxX = 0;
    let minY = FIELD_WIDTH;
    let maxY = 0;
    const totalDistance = 0;
    let totalSprints = 0;
    const playerIds = new Set<number>();

    for (const players of framesPlayers) {
      for (const p of players) {
        sumX += p.pos.fx;
        sumY += p.pos.fy;
        sumSpeed += p.speedMs;
        totalPoints++;
        playerIds.add(p.trackId);
        minX = Math.min(minX, p.pos.fx);
        maxX = Math.max(maxX, p.pos.fx);
        minY = Math.min(minY, p.pos.fy);
        maxY = Math.max(maxY, p.pos.fy);
        if (p.speedMs > 5.83) totalSprints++;
      }
    }

    if (totalPoints === 0) return this._emptyTeamMetrics();

    const centroid = { fx: sumX / totalPoints, fy: sumY / totalPoints };
    const width = maxY - minY;
    const depth = maxX - minX;

    // Approximate spread as rectangular area (simplified convex hull)
    const spreadM2 = width * depth;

    // Defensive line: average X of the 4 players closest to own goal in last frame
    const lastFrame = framesPlayers[framesPlayers.length - 1];
    const sortedByX = [...lastFrame].sort((a, b) => a.pos.fx - b.pos.fx);
    const backFour = sortedByX.slice(0, Math.min(4, sortedByX.length));
    const defensiveLineX =
      backFour.length > 0
        ? backFour.reduce((s, p) => s + p.pos.fx, 0) / backFour.length
        : 0;
    const attackingLineX = sortedByX.length > 0 ? sortedByX[sortedByX.length - 1].pos.fx : 0;

    return {
      centroid,
      spreadM2: Math.round(spreadM2),
      defensiveLineX: Math.round(defensiveLineX * 10) / 10,
      attackingLineX: Math.round(attackingLineX * 10) / 10,
      compactnessM: Math.round(depth * 10) / 10,
      widthM: Math.round(width * 10) / 10,
      avgSpeedMs: Math.round((sumSpeed / totalPoints) * 100) / 100,
      totalDistanceM: totalDistance,
      totalSprints,
      playerCount: playerIds.size,
    };
  }

  private _buildPassNetwork(team: "home" | "away"): PassNetwork {
    const events = team === "home" ? this.homePassEvents : this.awayPassEvents;
    const edgeMap = new Map<string, { count: number; totalDist: number; successes: number }>();
    const posMap = new Map<number, { sumX: number; sumY: number; count: number }>();

    for (const e of events) {
      const key = `${e.fromId}->${e.toId}`;
      const existing = edgeMap.get(key) ?? { count: 0, totalDist: 0, successes: 0 };
      existing.count++;
      existing.totalDist += e.distanceM;
      if (e.success) existing.successes++;
      edgeMap.set(key, existing);
    }

    // Average positions from frames
    for (const frame of this.frames) {
      const players = team === "home" ? frame.homePlayers : frame.awayPlayers;
      for (const p of players) {
        const pos = posMap.get(p.trackId) ?? { sumX: 0, sumY: 0, count: 0 };
        pos.sumX += p.pos.fx;
        pos.sumY += p.pos.fy;
        pos.count++;
        posMap.set(p.trackId, pos);
      }
    }

    const edges: PassNetworkEdge[] = [];
    for (const [key, val] of edgeMap.entries()) {
      const [from, to] = key.split("->").map(Number);
      edges.push({
        fromTrackId: from,
        toTrackId: to,
        count: val.count,
        avgDistanceM: Math.round((val.totalDist / val.count) * 10) / 10,
        successRate: Math.round((val.successes / val.count) * 100) / 100,
      });
    }

    const avgPositions = new Map<number, FieldPoint>();
    for (const [id, pos] of posMap.entries()) {
      avgPositions.set(id, {
        fx: Math.round((pos.sumX / pos.count) * 10) / 10,
        fy: Math.round((pos.sumY / pos.count) * 10) / 10,
      });
    }

    const totalPasses = events.length;
    const completedPasses = events.filter((e) => e.success).length;

    return {
      team,
      edges: edges.sort((a, b) => b.count - a.count),
      avgPositions,
      totalPasses,
      completionPct: totalPasses > 0 ? Math.round((completedPasses / totalPasses) * 100) : 0,
    };
  }

  private _emptyTeamMetrics(): TeamMetrics {
    return {
      centroid: { fx: 52.5, fy: 34 },
      spreadM2: 0,
      defensiveLineX: 0,
      attackingLineX: 0,
      compactnessM: 0,
      widthM: 0,
      avgSpeedMs: 0,
      totalDistanceM: 0,
      totalSprints: 0,
      playerCount: 0,
    };
  }

  private _emptyReport(): TeamAnalysisReport {
    const emptyMetrics = this._emptyTeamMetrics();
    const emptyPressing: PressingStat = {
      ppda: 15,
      highPressCount: 0,
      counterPressCount: 0,
      avgPressingHeightX: 0,
    };
    const emptyPossession: PossessionStat = {
      homePct: 50,
      awayPct: 50,
      contestedPct: 0,
      homeFinalThirdPct: 0,
      awayFinalThirdPct: 0,
    };
    return {
      windows: [],
      cumulative: {
        home: emptyMetrics,
        away: emptyMetrics,
        possession: emptyPossession,
        pressing: { home: emptyPressing, away: emptyPressing },
      },
      homePassNetwork: {
        team: "home",
        edges: [],
        avgPositions: new Map(),
        totalPasses: 0,
        completionPct: 0,
      },
      awayPassNetwork: {
        team: "away",
        edges: [],
        avgPositions: new Map(),
        totalPasses: 0,
        completionPct: 0,
      },
      durationMs: 0,
    };
  }
}
