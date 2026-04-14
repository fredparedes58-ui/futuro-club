/**
 * VITAS · Agent Response Cache
 * Cache-aside pattern for AI agent responses in Supabase.
 * Runs in Edge runtime — uses Web Crypto API for hashing.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CachedEntry {
  id: string;
  cache_key: string;
  agent_name: string;
  response: Record<string, unknown>;
  tokens_saved: number;
  hit_count: number;
  expires_at: string;
}

// ─── TTL configuration per agent (in hours) ─────────────────────────────────

const AGENT_TTL_HOURS: Record<string, number> = {
  "phv-calculator":    168, // 7 days — deterministic formula
  "role-profile":       24, // 1 day — depends on player metrics
  "scout-insight":       6, // 6 hours — RAG context can change
  "tactical-label":     12, // 12 hours — YOLO detections fixed per video
  "video-intelligence": 24, // 1 day — heavy analysis
  "team-intelligence":  24, // 1 day
  "player-similarity":  48, // 2 days — pro player DB changes rarely
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sort object keys recursively for deterministic JSON */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** SHA-256 hash using Web Crypto API (available in Edge runtime) */
export async function hashInput(agentName: string, userId: string, input: unknown): Promise<string> {
  const text = JSON.stringify({ a: agentName, u: userId, i: sortKeys(input) });
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Supabase REST headers for service role */
function sbHeaders(sbKey: string): Record<string, string> {
  return {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
  };
}

// ─── Cache Operations ───────────────────────────────────────────────────────

/**
 * Get cached response if it exists and is not expired.
 */
export async function getCached(
  cacheKey: string,
  sbUrl: string,
  sbKey: string,
): Promise<CachedEntry | null> {
  try {
    const url = `${sbUrl}/rest/v1/agent_response_cache?cache_key=eq.${cacheKey}&expires_at=gt.${new Date().toISOString()}&select=id,cache_key,agent_name,response,tokens_saved,hit_count,expires_at&limit=1`;
    const res = await fetch(url, { headers: sbHeaders(sbKey) });
    if (!res.ok) return null;
    const rows = await res.json() as CachedEntry[];
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Store a response in the cache. Upserts by cache_key.
 */
export async function setCached(
  cacheKey: string,
  agentName: string,
  userId: string,
  playerId: string | null,
  videoId: string | null,
  response: Record<string, unknown>,
  tokensSaved: number,
  sbUrl: string,
  sbKey: string,
): Promise<void> {
  const ttlHours = AGENT_TTL_HOURS[agentName] ?? 24;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  try {
    await fetch(`${sbUrl}/rest/v1/agent_response_cache`, {
      method: "POST",
      headers: {
        ...sbHeaders(sbKey),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        agent_name: agentName,
        user_id: userId,
        player_id: playerId,
        video_id: videoId,
        response,
        tokens_saved: tokensSaved,
        hit_count: 0,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      }),
    });
  } catch (err) {
    console.warn("[AgentCache] Failed to set cache:", err);
  }
}

/**
 * Increment hit count when cache is used.
 */
export async function incrementHitCount(
  cacheKey: string,
  sbUrl: string,
  sbKey: string,
): Promise<void> {
  try {
    // Use RPC or raw PATCH with increment
    await fetch(
      `${sbUrl}/rest/v1/agent_response_cache?cache_key=eq.${cacheKey}`,
      {
        method: "PATCH",
        headers: { ...sbHeaders(sbKey), Prefer: "return=minimal" },
        body: JSON.stringify({
          hit_count: undefined, // Can't increment via REST directly
        }),
      },
    );
    // Fallback: read + write for increment (simple and reliable)
    const url = `${sbUrl}/rest/v1/agent_response_cache?cache_key=eq.${cacheKey}&select=hit_count`;
    const res = await fetch(url, { headers: sbHeaders(sbKey) });
    if (res.ok) {
      const rows = await res.json() as Array<{ hit_count: number }>;
      if (rows.length > 0) {
        await fetch(
          `${sbUrl}/rest/v1/agent_response_cache?cache_key=eq.${cacheKey}`,
          {
            method: "PATCH",
            headers: { ...sbHeaders(sbKey), Prefer: "return=minimal" },
            body: JSON.stringify({ hit_count: rows[0].hit_count + 1 }),
          },
        );
      }
    }
  } catch {
    // Non-critical — don't fail the request
  }
}

/**
 * Invalidate all cache entries for a given player.
 * Called when player data changes.
 */
export async function invalidateByPlayer(
  playerId: string,
  sbUrl: string,
  sbKey: string,
): Promise<number> {
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/agent_response_cache?player_id=eq.${playerId}`,
      {
        method: "DELETE",
        headers: { ...sbHeaders(sbKey), Prefer: "return=representation" },
      },
    );
    if (res.ok) {
      const deleted = await res.json() as unknown[];
      return deleted.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Invalidate all cache entries for a given video.
 * Called when a new video is uploaded.
 */
export async function invalidateByVideo(
  videoId: string,
  sbUrl: string,
  sbKey: string,
): Promise<number> {
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/agent_response_cache?video_id=eq.${videoId}`,
      {
        method: "DELETE",
        headers: { ...sbHeaders(sbKey), Prefer: "return=representation" },
      },
    );
    if (res.ok) {
      const deleted = await res.json() as unknown[];
      return deleted.length;
    }
    return 0;
  } catch {
    return 0;
  }
}
