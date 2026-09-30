/**
 * VITAS · LocalAccountScope — la caché local de jugadores y vídeos pertenece a UNA cuenta.
 * DETERMINISTA — sin IA.
 *
 * Dispositivo compartido + datos de menores: ni las cachés `vitas_players` /
 * `vitas_videos` ni la SyncQueue pueden pasar de una cuenta a la siguiente. Antes
 * signOut no limpiaba ninguna, y la cola se subía con la sesión que hubiera
 * abierta: el cambio pendiente de una cuenta acababa escrito en otra. Los vídeos
 * locales de A (ids de jugadores menores, análisis) se le mostraban a B y
 * `pushAll` de B los subía a su nombre.
 *
 * Este módulo recuerda qué cuenta llenó la caché y:
 *  - al cerrar sesión (signOut o evento SIGNED_OUT, p.ej. sesión revocada):
 *    borra las cachés de jugadores y vídeos y las ops SIN dueño. Las ops de la
 *    cuenta que sale se CONSERVAN a su nombre (SyncQueueService las guarda con
 *    `ownerId`): se suben cuando esa misma cuenta vuelva a entrar y ninguna otra
 *    las ve;
 *  - al entrar una cuenta distinta de la que llenó la caché (la anterior salió
 *    sin SIGNED_OUT): borra la caché antes de que el pull la vuelva a llenar.
 */
import { StorageService } from "./storageService";
import { SyncQueueService } from "./syncQueueService";

const OWNER_KEY = "local_cache_owner";
const PLAYERS_KEY = "players"; // misma clave que PlayerService (STORAGE_KEY)
const VIDEOS_KEY = "videos"; // misma clave que VideoService (STORAGE_KEY)

function clearAccountCache(): void {
  StorageService.remove(PLAYERS_KEY);
  StorageService.remove(VIDEOS_KEY);
  SyncQueueService.dropUnowned();
}

export const LocalAccountScope = {
  /** Cuenta que llenó la caché local (null = ninguna o desconocida). */
  getOwner(): string | null {
    return StorageService.get<string | null>(OWNER_KEY, null);
  },

  /** Hay sesión de `userId`: si la caché era de otra cuenta, se borra. */
  onSignedIn(userId: string): void {
    const owner = this.getOwner();
    if (owner && owner !== userId) clearAccountCache();
    StorageService.set(OWNER_KEY, userId);
  },

  /** Cierre de sesión: fuera las cachés de jugadores y vídeos; las ops con dueño se quedan a su nombre. */
  onSignedOut(): void {
    clearAccountCache();
    StorageService.remove(OWNER_KEY);
  },
};
