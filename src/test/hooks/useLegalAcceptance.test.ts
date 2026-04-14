/**
 * useLegalAcceptance — Tests
 * Verifica estados de aceptación, cache, y acceptAll.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" } }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: async () => ({ "Content-Type": "application/json" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useLegalAcceptance } from "@/hooks/useLegalAcceptance";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useLegalAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("returns needsAcceptance=true when terms not accepted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          termsAccepted: false,
          privacyAccepted: true,
          needsAcceptance: true,
          currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
          acceptances: [],
        },
      }),
    });

    const { result } = renderHook(() => useLegalAcceptance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsAcceptance).toBe(true);
    expect(result.current.termsAccepted).toBe(false);
    expect(result.current.privacyAccepted).toBe(true);
  });

  it("returns needsAcceptance=false when all accepted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          termsAccepted: true,
          privacyAccepted: true,
          needsAcceptance: false,
          currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
          acceptances: [
            { document: "terms", version: "2026-04-12", acceptedAt: "2026-04-12T00:00:00Z", isCurrent: true },
            { document: "privacy", version: "2026-04-12", acceptedAt: "2026-04-12T00:00:00Z", isCurrent: true },
          ],
        },
      }),
    });

    const { result } = renderHook(() => useLegalAcceptance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsAcceptance).toBe(false);
    expect(result.current.termsAccepted).toBe(true);
    expect(result.current.privacyAccepted).toBe(true);
  });

  it("falls back to accepted=true when API fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useLegalAcceptance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Graceful fallback — don't block user
    expect(result.current.needsAcceptance).toBe(false);
  });

  it("caches status in localStorage", async () => {
    const statusData = {
      termsAccepted: true,
      privacyAccepted: true,
      needsAcceptance: false,
      currentVersions: { terms: "2026-04-12", privacy: "2026-04-12" },
      acceptances: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: statusData }),
    });

    const { result } = renderHook(() => useLegalAcceptance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const cached = localStorage.getItem("legal_acceptance_cache");
    expect(cached).toBeTruthy();
    expect(JSON.parse(cached!).termsAccepted).toBe(true);
  });
});
