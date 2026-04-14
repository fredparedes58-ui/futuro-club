/**
 * Tests for Rankings Service
 * Validates local fallback: percentile calculation, age groups, filtering, sorting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
  SUPABASE_CONFIGURED: false, // Force local fallback
}));

const mockPlayers = [
  { id: "p1", name: "Ana", age: 14, position: "Mediocentro", foot: "right", height: 165, weight: 55, vsi: 75, phvCategory: "on-time", phvOffset: 0, competitiveLevel: "Nacional", minutesPlayed: 800, metrics: { speed: 70, technique: 80, vision: 75, stamina: 65, shooting: 60, defending: 55 } },
  { id: "p2", name: "Bruno", age: 12, position: "Delantero", foot: "left", height: 155, weight: 48, vsi: 82, phvCategory: "early", phvOffset: 1.2, competitiveLevel: "Regional", minutesPlayed: 600, metrics: { speed: 85, technique: 65, vision: 55, stamina: 70, shooting: 80, defending: 40 } },
  { id: "p3", name: "Carlos", age: 16, position: "Defensa Central", foot: "right", height: 178, weight: 68, vsi: 68, phvCategory: "late", phvOffset: -0.8, competitiveLevel: "Nacional", minutesPlayed: 1200, metrics: { speed: 55, technique: 50, vision: 60, stamina: 75, shooting: 40, defending: 85 } },
  { id: "p4", name: "Diana", age: 14, position: "Extremo", foot: "right", height: 160, weight: 50, vsi: 71, phvCategory: "on-time", phvOffset: 0.1, competitiveLevel: "Provincial", minutesPlayed: 500, metrics: { speed: 80, technique: 70, vision: 60, stamina: 65, shooting: 55, defending: 45 } },
  { id: "p5", name: "Emilio", age: 14, position: "Mediocentro", foot: "right", height: 168, weight: 57, vsi: 78, phvCategory: "on-time", phvOffset: 0.2, competitiveLevel: "Nacional", minutesPlayed: 900, metrics: { speed: 72, technique: 76, vision: 78, stamina: 68, shooting: 65, defending: 60 } },
];

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => mockPlayers),
    sort: vi.fn((players: typeof mockPlayers, field: string, dir: string) => {
      return [...players].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[field] as number;
        const bVal = (b as Record<string, unknown>)[field] as number;
        return dir === "desc" ? bVal - aVal : aVal - bVal;
      });
    }),
  },
}));

vi.mock("@/services/real/adapters", () => ({
  adaptPlayerForUI: vi.fn((p: Record<string, unknown>) => ({
    ...p,
    positionShort: (p.position as string).slice(0, 3).toUpperCase(),
    stats: p.metrics,
    trending: "stable",
    lastActive: new Date().toISOString(),
  })),
}));

import { fetchRankedPlayers } from "@/services/rankingsService";

describe("fetchRankedPlayers (local fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all players with no filters", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    expect(result.players.length).toBe(5);
    expect(result.total).toBe(5);
    expect(result.totalUnfiltered).toBe(5);
  });

  it("sorts by VSI descending", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    const vsis = result.players.map(p => p.vsi);
    for (let i = 1; i < vsis.length; i++) {
      expect(vsis[i]).toBeLessThanOrEqual(vsis[i - 1]);
    }
  });

  it("sorts by age ascending", async () => {
    const result = await fetchRankedPlayers("age", "asc", {});
    const ages = result.players.map(p => p.age);
    for (let i = 1; i < ages.length; i++) {
      expect(ages[i]).toBeGreaterThanOrEqual(ages[i - 1]);
    }
  });

  // ── Percentile calculation ──────────────────────────────────────────

  it("assigns percentile to each player", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    for (const p of result.players) {
      expect(p.percentile).toBeGreaterThanOrEqual(0);
      expect(p.percentile).toBeLessThanOrEqual(100);
    }
  });

  it("highest VSI gets highest percentile", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    const bruno = result.players.find(p => p.name === "Bruno")!; // VSI 82
    const carlos = result.players.find(p => p.name === "Carlos")!; // VSI 68
    expect(bruno.percentile).toBeGreaterThan(carlos.percentile);
  });

  // ── Age groups ──────────────────────────────────────────────────────

  it("assigns correct age groups", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    const bruno = result.players.find(p => p.name === "Bruno")!; // age 12
    const ana = result.players.find(p => p.name === "Ana")!; // age 14
    const carlos = result.players.find(p => p.name === "Carlos")!; // age 16
    expect(bruno.ageGroup).toBe("Sub-12");
    expect(ana.ageGroup).toBe("Sub-14");
    expect(carlos.ageGroup).toBe("Sub-16");
  });

  it("provides age group stats", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    expect(result.ageGroupStats).toBeDefined();
    expect(result.ageGroups.length).toBeGreaterThan(0);

    // Sub-14 should have 3 players (Ana, Diana, Emilio)
    const sub14 = result.ageGroupStats["Sub-14"];
    if (sub14) {
      expect(sub14.count).toBe(3);
      expect(sub14.avgVsi).toBeGreaterThan(0);
      expect(sub14.minVsi).toBeLessThanOrEqual(sub14.maxVsi);
    }
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it("filters by search (name)", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { search: "bruno" });
    expect(result.players.length).toBe(1);
    expect(result.players[0].name).toBe("Bruno");
    expect(result.totalUnfiltered).toBe(5); // Total before filter
  });

  it("filters by PHV category", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { phv: "early" });
    expect(result.players.length).toBe(1);
    expect(result.players[0].name).toBe("Bruno");
  });

  it("filters by position", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { position: "Mediocentro" });
    expect(result.players.length).toBe(2);
    expect(result.players.every(p => p.position === "Mediocentro")).toBe(true);
  });

  it("filters by age group", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { ageGroup: "Sub-14" });
    expect(result.players.length).toBe(3);
    expect(result.players.every(p => p.age >= 13 && p.age <= 14)).toBe(true);
  });

  it("filters by competitive level", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { level: "Nacional" });
    expect(result.players.length).toBe(3);
  });

  it("phv=all returns all players", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { phv: "all" });
    expect(result.players.length).toBe(5);
  });

  it("position=Todos returns all", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", { position: "Todos" });
    expect(result.players.length).toBe(5);
  });

  it("combines multiple filters", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {
      ageGroup: "Sub-14",
      level: "Nacional",
    });
    // Sub-14 (Ana, Diana, Emilio) + Nacional (Ana, Emilio) = 2
    expect(result.players.length).toBe(2);
  });

  // ── Competitive levels ──────────────────────────────────────────────

  it("returns unique competitive levels", async () => {
    const result = await fetchRankedPlayers("vsi", "desc", {});
    expect(result.competitiveLevels).toContain("Nacional");
    expect(result.competitiveLevels).toContain("Regional");
    expect(result.competitiveLevels).toContain("Provincial");
  });
});
