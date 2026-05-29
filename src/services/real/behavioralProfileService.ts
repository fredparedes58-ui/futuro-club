/**
 * VITAS · Behavioral Profile Service (Supabase + localStorage hybrid)
 *
 * Persists per-player behavioral profiles produced by:
 *   - Mock generator (current /behavioral page)
 *   - Modal pipeline (when activated)
 *   - Local Lab analysis (MediaPipe + custom heuristics)
 *
 * Strategy:
 *   - If Supabase is configured + user logged in → write to BD
 *   - Always write to localStorage as cache (offline fallback)
 *   - Read prefers Supabase, falls back to localStorage on error
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

const STORAGE_KEY = "vitas_behavioral_profiles";

export type BehavioralArchetype =
  | "commander"
  | "creator"
  | "engine"
  | "ghost"
  | "warrior"
  | "architect";

export interface BehavioralScores {
  decisionSpeed: number;
  scanningIntelligence: number;
  resilience: number;
  clutchFactor: number;
  leadership: number;
  mentalFatigue: number;
  unpredictability: number;
  mentalComposite: number;
  archetype: BehavioralArchetype;
}

export interface BehavioralProfile {
  id: string;
  playerId: string;
  playerName?: string;
  analyzedAt: string;
  scores: BehavioralScores;
  fullProfile?: Record<string, unknown>;
  confidence: number;
  videosAnalyzed: number;
  modelVersion: string;
}

// ── DB row mapping ────────────────────────────────────────────────────
interface DbRow {
  id: string;
  player_id: string;
  analyzed_at: string;
  decision_speed: number;
  scanning_intelligence: number;
  resilience: number;
  clutch_factor: number;
  leadership: number;
  mental_fatigue: number;
  unpredictability: number;
  mental_composite_score: number;
  personality_archetype: BehavioralArchetype;
  full_profile: Record<string, unknown>;
  confidence: number;
  videos_analyzed: number;
  model_version: string;
}

function rowToProfile(row: DbRow, playerName?: string): BehavioralProfile {
  return {
    id: row.id,
    playerId: row.player_id,
    playerName,
    analyzedAt: row.analyzed_at,
    scores: {
      decisionSpeed: row.decision_speed,
      scanningIntelligence: row.scanning_intelligence,
      resilience: row.resilience,
      clutchFactor: row.clutch_factor,
      leadership: row.leadership,
      mentalFatigue: row.mental_fatigue,
      unpredictability: row.unpredictability,
      mentalComposite: row.mental_composite_score,
      archetype: row.personality_archetype,
    },
    fullProfile: row.full_profile,
    confidence: row.confidence,
    videosAnalyzed: row.videos_analyzed,
    modelVersion: row.model_version,
  };
}

function profileToRow(p: BehavioralProfile): Omit<DbRow, "id" | "analyzed_at"> & {
  id?: string;
  analyzed_at?: string;
} {
  return {
    id: p.id?.length === 36 ? p.id : undefined, // only pass if UUID
    player_id: p.playerId,
    analyzed_at: p.analyzedAt,
    decision_speed: p.scores.decisionSpeed,
    scanning_intelligence: p.scores.scanningIntelligence,
    resilience: p.scores.resilience,
    clutch_factor: p.scores.clutchFactor,
    leadership: p.scores.leadership,
    mental_fatigue: p.scores.mentalFatigue,
    unpredictability: p.scores.unpredictability,
    mental_composite_score: p.scores.mentalComposite,
    personality_archetype: p.scores.archetype,
    full_profile: p.fullProfile ?? {},
    confidence: p.confidence,
    videos_analyzed: p.videosAnalyzed,
    model_version: p.modelVersion,
  };
}

// ── localStorage cache ────────────────────────────────────────────────
function readCache(): BehavioralProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(items: BehavioralProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
  } catch (err) {
    console.error("[behavioralProfileService] cache write failed", err);
  }
}

function genId(): string {
  return `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Service ───────────────────────────────────────────────────────────
export const BehavioralProfileService = {
  /** Returns latest profile per player (server first, cache fallback) */
  async getLatest(playerId: string): Promise<BehavioralProfile | null> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("behavioral_profiles")
          .select("*")
          .eq("player_id", playerId)
          .order("analyzed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const profile = rowToProfile(data as DbRow);
          // Update cache silently
          const all = readCache().filter((p) => p.id !== profile.id);
          all.unshift(profile);
          writeCache(all);
          return profile;
        }
      } catch (err) {
        console.warn("[behavioralProfileService] supabase read failed, using cache:", err);
      }
    }
    // Cache fallback
    return readCache().find((p) => p.playerId === playerId) ?? null;
  },

  /** Returns history of profiles for a player (newest first) */
  async getHistory(playerId: string, limit = 20): Promise<BehavioralProfile[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("behavioral_profiles")
          .select("*")
          .eq("player_id", playerId)
          .order("analyzed_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        if (data) {
          const rows = (data as DbRow[]).map((r) => rowToProfile(r));
          return rows;
        }
      } catch (err) {
        console.warn("[behavioralProfileService] supabase history failed:", err);
      }
    }
    return readCache().filter((p) => p.playerId === playerId).slice(0, limit);
  },

  /** Save (insert or update). Always writes to cache, optionally to DB. */
  async save(profile: BehavioralProfile): Promise<BehavioralProfile> {
    const finalProfile: BehavioralProfile = {
      ...profile,
      id: profile.id || genId(),
      analyzedAt: profile.analyzedAt || new Date().toISOString(),
    };

    // Write to cache first (always works, even offline)
    const all = readCache().filter((p) => p.id !== finalProfile.id);
    all.unshift(finalProfile);
    writeCache(all);

    // Try Supabase
    if (SUPABASE_CONFIGURED) {
      try {
        const row = profileToRow(finalProfile);
        const { data, error } = await supabase
          .from("behavioral_profiles")
          .upsert(row, { onConflict: "id" })
          .select()
          .maybeSingle();
        if (error) throw error;
        if (data) {
          // DB may have generated a new UUID — refresh cache id
          const serverProfile = rowToProfile(data as DbRow, finalProfile.playerName);
          const cleaned = readCache().filter((p) => p.id !== finalProfile.id);
          cleaned.unshift(serverProfile);
          writeCache(cleaned);
          return serverProfile;
        }
      } catch (err) {
        console.warn("[behavioralProfileService] supabase save failed, kept in cache:", err);
      }
    }

    return finalProfile;
  },

  /** Returns team-wide latest profile per player (for /behavioral overview) */
  async getTeamLatest(playerIds: string[]): Promise<BehavioralProfile[]> {
    if (SUPABASE_CONFIGURED && playerIds.length > 0) {
      try {
        // Get the latest row per player_id using distinct on
        const { data, error } = await supabase
          .from("behavioral_profiles")
          .select("*")
          .in("player_id", playerIds)
          .order("analyzed_at", { ascending: false });
        if (error) throw error;
        if (data) {
          // Keep first occurrence per player_id (already sorted desc by analyzed_at)
          const seen = new Set<string>();
          const result: BehavioralProfile[] = [];
          for (const row of data as DbRow[]) {
            if (seen.has(row.player_id)) continue;
            seen.add(row.player_id);
            result.push(rowToProfile(row));
          }
          return result;
        }
      } catch (err) {
        console.warn("[behavioralProfileService] team read failed:", err);
      }
    }
    // Cache fallback
    const cache = readCache();
    const byPlayer = new Map<string, BehavioralProfile>();
    for (const p of cache) {
      if (!byPlayer.has(p.playerId)) byPlayer.set(p.playerId, p);
    }
    return Array.from(byPlayer.values()).filter((p) => playerIds.includes(p.playerId));
  },

  /** Delete a profile (both DB and cache) */
  async delete(id: string): Promise<void> {
    writeCache(readCache().filter((p) => p.id !== id));
    if (SUPABASE_CONFIGURED && id.length === 36) {
      try {
        await supabase.from("behavioral_profiles").delete().eq("id", id);
      } catch (err) {
        console.warn("[behavioralProfileService] delete failed:", err);
      }
    }
  },
};
