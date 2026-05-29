/**
 * VITAS · Live Match Service (Supabase + localStorage hybrid)
 *
 * Persists live match-day data:
 *   - The match itself (date, opponent, result, video URL once recorded)
 *   - Real-time events tagged during play (goals, shots, subs, etc.)
 *   - End-of-match summary
 *
 * Used by:
 *   - /live — hub
 *   - /live/:matchId — tagging UI
 *   - /live/:matchId/summary — post-match summary
 *
 * Tables:
 *   - live_matches (042)
 *   - match_events (004)
 *
 * Realtime: when Supabase is configured, subscribes to match_events to
 * support collaborative tagging (assistant taps a goal on tablet, head
 * coach sees it on phone instantly).
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

const STORAGE_KEY_MATCHES = "vitas_live_matches";
const STORAGE_KEY_EVENTS = "vitas_live_match_events";

// ── Types ────────────────────────────────────────────────────────────
export type MatchStatus = "scheduled" | "in_progress" | "finished" | "cancelled";

export interface LiveMatch {
  id: string;
  teamId: string;
  opponent: string;
  venue?: "home" | "away";
  date: string;
  kickoffTime?: string;
  status: MatchStatus;
  scoreHome?: number;
  scoreAway?: number;
  /** Bunny video id (set once recording uploaded) */
  videoId?: string;
  /** Bunny stream URL */
  videoUrl?: string;
  startersIds?: string[];
  benchIds?: string[];
}

export type EventKind =
  | "goal"
  | "assist"
  | "shot"
  | "shot_on_target"
  | "shot_off_target"
  | "card_yellow"
  | "card_red"
  | "substitution"
  | "corner"
  | "free_kick"
  | "penalty"
  | "save"
  | "tackle"
  | "interception"
  | "offside"
  | "fault";

export interface MatchEvent {
  id: string;
  matchId: string;
  timestampMs: number; // since kickoff
  minute: number;
  kind: EventKind;
  playerId?: string;
  secondaryPlayerId?: string; // assist, sub-in, etc.
  team: "home" | "away";
  description?: string;
  /** Field position (normalized 0-100) */
  x?: number;
  y?: number;
}

