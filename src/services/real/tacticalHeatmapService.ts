/**
 * VITAS · Tactical Heatmap Service (Supabase + localStorage hybrid)
 *
 * Persiste los 3 entities del módulo táctico (phases, heatmaps, insights)
 * con semántica offline-first idéntica a IDPService / BehavioralProfileService:
 *
 *   - Escritura local SIEMPRE primero (funciona offline / sin Supabase)
 *   - Si Supabase configurado → intenta upsert en paralelo
 *   - Lectura prefiere Supabase, fallback a cache
 *
 * Carga "hidratada" para la UI: una sola llamada devuelve
 * `TacticalMatchSummary` con todos los heatmaps + insights.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import type {
  GamePhase,
  PhaseHeatmap,
  PhaseSegment,
  TacticalInsights,
  TacticalMatchSummary,
} from "@/lib/tactical/tacticalTypes";

const PHASES_KEY = "vitas_tactical_phases";
const HEATMAPS_KEY = "vitas_phase_heatmaps";
const INSIGHTS_KEY = "vitas_tactical_insights";

const uuid = (): string => crypto.randomUUID();

// ── localStorage helpers ────────────────────────────────────────────
function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, 500)));
  } catch (err) {
    console.error(`[tacticalHeatmapService] cache write failed (${key})`, err);
  }
}

// ── DB row mappers ──────────────────────────────────────────────────
interface DbPhase {
  id: string;
  match_id: string;
  video_id: string | null;
  phase_type: GamePhase;
  start_ms: number;
  end_ms: number;
  ball_possession: "ours" | "theirs" | "neutral";
  source: "auto" | "manual" | "hybrid";
  confidence: number;
  created_at: string;
}

interface DbHeatmap {
  id: string;
  match_id: string;
  player_id: string | null;
  phase_type: GamePhase;
  bins: PhaseHeatmap["bins"];
  hot_zones: PhaseHeatmap["hotZones"];
  total_time_sec: number;
  algo_version: string;
  computed_at: string;
}

interface DbInsight {
  id: string;
  match_id: string;
  team_id: string | null;
  headline: string | null;
  summary: string | null;
  by_phase: TacticalInsights["byPhase"];
  strengths: string[];
  weaknesses: string[];
  coaching_tips: string[];
  model_version: string;
  created_at: string;
}

function rowToPhase(r: DbPhase): PhaseSegment {
  return {
    id: r.id,
    matchId: r.match_id,
    videoId: r.video_id ?? undefined,
    phaseType: r.phase_type,
    startMs: r.start_ms,
    endMs: r.end_ms,
    ballPossession: r.ball_possession,
    source: r.source,
    confidence: r.confidence,
    createdAt: r.created_at,
  };
}

function phaseToRow(p: PhaseSegment): Partial<DbPhase> {
  return {
    id: p.id?.length === 36 ? p.id : undefined,
    match_id: p.matchId,
    video_id: p.videoId ?? null,
    phase_type: p.phaseType,
    start_ms: p.startMs,
    end_ms: p.endMs,
    ball_possession: p.ballPossession,
    source: p.source,
    confidence: p.confidence,
  };
}

function rowToHeatmap(r: DbHeatmap): PhaseHeatmap {
  return {
    id: r.id,
    matchId: r.match_id,
    playerId: r.player_id,
    phaseType: r.phase_type,
    bins: r.bins ?? [],
    hotZones: r.hot_zones ?? [],
    totalTimeSec: r.total_time_sec,
    algoVersion: r.algo_version,
    computedAt: r.computed_at,
  };
}

function heatmapToRow(h: PhaseHeatmap): Partial<DbHeatmap> {
  return {
    id: h.id?.length === 36 ? h.id : undefined,
    match_id: h.matchId,
    player_id: h.playerId,
    phase_type: h.phaseType,
    bins: h.bins,
    hot_zones: h.hotZones,
    total_time_sec: h.totalTimeSec,
    algo_version: h.algoVersion,
  };
}

function rowToInsight(r: DbInsight): TacticalInsights {
  return {
    headline: r.headline ?? "",
    summary: r.summary ?? "",
    byPhase: r.by_phase ?? [],
    strengths: r.strengths ?? [],
    weaknesses: r.weaknesses ?? [],
    coachingTips: r.coaching_tips ?? [],
    modelVersion: r.model_version,
  };
}

// ── Public service ──────────────────────────────────────────────────
export const TacticalHeatmapService = {
  /**
   * Carga el resumen completo de un partido: phases, todos los heatmaps
   * (por jugador + equipo), e insights (si existen).
   */
  async getMatchSummary(matchId: string): Promise<TacticalMatchSummary | null> {
    // Try Supabase first
    if (SUPABASE_CONFIGURED) {
      try {
        const [phasesRes, heatmapsRes, insightsRes] = await Promise.all([
          supabase
            .from("tactical_phases")
            .select("*")
            .eq("match_id", matchId)
            .order("start_ms"),
          supabase
            .from("phase_heatmaps")
            .select("*")
            .eq("match_id", matchId),
          supabase
            .from("tactical_insights")
            .select("*")
            .eq("match_id", matchId)
            .maybeSingle(),
        ]);

        if (phasesRes.error) throw phasesRes.error;
        if (heatmapsRes.error) throw heatmapsRes.error;

        const phases = ((phasesRes.data ?? []) as DbPhase[]).map(rowToPhase);
        const heatmaps = ((heatmapsRes.data ?? []) as DbHeatmap[]).map(rowToHeatmap);

        if (phases.length === 0 && heatmaps.length === 0) {
          // Fallback to cache silently
          return readMatchFromCache(matchId);
        }

        return buildSummary(matchId, phases, heatmaps, insightsRes.data ? rowToInsight(insightsRes.data as DbInsight) : undefined);
      } catch (err) {
        console.warn("[tacticalHeatmapService] supabase getMatch failed:", err);
      }
    }
    return readMatchFromCache(matchId);
  },

  /** Lista todos los matches con tactical data (para el selector). */
  async listMatchesWithHeatmap(): Promise<Array<{ matchId: string; phasesCount: number; computedAt: string | null }>> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("phase_heatmaps")
          .select("match_id, computed_at")
          .order("computed_at", { ascending: false });
        if (error) throw error;
        const map = new Map<string, { count: number; computedAt: string | null }>();
        for (const r of (data ?? []) as Array<{ match_id: string; computed_at: string }>) {
          const entry = map.get(r.match_id) ?? { count: 0, computedAt: null };
          entry.count += 1;
          if (!entry.computedAt || r.computed_at > entry.computedAt) {
            entry.computedAt = r.computed_at;
          }
          map.set(r.match_id, entry);
        }
        return Array.from(map.entries()).map(([matchId, v]) => ({
          matchId,
          phasesCount: v.count,
          computedAt: v.computedAt,
        }));
      } catch (err) {
        console.warn("[tacticalHeatmapService] listMatches failed:", err);
      }
    }
    // Cache fallback
    const heatmaps = read<PhaseHeatmap>(HEATMAPS_KEY);
    const map = new Map<string, { count: number; computedAt: string | null }>();
    for (const h of heatmaps) {
      const entry = map.get(h.matchId) ?? { count: 0, computedAt: null };
      entry.count += 1;
      if (!entry.computedAt || h.computedAt > entry.computedAt) {
        entry.computedAt = h.computedAt;
      }
      map.set(h.matchId, entry);
    }
    return Array.from(map.entries()).map(([matchId, v]) => ({
      matchId,
      phasesCount: v.count,
      computedAt: v.computedAt,
    }));
  },

  /** Guarda phases (batch) — usado por el endpoint compute. */
  async savePhases(phases: PhaseSegment[]): Promise<void> {
    if (phases.length === 0) return;

    const cleaned = phases.map((p) => ({
      ...p,
      id: p.id || uuid(),
      createdAt: p.createdAt || new Date().toISOString(),
    }));

    // Cache
    const all = read<PhaseSegment>(PHASES_KEY).filter(
      (p) => !cleaned.find((c) => c.id === p.id),
    );
    write(PHASES_KEY, [...cleaned, ...all]);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("tactical_phases")
          .upsert(cleaned.map(phaseToRow), { onConflict: "id" });
      } catch (err) {
        console.warn("[tacticalHeatmapService] savePhases failed:", err);
      }
    }
  },

  /** Guarda heatmaps (batch). */
  async saveHeatmaps(heatmaps: PhaseHeatmap[]): Promise<void> {
    if (heatmaps.length === 0) return;

    const cleaned = heatmaps.map((h) => ({
      ...h,
      id: h.id || uuid(),
      computedAt: h.computedAt || new Date().toISOString(),
    }));

    const all = read<PhaseHeatmap>(HEATMAPS_KEY).filter(
      (h) => !cleaned.find((c) => c.id === h.id),
    );
    write(HEATMAPS_KEY, [...cleaned, ...all]);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("phase_heatmaps")
          .upsert(cleaned.map(heatmapToRow), { onConflict: "id" });
      } catch (err) {
        console.warn("[tacticalHeatmapService] saveHeatmaps failed:", err);
      }
    }
  },

  /** Guarda insights del agente. */
  async saveInsights(matchId: string, insights: TacticalInsights, teamId?: string): Promise<void> {
    const all = read<{ matchId: string; data: TacticalInsights; teamId?: string }>(INSIGHTS_KEY).filter(
      (i) => i.matchId !== matchId,
    );
    all.unshift({ matchId, data: insights, teamId });
    write(INSIGHTS_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("tactical_insights").upsert(
          {
            match_id: matchId,
            team_id: teamId ?? null,
            headline: insights.headline,
            summary: insights.summary,
            by_phase: insights.byPhase,
            strengths: insights.strengths,
            weaknesses: insights.weaknesses,
            coaching_tips: insights.coachingTips,
            model_version: insights.modelVersion,
          },
          { onConflict: "match_id" },
        );
      } catch (err) {
        console.warn("[tacticalHeatmapService] saveInsights failed:", err);
      }
    }
  },

  /** Borrar todo de un match (cascade). */
  async deleteMatch(matchId: string): Promise<void> {
    write(PHASES_KEY, read<PhaseSegment>(PHASES_KEY).filter((p) => p.matchId !== matchId));
    write(HEATMAPS_KEY, read<PhaseHeatmap>(HEATMAPS_KEY).filter((h) => h.matchId !== matchId));
    write(INSIGHTS_KEY, read<{ matchId: string }>(INSIGHTS_KEY).filter((i) => i.matchId !== matchId));

    if (SUPABASE_CONFIGURED) {
      try {
        await Promise.all([
          supabase.from("tactical_phases").delete().eq("match_id", matchId),
          supabase.from("phase_heatmaps").delete().eq("match_id", matchId),
          supabase.from("tactical_insights").delete().eq("match_id", matchId),
        ]);
      } catch (err) {
        console.warn("[tacticalHeatmapService] deleteMatch failed:", err);
      }
    }
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function readMatchFromCache(matchId: string): TacticalMatchSummary | null {
  const phases = read<PhaseSegment>(PHASES_KEY).filter((p) => p.matchId === matchId);
  const heatmaps = read<PhaseHeatmap>(HEATMAPS_KEY).filter((h) => h.matchId === matchId);
  if (phases.length === 0 && heatmaps.length === 0) return null;

  const cachedInsight = read<{ matchId: string; data: TacticalInsights }>(INSIGHTS_KEY)
    .find((i) => i.matchId === matchId)?.data;

  return buildSummary(matchId, phases, heatmaps, cachedInsight);
}

function buildSummary(
  matchId: string,
  phases: PhaseSegment[],
  heatmaps: PhaseHeatmap[],
  insights?: TacticalInsights,
): TacticalMatchSummary {
  // Compute phase durations (sum of segment lengths per phase)
  const phaseDurations = {
    build_up: 0,
    attacking: 0,
    defending: 0,
    defensive_transition: 0,
    offensive_transition: 0,
    set_piece: 0,
  } satisfies Record<GamePhase, number>;
  let totalMs = 0;
  let oursMs = 0;
  for (const p of phases) {
    const dur = (p.endMs - p.startMs) / 1000;
    phaseDurations[p.phaseType] += dur;
    totalMs += p.endMs - p.startMs;
    if (p.ballPossession === "ours") oursMs += p.endMs - p.startMs;
  }
  const possessionPct = totalMs > 0 ? Math.round((oursMs / totalMs) * 100) : 0;

  const playerHeatmaps = heatmaps.filter((h) => h.playerId !== null);
  const teamHeatmaps = heatmaps.filter((h) => h.playerId === null);

  return {
    matchId,
    phaseDurations,
    possessionPct,
    playerHeatmaps,
    teamHeatmaps,
    insights,
  };
}
