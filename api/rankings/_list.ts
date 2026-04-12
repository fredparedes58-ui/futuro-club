/**
 * VITAS · Rankings API — Server-side ranked player list
 * GET /api/rankings/list
 *
 * Features:
 * - Server-side pagination (limit/offset)
 * - Sort by VSI, age, name
 * - Filter by PHV category, position, age group, competitive level
 * - Percentile calculation per age group
 * - Total count for pagination
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

// ── VSI Weights (same as MetricsService) ─────────────────────────────────
const VSI_WEIGHTS: Record<string, number> = {
  speed: 0.18, technique: 0.22, vision: 0.20,
  stamina: 0.15, shooting: 0.13, defending: 0.12,
};

// ── Age Group definitions ────────────────────────────────────────────────
const AGE_GROUPS: Record<string, [number, number]> = {
  "Sub-10": [8, 10],
  "Sub-12": [11, 12],
  "Sub-14": [13, 14],
  "Sub-16": [15, 16],
  "Sub-18": [17, 18],
  "Sub-21": [19, 21],
};

function getAgeGroup(age: number): string {
  for (const [label, [min, max]] of Object.entries(AGE_GROUPS)) {
    if (age >= min && age <= max) return label;
  }
  return "Sub-21";
}

/** Calculate percentile rank within a sorted array of values */
function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length <= 1) return 100;
  const below = allValues.filter((v) => v < value).length;
  const equal = allValues.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / allValues.length) * 100);
}

// ── Module-level cache (persists across requests in same Edge instance) ──
type PlayerRow = {
  id: string;
  name: string;
  age: number;
  position: string;
  positionShort: string;
  vsi: number;
  phvCategory: string;
  phvOffset: number;
  competitiveLevel: string;
  ageGroup: string;
  trending: "up" | "down" | "stable";
  percentile: number;
  percentileInAgeGroup: number;
  updatedAt: string;
  metrics: Record<string, number>;
  foot: string;
  height: number;
  weight: number;
};

