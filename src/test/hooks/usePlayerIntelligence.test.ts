/**
 * Tests for usePlayerIntelligence hook — exported functions and initial states
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/services/real/similarityService", () => ({
  findSimilarPlayers: vi.fn(async () => ({
    matches: [],
    bestMatch: null,
    inputMetrics: { speed: 70, shooting: 70, vision: 70, technique: 70, defending: 70, stamina: 70 },
  })),
}));

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getById: vi.fn(() => null),
    updateMetrics: vi.fn(async () => {}),
    updatePHV: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/localVideoUtils", () => ({
  extractKeyframesFromVideo: vi.fn(async () => []),
  readVideoAsBase64: vi.fn(async () => null),
  getOptimalFrameCount: vi.fn(() => 8),
}));

vi.mock("@/lib/kpiProjections", () => ({
  computeKPIs: vi.fn(() => ({})),
  generateMonthlyChallenges: vi.fn(() => []),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/services/scoutService", () => ({
  triggerInsightForPlayer: vi.fn(async () => {}),
}));

import { usePlayerIntelligence, useSavedAnalyses } from "@/hooks/usePlayerIntelligence";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const mockPlayer = {
  id: "p1",
  name: "Test Player",
  age: 14,
  position: "delantero",
  foot: "right" as const,
  height: 165,
  weight: 55,
  competitiveLevel: "Regional",
  gender: "M" as const,
  vsi: 72,
  minutesPlayed: 300,
  metrics: { speed: 75, technique: 80, vision: 65, stamina: 70, shooting: 85, defending: 40 },
  vsiHistory: [68, 70, 72],
  phvCategory: "ontme" as const,
  phvOffset: 0.3,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-06-01T00:00:00Z",
};

describe("usePlayerIntelligence", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    expect(result.current.state.step).toBe("idle");
    expect(result.current.state.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it("analysisResult starts as null", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    expect(result.current.analysisResult).toBeNull();
    expect(result.current.similarityData).toBeNull();
  });

  it("exposes runAnalysis function", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.runAnalysis).toBe("function");
  });

  it("exposes refetchSimilarity function", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.refetchSimilarity).toBe("function");
  });

  it("reset returns to idle state", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    result.current.reset();
    expect(result.current.state.step).toBe("idle");
    expect(result.current.analysisResult).toBeNull();
  });

  it("isSimilarityLoading starts as false", () => {
    const { result } = renderHook(() => usePlayerIntelligence(mockPlayer), {
      wrapper: createWrapper(),
    });
    expect(result.current.isSimilarityLoading).toBe(false);
  });
});

describe("useSavedAnalyses", () => {
  it("does not fetch when SUPABASE_CONFIGURED is false", () => {
    const { result } = renderHook(() => useSavedAnalyses("p1"), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
