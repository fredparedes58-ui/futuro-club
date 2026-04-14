/**
 * Tests for useTeamIntelligence hook — initial states
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(() => ({
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

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/lib/localVideoUtils", () => ({
  isLocalSrc: vi.fn(() => false),
  readVideoAsBase64: vi.fn(async () => null),
  extractKeyframesFromVideo: vi.fn(async () => []),
  getOptimalFrameCount: vi.fn(() => 8),
}));

import { useTeamIntelligence } from "@/hooks/useTeamIntelligence";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useTeamIntelligence", () => {
  it("initializes with idle state", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(result.current.state.step).toBe("idle");
    expect(result.current.state.progress).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("report starts as null", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(result.current.analysisResult).toBeNull();
  });

  it("exposes runTeamAnalysis function", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.runAnalysis).toBe("function");
  });

  it("exposes reset function", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    expect(typeof result.current.reset).toBe("function");
  });

  it("reset returns to idle", () => {
    const { result } = renderHook(() => useTeamIntelligence(), {
      wrapper: createWrapper(),
    });
    result.current.reset();
    expect(result.current.state.step).toBe("idle");
    expect(result.current.analysisResult).toBeNull();
  });
});
