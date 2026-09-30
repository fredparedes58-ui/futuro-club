/**
 * Vídeos locales POR CUENTA — dispositivo compartido, datos de menores.
 *
 * Antes `SupabaseVideoService.pullAll` decidía si conservar la caché `vitas_videos`
 * con un recuento de la cola del dispositivo ENTERO. Con la cola de jugadores ya
 * viva, la op pendiente de la cuenta A hacía que la nube vacía de B conservara (y
 * mostrara) los vídeos locales de A, y el `pushAll` de B al reconectar los subía
 * con user_id = B. La caché de vídeos tampoco se borraba al cerrar sesión.
 *
 * Contrato:
 *  - el pull solo protege los vídeos con ops pendientes DE ESTA cuenta;
 *  - cerrar sesión (o entrar otra cuenta) borra `vitas_videos` como `vitas_players`;
 *  - no hay recuento de pendientes «del dispositivo»: el diagnóstico cuenta las de
 *    la cuenta de la sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  players: new Map<string, Record<string, unknown>>(),
  videos: new Map<string, Record<string, unknown>>(),
  failPlayerUpsert: false,
  failVideoPull: false,
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    from: (table: string) => {
      const rows = table === "players" ? db.players : db.videos;
      return {
        upsert: async (payload: Row | Row[]) => {
          if (table === "players" && db.failPlayerUpsert) return { error: { message: "network down" } };
          for (const r of Array.isArray(payload) ? payload : [payload]) rows.set(r.id as string, r);
          return { error: null };
        },
        select: () => ({
          eq: (_col: string, userId: string) => ({
            order: async () => {
              if (table === "videos" && db.failVideoPull) throw new Error("offline");
              return {
                data: [...rows.values()]
                  .filter((r) => r.user_id === userId)
                  .map((r) => ({ id: r.id, data: r.data })),
                error: null,
              };
            },
          }),
        }),
      };
    },
  },
}));
vi.mock("@/services/real/organizationService", () => ({ OrganizationService: { getOrgId: () => null } }));
vi.mock("@/services/real/agentService", () => ({ AgentService: { invalidateCacheForPlayer: vi.fn() } }));

import { SyncQueueService } from "@/services/real/syncQueueService";
import { LocalAccountScope } from "@/services/real/localAccountScope";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";
import { PlayerService, type CreatePlayerInput } from "@/services/real/playerService";
import { VideoService, type VideoRecord } from "@/services/real/videoService";
import { HealthCheckService } from "@/services/real/healthCheck";

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

function video(id: string, playerId: string | null): VideoRecord {
  return {
    id,
    title: `Vídeo ${id}`,
    playerId,
    status: "finished",
    statusCode: 4,
    encodeProgress: 100,
    duration: 0,
    width: 0,
    height: 0,
    fps: null,
    storageSize: 0,
    thumbnailUrl: null,
    embedUrl: "",
    streamUrl: null,
    dateUploaded: "2026-09-28T00:00:00Z",
    analysisResult: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  db.players.clear();
  db.videos.clear();
  db.failPlayerUpsert = false;
  db.failVideoPull = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** A tiene un vídeo local de su menor y edita al jugador sin red: op a nombre de A. */
async function aHasLocalVideoAndQueuedPlayerOp() {
  LocalAccountScope.onSignedIn(A);
  const p = PlayerService.create(BASE);
  VideoService.save(video("vA", p.id));
  db.failPlayerUpsert = true;
  const r = await SupabasePlayerService.persistOrQueue(A, p, "update");
  expect(r.status).toBe("queued");
  db.failPlayerUpsert = false;
  expect(SyncQueueService.pendingCount(A)).toBe(1);
  return p;
}

