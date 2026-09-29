/**
 * useSupabaseSync.processQueue — solo sube las ops de la cuenta con sesión.
 *
 * Antes procesaba la cola ENTERA con `user.id` de quien tuviera la sesión: en un
 * dispositivo compartido, el cambio pendiente de la cuenta A (datos de un menor)
 * se escribía bajo la cuenta B. Ahora la op de A se queda a nombre de A.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ userId: "user-B" }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: auth.userId }, session: null, loading: false, configured: true }),
}));

const pushOne = vi.hoisted(() => vi.fn(async (_userId: string, _player: unknown) => {}));
const deleteOne = vi.hoisted(() => vi.fn(async (_userId: string, _id: string) => {}));
vi.mock("@/services/real/supabasePlayerService", () => ({
  SupabasePlayerService: {
    pullAll: vi.fn(async () => []),
    pushAll: vi.fn(async () => {}),
    pushOne,
    deleteOne,
  },
}));
vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: {
    pullAll: vi.fn(async () => []),
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
  UserProfileService: { syncFromSupabase: vi.fn(async () => {}) },
}));

import { SyncQueueService } from "@/services/real/syncQueueService";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  localStorage.clear();
  pushOne.mockClear();
  deleteOne.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useSupabaseSync · cola por cuenta", () => {
  it("con B en sesión: sube la op de B y NO la de A (ni la sin dueño); la de A se queda", async () => {
    SyncQueueService.enqueue("update", "player", "pA", { id: "pA", name: "menor de A" }, "user-A");
    SyncQueueService.enqueue("update", "player", "pX", { id: "pX", name: "sin dueño" });
    SyncQueueService.enqueue("update", "player", "pB", { id: "pB", name: "de B" }, "user-B");

    const { result } = renderHook(() => useSupabaseSync(), { wrapper });

    await waitFor(() => expect(pushOne).toHaveBeenCalledTimes(1));
    expect(pushOne).toHaveBeenCalledWith("user-B", { id: "pB", name: "de B" });
    expect(pushOne).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "pA" }));
    expect(pushOne).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "pX" }));

    // la de B sale de la cola; la de A sigue a nombre de A
    expect(SyncQueueService.hasPendingFor("player", "pB", "user-B")).toBe(false);
    expect(SyncQueueService.hasPendingFor("player", "pA", "user-A")).toBe(true);
    // el contador de la UI es el de B, no el del dispositivo
    await waitFor(() => expect(result.current.pending).toBe(0));
  });

  it("un borrado pendiente de A no se ejecuta con la sesión de B", async () => {
    SyncQueueService.enqueue("delete", "player", "pA", null, "user-A");
    renderHook(() => useSupabaseSync(), { wrapper });
    // deja correr el pull + processQueue
    await waitFor(() => expect(SyncQueueService.getQueue()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(deleteOne).not.toHaveBeenCalled();
    expect(pushOne).not.toHaveBeenCalled();
  });
});
