/**
 * VITAS · Rankings Service
 * Fetches ranked players from API (server-side) with fallback to local PlayerService.
 */
import { PlayerService } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export type SortField = "vsi" | "name" | "age" | "percentile";
export type SortDir = "asc" | "desc";

export interface RankingsFilters {
  phv?: string;        // "all" | "early" | "on-time" | "late"
  position?: string;   // Position string or "Todos"
  ageGroup?: string;   // "Sub-14", etc. or "all"
  level?: string;      // Competitive level or "all"
  search?: string;     // Name search
}

export interface RankingsResponse {
  players: RankedPlayer[];
  total: number;
  totalUnfiltered: number;
  ageGroups: string[];
  ageGroupStats: Record<
    string,
    { count: number; avgVsi: number | null; minVsi: number | null; maxVsi: number | null }
  >;
  competitiveLevels: string[];
  limit: number;
  offset: number;
}

export interface RankedPlayer {
  id: string;
  name: string;
  age: number;
  position: string;
  secondaryPositions?: string[];          // polivalencia
  positionShort: string;
  vsi: number | null;                     // null ⇒ sin evaluar
  phvCategory: string;
  phvOffset: number;
  competitiveLevel: string;
  ageGroup: string;
  trending: "up" | "down" | "stable";
  percentile: number | null;              // null si sin evaluar
  percentileInAgeGroup: number | null;    // null si sin evaluar
  updatedAt: string;
  metrics: Record<string, number>;
  foot: string;
  height: number;
  weight: number;
}

/**
 * Fetch ranked players from the server-side API.
 * Falls back to local PlayerService if API unavailable.
 */
