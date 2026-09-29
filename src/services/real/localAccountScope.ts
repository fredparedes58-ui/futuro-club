/**
 * VITAS · LocalAccountScope — la caché local de jugadores pertenece a UNA cuenta.
 * DETERMINISTA — sin IA.
 *
 * Dispositivo compartido + datos de menores: ni la caché `vitas_players` ni la
 * SyncQueue pueden pasar de una cuenta a la siguiente. Antes signOut no limpiaba
 * ninguna de las dos, y la cola se subía con la sesión que hubiera abierta: el
 * cambio pendiente de una cuenta acababa escrito en otra.
 *
 * Este módulo recuerda qué cuenta llenó la caché y:
 *  - al cerrar sesión (signOut o evento SIGNED_OUT, p.ej. sesión revocada):
 *    borra la caché de jugadores y las ops SIN dueño. Las ops de la cuenta que
 *    sale se CONSERVAN a su nombre (SyncQueueService las guarda con `ownerId`):
 *    se suben cuando esa misma cuenta vuelva a entrar y ninguna otra las ve;
 *  - al entrar una cuenta distinta de la que llenó la caché (la anterior salió
 *    sin SIGNED_OUT): borra la caché antes de que el pull la vuelva a llenar.
 */
import { StorageService } from "./storageService";
import { SyncQueueService } from "./syncQueueService";

const OWNER_KEY = "local_cache_owner";
const PLAYERS_KEY = "players"; // misma clave que PlayerService (STORAGE_KEY)

function clearPlayersCache(): void {
  StorageService.remove(PLAYERS_KEY);
  SyncQueueService.dropUnowned();
}

export const LocalAccountScope = {
  /** Cuenta que llenó la caché local de jugadores (null = ninguna o desconocida). */
  getOwner(): string | null {
    return StorageService.get<string | null>(OWNER_KEY, null);
  },

  /** Hay sesión de `userId`: si la caché era de otra cuenta, se borra. */
  onSignedIn(userId: string): void {
    const owner = this.getOwner();
    if (owner && owner !== userId) clearPlayersCache();
    StorageService.set(OWNER_KEY, userId);
  },

  /** Cierre de sesión: fuera la caché de jugadores; las ops con dueño se quedan a su nombre. */
  onSignedOut(): void {
    clearPlayersCache();
    StorageService.remove(OWNER_KEY);
  },
};
