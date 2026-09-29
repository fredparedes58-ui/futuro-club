/**
 * SupabasePlayerService — fecha de nacimiento del jugador → players.birth_date
 * y guardado HONESTO (el fallo de la nube se ve y se encola; pull no pisa).
 *
 * Contrato:
 *  - todos los escritores (playerToColumns → pushOne/pushAll) envían birth_date
 *    (ISO o null), la columna que lee el control RGPD de consentimiento (036);
 *  - pushOne LANZA si la nube falla (antes se lo tragaba) ⇒ los catch con
 *    SyncQueue.enqueue de create/updateMetrics se ejecutan de verdad;
 *  - persistOrQueue/saveProfile devuelven el estado real (synced/queued/local_only/not_found);
 *  - pullAll NO pisa un jugador con cambios locales pendientes de sincronizar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase en memoria (tabla players) ──────────────────────────────────────
const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  upserts: [] as Array<Record<string, unknown> | Array<Record<string, unknown>>>,
  failUpsert: false,
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    from: (_table: string) => ({
      upsert: async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        db.upserts.push(payload);
        if (db.failUpsert) return { error: { message: "network down" } };
        for (const r of Array.isArray(payload) ? payload : [payload]) {
          db.rows.set(r.id as string, { ...(db.rows.get(r.id as string) ?? {}), ...r });
        }
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

import { SupabasePlayerService, playerToColumns } from "@/services/real/supabasePlayerService";
import { PlayerService, type Player, type CreatePlayerInput } from "@/services/real/playerService";
import { SyncQueueService } from "@/services/real/syncQueueService";

const USER = "user-1";
const BASE: CreatePlayerInput = {
  name: "Samu Prueba",
  age: 11,
  position: "ST",
  foot: "right",
  height: 142,
  weight: 36,
  competitiveLevel: "Regional",
  minutesPlayed: 0,
  gender: "M",
};

function lastUpsertRow(): Record<string, unknown> {
  const last = db.upserts[db.upserts.length - 1];
  if (!last) throw new Error("no upsert");
  return Array.isArray(last) ? last[0] : last;
}

beforeEach(() => {
  localStorage.clear();
  db.rows.clear();
  db.upserts.length = 0;
  db.failUpsert = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("playerToColumns · birth_date", () => {
  const p = { ...BASE, id: "p1", vsi: null, vsiHistory: [], createdAt: "x", updatedAt: "x" } as Player;

  it("proyecta la fecha del jugador (YYYY-MM-DD) a birth_date", () => {
    expect(playerToColumns({ ...p, birthDate: "2015-05-10" }).birth_date).toBe("2015-05-10");
  });

  it("sin fecha ⇒ birth_date null (nunca una fecha inventada)", () => {
    expect(playerToColumns(p)).toHaveProperty("birth_date", null);
  });

  it("fecha no válida (futura / imposible) ⇒ null", () => {
    expect(playerToColumns({ ...p, birthDate: "2999-01-01" }).birth_date).toBeNull();
    expect(playerToColumns({ ...p, birthDate: "2014-02-30" }).birth_date).toBeNull();
  });
});

describe("escritores → birth_date", () => {
  it("pushOne envía birth_date junto al blob", async () => {
    const created = PlayerService.create({ ...BASE, birthDate: "2015-05-10" });
    await SupabasePlayerService.pushOne(USER, created);
    const row = lastUpsertRow();
    expect(row.birth_date).toBe("2015-05-10");
    expect((row.data as Player).birthDate).toBe("2015-05-10");
  });

  it("LocalStorageMigrationService (subida inicial) envía birth_date", async () => {
    const { LocalStorageMigrationService } = await import("@/services/real/localStorageMigrationService");
    PlayerService.create({ ...BASE, birthDate: "2015-05-10" });
    await LocalStorageMigrationService.run(USER);
    const rows = db.upserts[0] as Array<Record<string, unknown>>;
    expect(rows[0].birth_date).toBe("2015-05-10");
  });

  it("pushAll envía birth_date en cada fila", async () => {
    PlayerService.create({ ...BASE, birthDate: "2015-05-10" });
    PlayerService.create({ ...BASE, name: "Sin Fecha" });
    await SupabasePlayerService.pushAll(USER);
    const rows = db.upserts[db.upserts.length - 1] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.birth_date).sort()).toEqual(["2015-05-10", null].sort());
  });
});

describe("pushOne ya no se traga el error", () => {
  it("lanza si el upsert falla", async () => {
    db.failUpsert = true;
    const created = PlayerService.create(BASE);
    await expect(SupabasePlayerService.pushOne(USER, created)).rejects.toThrow(/network down/);
  });

  it("create() encola en SyncQueue cuando la nube falla (antes nunca llegaba al catch)", async () => {
    db.failUpsert = true;
    const player = await SupabasePlayerService.create(USER, BASE);
    expect(SyncQueueService.hasPendingFor("player", player.id)).toBe(true);
  });

  it("updateMetrics() encola en SyncQueue cuando la nube falla", async () => {
    const created = PlayerService.create(BASE);
    db.failUpsert = true;
    await SupabasePlayerService.updateMetrics(USER, created.id, {
      speed: 70, technique: 70, vision: 70, stamina: 70, shooting: 70, defending: 70,
    });
    expect(SyncQueueService.hasPendingFor("player", created.id)).toBe(true);
  });
});

describe("persistOrQueue / saveProfile · estado real", () => {
  it("synced: nube OK ⇒ fila con birth_date y nada en cola", async () => {
    const created = PlayerService.create(BASE);
    const r = await SupabasePlayerService.saveProfile(USER, created.id, { birthDate: "2015-05-10" });
    expect(r.status).toBe("synced");
    expect(db.rows.get(created.id)?.birth_date).toBe("2015-05-10");
    expect(SyncQueueService.hasPendingFor("player", created.id)).toBe(false);
  });

  it("queued: nube falla ⇒ guardado en local + pendiente de sincronizar (no «guardado»)", async () => {
    const created = PlayerService.create(BASE);
    db.failUpsert = true;
    const r = await SupabasePlayerService.saveProfile(USER, created.id, { birthDate: "2015-05-10" });
    expect(r.status).toBe("queued");
    expect(PlayerService.getById(created.id)?.birthDate).toBe("2015-05-10");
    expect(SyncQueueService.hasPendingFor("player", created.id)).toBe(true);
    expect(db.rows.has(created.id)).toBe(false);
  });

  it("not_found: el jugador no está en la caché local ⇒ no se guarda nada ni se sube", async () => {
    const r = await SupabasePlayerService.saveProfile(USER, "no-existe", { birthDate: "2015-05-10" });
    expect(r).toEqual({ status: "not_found", player: null });
    expect(db.upserts).toHaveLength(0);
  });

  it("sin sesión con nube configurada ⇒ queued (el cambio NO está en la nube)", async () => {
    const created = PlayerService.create(BASE);
    const r = await SupabasePlayerService.persistOrQueue(null, created);
    expect(r.status).toBe("queued");
    expect(db.upserts).toHaveLength(0);
  });

  it("un push correcto posterior limpia la op vieja de la cola (no re-sube datos viejos)", async () => {
    const created = PlayerService.create(BASE);
    db.failUpsert = true;
    await SupabasePlayerService.saveProfile(USER, created.id, { birthDate: "2015-05-10" });
    expect(SyncQueueService.hasPendingFor("player", created.id)).toBe(true);
    db.failUpsert = false;
    const r = await SupabasePlayerService.saveProfile(USER, created.id, { birthDate: "2015-05-11" });
    expect(r.status).toBe("synced");
    expect(SyncQueueService.hasPendingFor("player", created.id)).toBe(false);
    expect(db.rows.get(created.id)?.birth_date).toBe("2015-05-11");
  });
});

describe("pullAll no pisa ediciones locales sin sincronizar", () => {
  it("jugador con op pendiente: se conserva la copia local (fecha incluida)", async () => {
    const created = PlayerService.create(BASE);
    await SupabasePlayerService.pushOne(USER, created); // nube: SIN fecha
    db.failUpsert = true;
    await SupabasePlayerService.saveProfile(USER, created.id, { birthDate: "2015-05-10" }); // queued
    db.failUpsert = false;

    const pulled = await SupabasePlayerService.pullAll(USER);
    expect(pulled.find((p) => p.id === created.id)?.birthDate).toBe("2015-05-10");
    expect(PlayerService.getById(created.id)?.birthDate).toBe("2015-05-10");
  });

  it("jugador SIN op pendiente: la nube sigue siendo autoritativa", async () => {
    const created = PlayerService.create(BASE);
    await SupabasePlayerService.pushOne(USER, { ...created, name: "Nombre Nube" });
    // edición local sin cola (p.ej. otra pestaña) → la nube manda
    await PlayerService.update(created.id, { birthDate: "2015-05-10" });
    const pulled = await SupabasePlayerService.pullAll(USER);
    const p = pulled.find((x) => x.id === created.id);
    expect(p?.name).toBe("Nombre Nube");
    expect(p?.birthDate).toBeUndefined();
  });

  it("borrado local pendiente: la nube no lo resucita", async () => {
    const created = PlayerService.create(BASE);
    await SupabasePlayerService.pushOne(USER, created);
    PlayerService.delete(created.id);
    SyncQueueService.enqueue("delete", "player", created.id, null);
    const pulled = await SupabasePlayerService.pullAll(USER);
    expect(pulled.some((p) => p.id === created.id)).toBe(false);
  });

  it("alta local pendiente que aún no está en la nube: se mantiene", async () => {
    const other = PlayerService.create({ ...BASE, name: "En La Nube" });
    await SupabasePlayerService.pushOne(USER, other);
    db.failUpsert = true;
    const local = await SupabasePlayerService.create(USER, { ...BASE, name: "Solo Local" });
    db.failUpsert = false;
    const pulled = await SupabasePlayerService.pullAll(USER);
    expect(pulled.map((p) => p.name).sort()).toEqual(["En La Nube", "Solo Local"]);
    expect(pulled.find((p) => p.id === local.id)).toBeTruthy();
  });
});