export async function fetchRankedPlayers(
  sortBy: SortField = "vsi",
  dir: SortDir = "desc",
  filters: RankingsFilters = {},
  limit = 50,
  offset = 0
): Promise<RankingsResponse> {
  // Try API first when Supabase is configured
  if (SUPABASE_CONFIGURED) {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        const params = new URLSearchParams({
          sort: sortBy,
          dir,
          limit: String(limit),
          offset: String(offset),
        });
        if (filters.phv && filters.phv !== "all") params.set("phv", filters.phv);
        if (filters.position && filters.position !== "Todos") params.set("position", filters.position);
        if (filters.ageGroup && filters.ageGroup !== "all") params.set("ageGroup", filters.ageGroup);
        if (filters.level && filters.level !== "all") params.set("level", filters.level);
        if (filters.search) params.set("search", filters.search);

        const res = await fetch(`/api/rankings/list?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const body = await res.json();
          return body.data ?? body;
        }
      }
    } catch {
      // Fallback to local
    }
  }

  // Fallback: local PlayerService
  return fetchLocalRankedPlayers(sortBy, dir, filters);
}

/** Local fallback using PlayerService (localStorage) */
function fetchLocalRankedPlayers(
  sortBy: SortField,
  dir: SortDir,
  filters: RankingsFilters
): RankingsResponse {
  const players = PlayerService.getAll();
  const sorted = PlayerService.sort(players, sortBy === "percentile" ? "vsi" : sortBy, dir);
  const uiPlayers = sorted.map(adaptPlayerForUI);

  // Calculate VSIs for percentiles — excluye jugadores sin evaluar (vsi null).
  const allVSIs = uiPlayers
    .map((p) => p.vsi)
    .filter((v): v is number => v !== null);

  const AGE_GROUPS: Record<string, [number, number]> = {
    "Sub-10": [8, 10], "Sub-12": [11, 12], "Sub-14": [13, 14],
    "Sub-16": [15, 16], "Sub-18": [17, 18], "Sub-21": [19, 21],
  };

  function getAgeGroup(age: number): string {
    for (const [label, [min, max]] of Object.entries(AGE_GROUPS)) {
      if (age >= min && age <= max) return label;
    }
    return "Sub-21";
  }

  function percentileRank(value: number, allValues: number[]): number {
    if (allValues.length <= 1) return 100;
    const below = allValues.filter((v) => v < value).length;
    const equal = allValues.filter((v) => v === value).length;
    return Math.round(((below + equal * 0.5) / allValues.length) * 100);
  }

  // Group VSIs by age group — solo evaluados para avg/percentiles; el conteo
  // por grupo cuenta a todos.
  const vsiByAgeGroup: Record<string, number[]> = {};
  const countByAgeGroup: Record<string, number> = {};
  const enriched: RankedPlayer[] = uiPlayers.map((p) => {
    const ageGroup = getAgeGroup(p.age);
    countByAgeGroup[ageGroup] = (countByAgeGroup[ageGroup] ?? 0) + 1;
    if (p.vsi !== null) {
      if (!vsiByAgeGroup[ageGroup]) vsiByAgeGroup[ageGroup] = [];
      vsiByAgeGroup[ageGroup].push(p.vsi);
    }
    return {
      id: p.id,
      name: p.name,
      age: p.age,
      position: p.position,
      secondaryPositions: (p as unknown as { secondaryPositions?: string[] }).secondaryPositions,
      positionShort: p.positionShort ?? p.position.slice(0, 3).toUpperCase(),
      vsi: p.vsi,
      phvCategory: p.phvCategory ?? "on-time",
      phvOffset: p.phvOffset ?? 0,
      competitiveLevel: p.competitiveLevel ?? "Regional",
      ageGroup,
      trending: p.trending ?? "stable",
      // Sin evaluar ⇒ percentil null (no compite ni cuenta como 0).
      percentile: p.vsi === null ? null : percentileRank(p.vsi, allVSIs),
      percentileInAgeGroup: null, // calculated below
      updatedAt: p.lastActive ?? new Date().toISOString(),
      metrics: p.stats ?? {},
      foot: p.foot ?? "right",
      height: p.height ?? 170,
      weight: p.weight ?? 60,
    } as RankedPlayer;
  });

  // Calculate age group percentiles (sin evaluar queda null)
  for (const p of enriched) {
    p.percentileInAgeGroup =
      p.vsi === null ? null : percentileRank(p.vsi, vsiByAgeGroup[p.ageGroup] ?? allVSIs);
  }

  // Apply filters
  let filtered = enriched;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }
  if (filters.phv && filters.phv !== "all") {
    filtered = filtered.filter((p) => p.phvCategory === filters.phv);
  }
  if (filters.position && filters.position !== "Todos") {
    // Incluye también jugadores que tienen la posición como secundaria (polivalencia)
    filtered = filtered.filter((p) => {
      const raw = p as unknown as { secondaryPositions?: string[] };
      const secondary = raw.secondaryPositions ?? [];
      return p.position === filters.position || secondary.includes(filters.position!);
    });
  }
  if (filters.ageGroup && filters.ageGroup !== "all") {
    filtered = filtered.filter((p) => p.ageGroup === filters.ageGroup);
  }
  if (filters.level && filters.level !== "all") {
    filtered = filtered.filter(
      (p) => p.competitiveLevel.toLowerCase() === filters.level!.toLowerCase()
    );
  }

  // Age group stats — count = todos; avg/min/max solo evaluados (null si ninguno).
  const ageGroupStats: RankingsResponse["ageGroupStats"] = {};
  for (const [group, count] of Object.entries(countByAgeGroup)) {
    const vsis = vsiByAgeGroup[group] ?? [];
    ageGroupStats[group] = {
      count,
      avgVsi: vsis.length > 0 ? Math.round((vsis.reduce((a, b) => a + b, 0) / vsis.length) * 10) / 10 : null,
      minVsi: vsis.length > 0 ? Math.min(...vsis) : null,
      maxVsi: vsis.length > 0 ? Math.max(...vsis) : null,
    };
  }

  return {
    players: filtered,
    total: filtered.length,
    totalUnfiltered: enriched.length,
    ageGroups: Object.keys(countByAgeGroup),
    ageGroupStats,
    competitiveLevels: [...new Set(enriched.map((p) => p.competitiveLevel))],
    limit: filtered.length,
    offset: 0,
  };
}
