/**
 * SyncQueue POR CUENTA — dispositivo compartido, datos de menores.
 *
 * Antes la cola (`vitas_sync_queue`) y la caché de jugadores (`vitas_players`) no
 * tenían dueño y signOut no limpiaba ninguna: con la cola ya viva (pushOne lanza),
 * el cambio pendiente de la cuenta A se subía bajo la cuenta B, que era la que
 * tuviera la sesión abierta después.
 *
 * Contrato:
 *  - cada op lleva `ownerId`; solo esa cuenta la ve (pendiente), la sube o la
 *    protege del pull; la de otra cuenta NO se toca ni se mezcla;
 *  - una op sin dueño no la sube nadie y se descarta al cerrar sesión;
 *  - al cerrar sesión se borra la caché de jugadores; las ops de la cuenta que
 *    sale se conservan A SU NOMBRE y vuelven cuando esa cuenta entra de nuevo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  failUpsert: false,
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    from: () => ({
      upsert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        if (db.failUpsert) return { error: { message: "network down" } };
        for (const r of Array.isArray(payload) ? payload : [payload]) db.rows.set(r.id as string, r);
        return { error: null };
      },
      select: () => ({
        eq: (_col: string, userId: string) => ({
          order: async () => ({
            data: [...db.rows.values()]
              .filter((r) => r.user_id === userId)
              .map((r) => ({ id: r.id, data: r.data })),
            error: null,
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/services/real/organizationService", () => ({ OrganizationService: { getOrgId: () => null } }));
vi.mock("@/services/real/agentService", () => ({ AgentService: { invalidateCacheForPlayer: vi.fn() } }));

import { SyncQueueService } from "@/services/real/syncQueueService";
import { LocalAccountScope } from "@/services/real/localAccountScope";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { PlayerService, type CreatePlayerInput } from "@/services/real/playerService";

const A = "user-A";
const B = "user-B";
const BASE: CreatePlayerInput = {
  name: "Menor De A",
  age: 11,
  position: "ST",
  foot: "right",
  height: 142,
  weight: 36,
  competitiveLevel: "Regional",
  minutesPlayed: 0,
  gender: "M",
};

beforeEach(() => {
  localStorage.clear();
  db.rows.clear();
  db.failUpsert = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("SyncQueueService · cola por cuenta", () => {
  it("la op de A no es visible para B (ni pendiente ni en su cola)", () => {
    SyncQueueService.enqueue("update", "player", "p1", { name: "A" }, A);
    expect(SyncQueueService.getQueueFor(B)).toEqual([]);
    expect(SyncQueueService.hasPendingFor("player", "p1", B)).toBe(false);
    expect(SyncQueueService.pendingCount(B)).toBe(0);
    expect(SyncQueueService.hasPendingFor("player", "p1", A)).toBe(true);
    expect(SyncQueueService.pendingCount(A)).toBe(1);
  });

  it("sin cuenta no hay nada pendiente (nunca las ops de otra)", () => {
    SyncQueueService.enqueue("update", "player", "p1", {}, A);
    expect(SyncQueueService.getQueueFor(null)).toEqual([]);
    expect(SyncQueueService.hasPendingFor("player", "p1", undefined)).toBe(false);
    expect(SyncQueueService.pendingCount(null)).toBe(0);
  });

  it("deduplica SOLO dentro de la misma cuenta: la op de A no se mezcla con la de B", () => {
    SyncQueueService.enqueue("update", "player", "p1", { name: "de A" }, A);
    SyncQueueService.enqueue("update", "player", "p1", { name: "de B" }, B);
    SyncQueueService.enqueue("update", "player", "p1", { name: "de A v2" }, A);
    expect(SyncQueueService.getQueueFor(A).map((q) => q.data)).toEqual([{ name: "de A v2" }]);
    expect(SyncQueueService.getQueueFor(B).map((q) => q.data)).toEqual([{ name: "de B" }]);
  });

  it("removeUpsertsFor solo limpia las ops de esa cuenta", () => {
    SyncQueueService.enqueue("update", "player", "p1", {}, A);
    SyncQueueService.enqueue("update", "player", "p1", {}, B);
    SyncQueueService.removeUpsertsFor("player", "p1", B);
    expect(SyncQueueService.hasPendingFor("player", "p1", A)).toBe(true);
    expect(SyncQueueService.hasPendingFor("player", "p1", B)).toBe(false);
  });

  it("dropUnowned descarta solo las ops sin dueño (no atribuibles)", () => {
    SyncQueueService.enqueue("update", "player", "p1", {}, A);
    SyncQueueService.enqueue("update", "player", "p2", {}); // sin dueño (p.ej. cola antigua)
    expect(SyncQueueService.dropUnowned()).toBe(1);
    expect(SyncQueueService.getQueue().map((q) => q.entityId)).toEqual(["p1"]);
  });
});

describe("LocalAccountScope · caché de jugadores de una sola cuenta", () => {
  it("cierre de sesión: fuera la caché y las ops sin dueño; las de A se quedan a su nombre", () => {
    LocalAccountScope.onSignedIn(A);
    PlayerService.create(BASE);
    SyncQueueService.enqueue("update", "player", "pA", { name: "A" }, A);
    SyncQueueService.enqueue("update", "player", "pX", {}); // sin dueño
    LocalAccountScope.onSignedOut();
    expect(PlayerService.getAll()).toEqual([]);
    expect(localStorage.getItem("vitas_players")).toBeNull();
    expect(SyncQueueService.getQueue().map((q) => [q.entityId, q.ownerId])).toEqual([["pA", A]]);
    expect(LocalAccountScope.getOwner()).toBeNull();
  });

  it("entra OTRA cuenta sin SIGNED_OUT previo: la caché de la anterior se borra", () => {
    LocalAccountScope.onSignedIn(A);
    PlayerService.create(BASE);
    LocalAccountScope.onSignedIn(B);
    expect(PlayerService.getAll()).toEqual([]);
    expect(LocalAccountScope.getOwner()).toBe(B);
  });

  it("la misma cuenta (refresco de token) conserva su caché", () => {
    LocalAccountScope.onSignedIn(A);
    PlayerService.create(BASE);
    LocalAccountScope.onSignedIn(A);
    expect(PlayerService.getAll()).toHaveLength(1);
  });
});

describe("escenario dispositivo compartido · A edita sin red, sale; entra B", () => {
  async function aEditsOfflineAndSignsOut() {
    LocalAccountScope.onSignedIn(A);
    const p = PlayerService.create(BASE);
    await SupabasePlayerService.pushOne(A, p); // nube de A: sin fecha
    db.failUpsert = true;
    const r = await SupabasePlayerService.saveProfile(A, p.id, { birthDate: "2015-05-10" });
    expect(r.status).toBe("queued");
    db.failUpsert = false;
    LocalAccountScope.onSignedOut();
    return p;
  }

  it("B no ve el jugador de A, ni su op pendiente, y su pull no lo trae", async () => {
    const p = await aEditsOfflineAndSignsOut();
    LocalAccountScope.onSignedIn(B);
    const pulledB = await SupabasePlayerService.pullAll(B);
    expect(pulledB).toEqual([]);
    expect(PlayerService.getById(p.id)).toBeNull();
    expect(SyncQueueService.hasPendingFor("player", p.id, B)).toBe(false);
    // la op de A sigue a nombre de A (no se pierde en silencio)
    expect(SyncQueueService.hasPendingFor("player", p.id, A)).toBe(true);
  });

  it("un guardado de B no toca la op de A; cuando A vuelve, su edición reaparece desde la cola", async () => {
    const p = await aEditsOfflineAndSignsOut();
    LocalAccountScope.onSignedIn(B);
    await SupabasePlayerService.pullAll(B);
    const own = PlayerService.create({ ...BASE, name: "Jugador De B" });
    expect((await SupabasePlayerService.persistOrQueue(B, own, "create")).status).toBe("synced");
    expect(db.rows.get(own.id)?.user_id).toBe(B);
    expect(db.rows.get(p.id)?.user_id).toBe(A); // la fila de A sigue siendo de A
    LocalAccountScope.onSignedOut();

    LocalAccountScope.onSignedIn(A);
    const pulledA = await SupabasePlayerService.pullAll(A);
    // caché vaciada al salir, pero la copia encolada de A es la más reciente
    expect(pulledA.map((x) => x.id)).toEqual([p.id]);
    expect(pulledA[0].birthDate).toBe("2015-05-10");
    expect(SyncQueueService.hasPendingFor("player", p.id, A)).toBe(true);
  });
});
