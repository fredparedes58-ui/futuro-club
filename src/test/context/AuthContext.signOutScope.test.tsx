/**
 * AuthContext — cerrar sesión no deja los datos de menores de una cuenta a la
 * siguiente del dispositivo (caché `vitas_players` + SyncQueue).
 *
 * Antes signOut solo limpiaba la organización: la caché de jugadores y la cola
 * seguían ahí para la cuenta que entrara después.
 *
 * Contrato:
 *  - signOut() y el evento SIGNED_OUT (sesión revocada/caducada) borran la caché
 *    de jugadores y las ops sin dueño; las ops de la cuenta que sale se conservan
 *    A SU NOMBRE (no se pierden en silencio, no las ve nadie más);
 *  - si entra otra cuenta distinta de la que llenó la caché, la caché se borra;
 *  - la misma cuenta (arranque, refresco de token) conserva su caché.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  listener: null as null | ((event: string, session: unknown) => void),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: auth.signOut,
    },
  },
}));
vi.mock("@/lib/demoMode", () => ({ IS_DEMO: false, DEMO_USER: null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/services/real/organizationService", () => ({
  OrganizationService: { getOrgId: () => null, clearCurrent: vi.fn(), fetchForUser: vi.fn(async () => null) },
}));

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SyncQueueService } from "@/services/real/syncQueueService";
import { LocalAccountScope } from "@/services/real/localAccountScope";
import { StorageService } from "@/services/real/storageService";

const A = "user-A";
const B = "user-B";

let ctx: ReturnType<typeof useAuth> | null = null;
function Probe() {
  ctx = useAuth();
  return null;
}

async function mountAs(userId: string | null) {
  auth.session = userId ? { user: { id: userId } } : null;
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(ctx?.loading).toBe(false));
}

function seedDeviceWithA() {
  LocalAccountScope.onSignedIn(A);
  StorageService.set("players", [{ id: "pA", name: "Menor De A", birthDate: "2015-05-10" }]);
  SyncQueueService.enqueue("update", "player", "pA", { id: "pA", name: "Menor De A" }, A);
  SyncQueueService.enqueue("update", "player", "pX", { id: "pX" }); // sin dueño (cola antigua)
}

beforeEach(() => {
  localStorage.clear();
  ctx = null;
  auth.listener = null;
  auth.signOut.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("AuthContext · signOut limpia la caché local de la cuenta", () => {
  it("signOut(): fuera la caché de jugadores y las ops sin dueño; las de A se quedan a su nombre", async () => {
    seedDeviceWithA();
    await mountAs(A);
    await act(async () => {
      await ctx!.signOut();
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("vitas_players")).toBeNull();
    expect(SyncQueueService.getQueue().map((q) => [q.entityId, q.ownerId])).toEqual([["pA", A]]);
  });

  it("evento SIGNED_OUT (sesión revocada, sin pulsar «salir») limpia igual", async () => {
    seedDeviceWithA();
    await mountAs(A);
    act(() => auth.listener!("SIGNED_OUT", null));
    expect(localStorage.getItem("vitas_players")).toBeNull();
    expect(SyncQueueService.hasPendingFor("player", "pA", A)).toBe(true);
    expect(SyncQueueService.getQueue()).toHaveLength(1);
  });

  it("entra B en un dispositivo cuya caché llenó A (sin SIGNED_OUT): la caché de A se borra al arrancar", async () => {
    seedDeviceWithA();
    await mountAs(B);
    expect(localStorage.getItem("vitas_players")).toBeNull();
    expect(LocalAccountScope.getOwner()).toBe(B);
    // B no ve la op de A
    expect(SyncQueueService.hasPendingFor("player", "pA", B)).toBe(false);
  });

  it("cambio de cuenta por SIGNED_IN también borra la caché anterior", async () => {
    seedDeviceWithA();
    await mountAs(A);
    expect(localStorage.getItem("vitas_players")).not.toBeNull();
    act(() => auth.listener!("SIGNED_IN", { user: { id: B } }));
    expect(localStorage.getItem("vitas_players")).toBeNull();
  });

  it("la misma cuenta (arranque + refresco de token) conserva su caché y su cola", async () => {
    seedDeviceWithA();
    await mountAs(A);
    act(() => auth.listener!("TOKEN_REFRESHED", { user: { id: A } }));
    expect(StorageService.get<unknown[]>("players", [])).toHaveLength(1);
    expect(SyncQueueService.getQueue()).toHaveLength(2);
  });
});
