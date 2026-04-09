/**
 * VITAS · Tests — usePlayers hooks
 * Verifica: useAllPlayers, useCreatePlayer, useDeletePlayer
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPlayers: Array<{ id: string; name: string; vsi: number; metrics: Record<string, number> }> = [];

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => mockPlayers),
    create: vi.fn((input: { name: string }) => {
      const player = { id: `p${Date.now()}`, ...input, vsi: 70, vsiHistory: [70], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      mockPlayers.push(player as any);
      return player;
    }),
    delete: vi.fn((id: string) => {
      const idx = mockPlayers.findIndex(p => p.id === id);
      if (idx >= 0) { mockPlayers.splice(idx, 1); return true; }
      return false;
    }),
    seedIfEmpty: vi.fn(),
  },
}));

vi.mock("@/services/real/supabasePlayerService", () => ({
  SupabasePlayerService: {
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/real/adapters", () => ({
  adaptPlayerForUI: vi.fn((p: any) => ({ ...p, displayName: p.name })),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false, configured: false })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {},
  SUPABASE_CONFIGURED: false,
}));

import { useAllPlayers, useCreatePlayer, useDeletePlayer } from "@/hooks/usePlayers";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("usePlayers hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayers.length = 0;
  });

  describe("useAllPlayers", () => {
    it("retorna array vacío inicialmente", async () => {
      const { result } = renderHook(() => useAllPlayers(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    it("retorna jugadores adaptados para UI", async () => {
      mockPlayers.push(
        { id: "p1", name: "Lucas", vsi: 75, metrics: { speed: 80 } },
        { id: "p2", name: "María", vsi: 82, metrics: { speed: 90 } },
      );

      const { result } = renderHook(() => useAllPlayers(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data![0]).toHaveProperty("displayName");
    });
  });

  describe("useCreatePlayer", () => {
    it("crea jugador y mutation tiene éxito", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreatePlayer(), { wrapper });

      result.current.mutate({
        name: "Nuevo",
        age: 15,
        position: "RW",
        foot: "right",
        height: 170,
        weight: 60,
        competitiveLevel: "Regional",
        minutesPlayed: 500,
        metrics: { speed: 80, technique: 74, vision: 71, stamina: 76, shooting: 78, defending: 45 },
        gender: "M",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockPlayers).toHaveLength(1);
      expect(mockPlayers[0].name).toBe("Nuevo");
    });
  });

  describe("useDeletePlayer", () => {
    it("elimina jugador existente", async () => {
      mockPlayers.push({ id: "p1", name: "ToDelete", vsi: 70, metrics: {} });
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeletePlayer(), { wrapper });

      result.current.mutate("p1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockPlayers).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("mutation captura errores sin explotar", async () => {
      const { PlayerService } = await import("@/services/real/playerService");
      (PlayerService.create as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error("Storage full");
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreatePlayer(), { wrapper });

      result.current.mutate({
        name: "Error", age: 15, position: "GK", foot: "left",
        height: 170, weight: 60, competitiveLevel: "Local",
        minutesPlayed: 0, metrics: { speed: 50, technique: 50, vision: 50, stamina: 50, shooting: 50, defending: 50 },
        gender: "M",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeDefined();
    });
  });
});
