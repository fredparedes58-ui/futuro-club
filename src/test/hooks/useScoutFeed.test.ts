import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  useMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test" } } })) } },
  SUPABASE_CONFIGURED: true,
}));

describe("useScoutFeed hook", () => {
  it("exports useScoutInsights", async () => {
    const mod = await import("@/hooks/useScoutFeed");
    expect(mod.useScoutInsights).toBeDefined();
    expect(typeof mod.useScoutInsights).toBe("function");
  });

  it("exports useGenerateInsights", async () => {
    const mod = await import("@/hooks/useScoutFeed");
    expect(mod.useGenerateInsights).toBeDefined();
    expect(typeof mod.useGenerateInsights).toBe("function");
  });
});