// ── Cache helpers ────────────────────────────────────────────────────
function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[], cap = 500): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, cap)));
  } catch (err) {
    console.error(`[liveMatchService] write fail (${key})`, err);
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Service ───────────────────────────────────────────────────────────
export const LiveMatchService = {
  // ─── Matches ───────────────────────────────────────────────────────
  async listMatches(teamId: string, limit = 30): Promise<LiveMatch[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("live_matches")
          .select("*")
          .eq("team_id", teamId)
          .order("date", { ascending: false })
          .limit(limit);
        if (error) throw error;
        if (data) {
          return (data as Array<Record<string, unknown>>).map(rowToMatch);
        }
      } catch (err) {
        console.warn("[liveMatchService] list failed:", err);
      }
    }
    return read<LiveMatch>(STORAGE_KEY_MATCHES)
      .filter((m) => m.teamId === teamId)
      .slice(0, limit);
  },

  async getMatch(matchId: string): Promise<LiveMatch | null> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("live_matches")
          .select("*")
          .eq("id", matchId)
          .maybeSingle();
        if (error) throw error;
        if (data) return rowToMatch(data as Record<string, unknown>);
      } catch (err) {
        console.warn("[liveMatchService] get failed:", err);
      }
    }
    return read<LiveMatch>(STORAGE_KEY_MATCHES).find((m) => m.id === matchId) ?? null;
  },

  async saveMatch(match: LiveMatch): Promise<LiveMatch> {
    const final = { ...match, id: match.id || genId("match") };
    const all = read<LiveMatch>(STORAGE_KEY_MATCHES).filter((m) => m.id !== final.id);
    all.unshift(final);
    write(STORAGE_KEY_MATCHES, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("live_matches").upsert(
          {
            id: final.id.length === 36 ? final.id : undefined,
            team_id: final.teamId,
            opponent: final.opponent,
            venue: final.venue,
            date: final.date,
            kickoff_time: final.kickoffTime,
            status: final.status,
            score_home: final.scoreHome,
            score_away: final.scoreAway,
            video_id: final.videoId,
            video_url: final.videoUrl,
            starters_ids: final.startersIds,
            bench_ids: final.benchIds,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[liveMatchService] save match failed:", err);
      }
    }
    return final;
  },

  // ─── Events ────────────────────────────────────────────────────────
  async listEvents(matchId: string): Promise<MatchEvent[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("match_events")
          .select("*")
          .eq("match_id", matchId)
          .order("timestamp_ms", { ascending: true });
        if (error) throw error;
        if (data) return (data as Array<Record<string, unknown>>).map(rowToEvent);
      } catch (err) {
        console.warn("[liveMatchService] events read failed:", err);
      }
    }
    return read<MatchEvent>(STORAGE_KEY_EVENTS)
      .filter((e) => e.matchId === matchId)
      .sort((a, b) => a.timestampMs - b.timestampMs);
  },

  async addEvent(event: MatchEvent): Promise<MatchEvent> {
    const final = { ...event, id: event.id || genId("evt") };
    const all = read<MatchEvent>(STORAGE_KEY_EVENTS);
    all.unshift(final);
    write(STORAGE_KEY_EVENTS, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("match_events").insert({
          id: final.id.length === 36 ? final.id : undefined,
          match_id: final.matchId,
          timestamp_ms: final.timestampMs,
          minute: final.minute,
          kind: final.kind,
          player_id: final.playerId,
          secondary_player_id: final.secondaryPlayerId,
          team: final.team,
          description: final.description,
          x: final.x,
          y: final.y,
        });
      } catch (err) {
        console.warn("[liveMatchService] event add failed:", err);
      }
    }
    return final;
  },

  async deleteEvent(eventId: string): Promise<void> {
    write(STORAGE_KEY_EVENTS, read<MatchEvent>(STORAGE_KEY_EVENTS).filter((e) => e.id !== eventId));
    if (SUPABASE_CONFIGURED && eventId.length === 36) {
      try {
        await supabase.from("match_events").delete().eq("id", eventId);
      } catch (err) {
        console.warn("[liveMatchService] event delete failed:", err);
      }
    }
  },

  /**
   * Subscribe to live event inserts (for collaborative tagging).
   * Returns an unsubscribe function. No-op if Supabase isn't configured.
   */
  subscribeToEvents(
    matchId: string,
    onInsert: (event: MatchEvent) => void,
  ): () => void {
    if (!SUPABASE_CONFIGURED) {
      return () => {};
    }
    const channel = supabase
      .channel(`match-events-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          onInsert(rowToEvent(row));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};

// ── Row mappers ──────────────────────────────────────────────────────
function rowToMatch(r: Record<string, unknown>): LiveMatch {
  return {
    id: String(r.id),
    teamId: String(r.team_id),
    opponent: String(r.opponent ?? ""),
    venue: (r.venue as "home" | "away") ?? undefined,
    date: String(r.date),
    kickoffTime: r.kickoff_time ? String(r.kickoff_time) : undefined,
    status: (r.status as MatchStatus) ?? "scheduled",
    scoreHome: r.score_home !== null && r.score_home !== undefined ? Number(r.score_home) : undefined,
    scoreAway: r.score_away !== null && r.score_away !== undefined ? Number(r.score_away) : undefined,
    videoId: r.video_id ? String(r.video_id) : undefined,
    videoUrl: r.video_url ? String(r.video_url) : undefined,
    startersIds: (r.starters_ids as string[]) ?? undefined,
    benchIds: (r.bench_ids as string[]) ?? undefined,
  };
}

function rowToEvent(r: Record<string, unknown>): MatchEvent {
  return {
    id: String(r.id),
    matchId: String(r.match_id),
    timestampMs: Number(r.timestamp_ms ?? 0),
    minute: Number(r.minute ?? 0),
    kind: r.kind as EventKind,
    playerId: r.player_id ? String(r.player_id) : undefined,
    secondaryPlayerId: r.secondary_player_id ? String(r.secondary_player_id) : undefined,
    team: (r.team as "home" | "away") ?? "home",
    description: r.description ? String(r.description) : undefined,
    x: r.x !== null && r.x !== undefined ? Number(r.x) : undefined,
    y: r.y !== null && r.y !== undefined ? Number(r.y) : undefined,
  };
}