const rankingsCache = new Map<string, { data: PlayerRow[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Handler ──────────────────────────────────────────────────────────────

export default withHandler(
  { method: "GET", requireAuth: true, maxRequests: 60 },
  async ({ req, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }

    const url = new URL(req.url);
    const sortBy = url.searchParams.get("sort") ?? "vsi";
    const sortDir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    // Filters
    const phvFilter = url.searchParams.get("phv"); // "early", "ontme", "late"
    const posFilter = url.searchParams.get("position"); // Position string
    const ageGroupFilter = url.searchParams.get("ageGroup"); // "Sub-14", etc.
    const levelFilter = url.searchParams.get("level"); // competitive level
    const search = url.searchParams.get("search")?.toLowerCase();

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // Try RPC first (server-side percentiles, O(n) in Postgres)
    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_ranked_players`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          p_user_id: userId,
          p_sort_by: sortBy,
          p_sort_dir: sortDir,
          p_limit: limit,
          p_offset: offset,
          p_search: search || null,
          p_phv: phvFilter || null,
          p_position: posFilter || null,
          p_age_group: ageGroupFilter || null,
          p_level: levelFilter || null,
        }),
      });

      if (rpcRes.ok) {
        const rpcData = await rpcRes.json();
        // RPC returns the full response object directly
        // Map player data format to match existing API contract
        const players = (rpcData.players || []).map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.name,
          age: p.age,
          position: p.position,
          vsi: Number(p.vsi),
          phvCategory: p.phv_category === "ontme" ? "on-time" : p.phv_category,
          competitiveLevel: p.competitive_level,
          ageGroup: p.age_group,
          percentile: Math.round(Number(p.percentile)),
          percentileInAgeGroup: Math.round(Number(p.percentile_in_age_group)),
          updatedAt: p.updated_at,
          ...((p.data || {}) as Record<string, unknown>),
        }));

        return successResponse({
          players,
          total: rpcData.total || 0,
          limit,
          offset,
          totalUnfiltered: rpcData.totalUnfiltered || 0,
          ageGroups: rpcData.ageGroups || [],
          ageGroupStats: rpcData.ageGroupStats || {},
          competitiveLevels: rpcData.competitiveLevels || [],
        });
      }
      // RPC failed — fall through to in-memory approach
      console.warn("[rankings] RPC failed, falling back to in-memory:", rpcRes.status);
    } catch (rpcErr) {
      console.warn("[rankings] RPC exception, falling back to in-memory:", rpcErr);
    }

    // ── Fallback: in-memory approach ──
    // Fetch ALL players for this user (needed for percentile calculations)
    // This is intentional — percentiles require the full dataset
    // Use module-level cache to avoid repeated DB fetches within the same Edge instance
    let allPlayers: PlayerRow[];

    const cacheKey = `rankings:${userId}`;
    const cached = rankingsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      // Use cached data — skip DB fetch
      allPlayers = cached.data;
    } else {
      const allUrl = `${supabaseUrl}/rest/v1/players?user_id=eq.${userId}&select=id,data,updated_at`;
      const allRes = await fetch(allUrl, { headers: { ...headers, Prefer: "count=exact" } });

      if (!allRes.ok) {
        const errText = await allRes.text();
        return errorResponse(`Failed to fetch players: ${errText.slice(0, 200)}`, 500);
      }

      const allRows = (await allRes.json()) as Array<{
        id: string;
        data: Record<string, unknown>;
        updated_at: string;
      }>;

      // First pass: extract all players
      allPlayers = allRows.map((row) => {
        const d = row.data as Record<string, unknown>;
        const metrics = (d.metrics ?? {}) as Record<string, number>;
        const vsi = typeof d.vsi === "number" ? d.vsi : calculateVSI(metrics);
        const age = (d.age as number) ?? 15;
        const vsiHistory = Array.isArray(d.vsiHistory) ? (d.vsiHistory as number[]) : [vsi];
        const prevVSI = vsiHistory.length >= 2 ? vsiHistory[vsiHistory.length - 2] : vsi;
        const delta = vsi - prevVSI;

        return {
          id: row.id,
          name: (d.name as string) ?? "Sin nombre",
          age,
          position: (d.position as string) ?? "CM",
          positionShort: abbreviatePosition((d.position as string) ?? "CM"),
          vsi,
          phvCategory: mapPhv((d.phvCategory as string) ?? "ontme"),
          phvOffset: (d.phvOffset as number) ?? 0,
          competitiveLevel: (d.competitiveLevel as string) ?? "Regional",
          ageGroup: getAgeGroup(age),
          trending: delta > 2 ? "up" : delta < -2 ? "down" : "stable",
          percentile: 0, // calculated below
          percentileInAgeGroup: 0, // calculated below
          updatedAt: row.updated_at,
          metrics,
          foot: (d.foot as string) ?? "right",
          height: (d.height as number) ?? 170,
          weight: (d.weight as number) ?? 60,
        };
      });

      // Second pass: calculate percentiles against full unfiltered dataset
      const allVSIsForCache = allPlayers.map((p) => p.vsi);
      const vsiByAgeGroupForCache: Record<string, number[]> = {};
      for (const p of allPlayers) {
        if (!vsiByAgeGroupForCache[p.ageGroup]) vsiByAgeGroupForCache[p.ageGroup] = [];
        vsiByAgeGroupForCache[p.ageGroup].push(p.vsi);
      }
      for (const p of allPlayers) {
        p.percentile = percentileRank(p.vsi, allVSIsForCache);
        p.percentileInAgeGroup = percentileRank(
          p.vsi,
          vsiByAgeGroupForCache[p.ageGroup] ?? allVSIsForCache
        );
      }

      rankingsCache.set(cacheKey, { data: allPlayers, timestamp: Date.now() });
    }

    // Build vsiByAgeGroup from current allPlayers (cached or fresh) for stats
    const vsiByAgeGroup: Record<string, number[]> = {};
    for (const p of allPlayers) {
      if (!vsiByAgeGroup[p.ageGroup]) vsiByAgeGroup[p.ageGroup] = [];
      vsiByAgeGroup[p.ageGroup].push(p.vsi);
    }

    // Apply filters
    let filtered = allPlayers;

    if (search) {
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(search));
    }
    if (phvFilter && phvFilter !== "all") {
      filtered = filtered.filter((p) => p.phvCategory === phvFilter);
    }
    if (posFilter && posFilter !== "Todos") {
      filtered = filtered.filter((p) => p.position === posFilter);
    }
    if (ageGroupFilter && ageGroupFilter !== "all") {
      filtered = filtered.filter((p) => p.ageGroup === ageGroupFilter);
    }
    if (levelFilter && levelFilter !== "all") {
      filtered = filtered.filter(
        (p) => p.competitiveLevel.toLowerCase() === levelFilter.toLowerCase()
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let diff: number;
      switch (sortBy) {
        case "vsi":
          diff = a.vsi - b.vsi;
          break;
        case "age":
          diff = a.age - b.age;
          break;
        case "name":
          diff = a.name.localeCompare(b.name);
          break;
        case "percentile":
          diff = a.percentileInAgeGroup - b.percentileInAgeGroup;
          break;
        default:
          diff = a.vsi - b.vsi;
      }
      return sortDir === "asc" ? diff : -diff;
    });

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    // Age group summary stats
    const ageGroupStats: Record<string, { count: number; avgVsi: number; minVsi: number; maxVsi: number }> = {};
    for (const [group, vsis] of Object.entries(vsiByAgeGroup)) {
      ageGroupStats[group] = {
        count: vsis.length,
        avgVsi: Math.round((vsis.reduce((a, b) => a + b, 0) / vsis.length) * 10) / 10,
        minVsi: Math.min(...vsis),
        maxVsi: Math.max(...vsis),
      };
    }

    return successResponse({
      players: paginated,
      total,
      limit,
      offset,
      totalUnfiltered: allPlayers.length,
      ageGroups: Object.keys(vsiByAgeGroup),
      ageGroupStats,
      competitiveLevels: [...new Set(allPlayers.map((p) => p.competitiveLevel))],
    });
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────

function calculateVSI(metrics: Record<string, number>): number {
  const raw = Object.entries(VSI_WEIGHTS).reduce((acc, [key, weight]) => {
    return acc + (metrics[key] ?? 0) * weight;
  }, 0);
  return Math.round(raw * 10) / 10;
}

function mapPhv(raw: string): string {
  if (raw === "ontme") return "on-time";
  return raw;
}

function abbreviatePosition(pos: string): string {
  const map: Record<string, string> = {
    "Portero": "POR",
    "Defensa Central": "DFC",
    "Lateral Derecho": "LD",
    "Lateral Izquierdo": "LI",
    "Pivote": "PIV",
    "Mediocentro": "MC",
    "Mediapunta": "MP",
    "Extremo Derecho": "ED",
    "Extremo Izquierdo": "EI",
    "Delantero Centro": "DC",
    "Segundo Delantero": "SD",
    // English/short forms pass through
    GK: "GK", CB: "CB", RB: "RB", LB: "LB",
    CDM: "CDM", CM: "CM", CAM: "CAM",
    RW: "RW", LW: "LW", ST: "ST", CF: "CF",
    RCB: "RCB", LCB: "LCB", RWB: "RWB", LWB: "LWB",
    DM: "DM", LCM: "LCM", RCM: "RCM", RM: "RM", LM: "LM",
  };
  return map[pos] ?? pos.slice(0, 3).toUpperCase();
}