describe("SupabaseVideoService.pullAll · solo las ops de ESTA cuenta protegen la caché", () => {
  it("A tiene una op en cola ⇒ la nube vacía de B da [] y vacía la caché (aunque la caché de A siguiera ahí)", async () => {
    await aHasLocalVideoAndQueuedPlayerOp();
    // Sin LocalAccountScope (p.ej. caché anterior a este cambio): el pull por sí solo no filtra.
    const pulled = await SupabaseVideoService.pullAll(B);
    expect(pulled).toEqual([]);
    expect(VideoService.getAll()).toEqual([]);
    // …y el pushAll de B al reconectar no tiene nada de A que subir a su nombre.
    await SupabaseVideoService.pushAll(B);
    expect([...db.videos.values()].filter((r) => r.user_id === B)).toEqual([]);
  });

  it("una op de vídeo de A tampoco conserva su vídeo en el pull de B (nube vacía o no)", async () => {
    VideoService.save(video("vA", null));
    SyncQueueService.enqueue("update", "video", "vA", video("vA", null), A);
    expect(await SupabaseVideoService.pullAll(B)).toEqual([]);

    VideoService.save(video("vA", null));
    db.videos.set("vB1", { id: "vB1", user_id: B, data: video("vB1", null) });
    const pulled = await SupabaseVideoService.pullAll(B);
    expect(pulled.map((v) => v.id)).toEqual(["vB1"]);
  });

  it("los vídeos locales pendientes de B sí se conservan (nube vacía y nube con filas)", async () => {
    VideoService.save(video("vB2", null));
    VideoService.save(video("vSinOp", null));
    SyncQueueService.enqueue("update", "video", "vB2", video("vB2", null), B);
    expect((await SupabaseVideoService.pullAll(B)).map((v) => v.id)).toEqual(["vB2"]);

    db.videos.set("vB1", { id: "vB1", user_id: B, data: video("vB1", null) });
    expect((await SupabaseVideoService.pullAll(B)).map((v) => v.id).sort()).toEqual(["vB1", "vB2"]);
  });
});

describe("LocalAccountScope · la caché de vídeos es de una sola cuenta", () => {
  it("cerrar sesión borra vitas_videos; la op de A se queda a su nombre", async () => {
    await aHasLocalVideoAndQueuedPlayerOp();
    LocalAccountScope.onSignedOut();
    expect(localStorage.getItem("vitas_videos")).toBeNull();
    expect(SyncQueueService.pendingCount(A)).toBe(1);
  });

  it("entra B sin SIGNED_OUT previo: la caché de vídeos de A se borra", async () => {
    await aHasLocalVideoAndQueuedPlayerOp();
    LocalAccountScope.onSignedIn(B);
    expect(VideoService.getAll()).toEqual([]);
  });

  it("la misma cuenta (refresco de token) conserva sus vídeos", () => {
    LocalAccountScope.onSignedIn(A);
    VideoService.save(video("vA", null));
    LocalAccountScope.onSignedIn(A);
    expect(VideoService.getAll().map((v) => v.id)).toEqual(["vA"]);
  });

  it("B sin red tras la salida de A: el pull falla y cae a una caché vacía, no a la de A", async () => {
    await aHasLocalVideoAndQueuedPlayerOp();
    LocalAccountScope.onSignedOut();
    LocalAccountScope.onSignedIn(B);
    db.failVideoPull = true;
    expect(await SupabaseVideoService.pullAll(B)).toEqual([]);
    await SupabaseVideoService.pushAll(B);
    expect(db.videos.size).toBe(0);
  });
});

describe("pendientes · sin recuento del dispositivo", () => {
  it("el diagnóstico de la cola solo cuenta las ops de la cuenta de la sesión", async () => {
    await aHasLocalVideoAndQueuedPlayerOp();
    LocalAccountScope.onSignedOut();
    LocalAccountScope.onSignedIn(B);
    expect(SyncQueueService.pendingCount(B)).toBe(0);
    expect(SyncQueueService.hasPending(B)).toBe(false);
    expect(SyncQueueService.getStatus(B).pending).toBe(0);
    expect(HealthCheckService.checkSyncQueue().message).toBe("Sin pendientes");

    SyncQueueService.enqueue("update", "player", "pB", {}, B);
    expect(HealthCheckService.checkSyncQueue().message).toBe("1 operaciones pendientes");
  });
});
