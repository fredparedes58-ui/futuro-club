import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => []),
    seedIfEmpty: vi.fn(),
    sort: vi.fn((_players: any[], _field: string, _dir: string) => []),
  },
}));

vi.mock("@/services/real/adapters", () => ({
  adaptPlayerForUI: vi.fn((p: any) => p),
}));

describe("Rankings service types", () => {
  it("exports rankingsService with fetchRankedPlayers", async () => {
    const mod = await import("@/services/rankingsService");
    expect(mod).toBeDefined();
    expect(mod.fetchRankedPlayers).toBeDefined();
    expect(typeof mod.fetchRankedPlayers).toBe("function");
  });
});

describe("useRankings hook", () => {
  it("exports useRankedPlayers hook", async () => {
    const mod = await import("@/hooks/useRankings");
    expect(mod.useRankedPlayers).toBeDefined();
    expect(typeof mod.useRankedPlayers).toBe("function");
  });
});
