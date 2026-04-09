/**
 * VITAS · Tests — useSupabaseSync hook
 * Verifica: estado online/offline, pending count, procesamiento de cola
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false, configured: false })),
}));

vi.mock("@/services/real/syncQueueService", () => ({
  SyncQueueService: {
    pendingCount: vi.fn(() => 0),
    getQueue: vi.fn(() => []),
    dequeue: vi.fn(),
    incrementRetry: vi.fn(),
    pruneStale: vi.fn(() => 0),
    setTimestamp: vi.fn(),
  },
}));

vi.mock("@/services/real/supabasePlayerService", () => ({
  SupabasePlayerService: {
    pullAll: vi.fn(async () => {}),
    pushAll: vi.fn(async () => {}),
    pushOne: vi.fn(async () => {}),
    deleteOne: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: {
    pullAll: vi.fn(async () => {}),
    pushAll: vi.fn(async () => {}),
    pushOne: vi.fn(async () => {}),
    deleteOne: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/real/subscriptionService", () => ({
  SubscriptionService: {
    syncFromSupabase: vi.fn(async () => {}),
    syncAnalysesFromSupabase: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/real/userProfileService", () => ({
  UserProfileService: {
    syncFromSupabase: vi.fn(async () => {}),
  },
}));

import { useAuth } from "@/context/AuthContext";
import { SyncQueueService } from "@/services/real/syncQueueService";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useSupabaseSync", () => {
  let onlineGetter: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onlineGetter = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    onlineGetter.mockRestore();
  });

  it("reporta estado online", () => {
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.online).toBe(true);
  });

  it("reporta offline cuando navigator.onLine es false", () => {
    onlineGetter.mockReturnValue(false);
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.online).toBe(false);
  });

  it("refleja pending items del SyncQueueService", () => {
    (SyncQueueService.pendingCount as ReturnType<typeof vi.fn>).mockReturnValue(3);
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.pending).toBe(3);
  });

  it("inicia sin syncing si no hay usuario", () => {
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.syncing).toBe(false);
  });

  it("responde al evento offline del window (requiere configured=true)", async () => {
    // Event listeners only register when configured=true
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null, session: null, loading: false, configured: true,
    });

    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(result.current.online).toBe(false));
  });

  it("responde al evento online del window (requiere configured=true)", async () => {
    onlineGetter.mockReturnValue(false);
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null, session: null, loading: false, configured: true,
    });

    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.online).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.online).toBe(true));
  });

  it("lastSync es null al inicio", () => {
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.lastSync).toBeNull();
  });

  it("error es null al inicio", () => {
    const { result } = renderHook(() => useSupabaseSync(), { wrapper: createWrapper() });
    expect(result.current.error).toBeNull();
  });
});
