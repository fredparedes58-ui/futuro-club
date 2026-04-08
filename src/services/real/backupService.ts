/**
 * VITAS · Backup Service
 *
 * Exporta e importa datos de localStorage como JSON.
 * Valida la estructura al importar para evitar datos corruptos.
 */

import { StorageService } from "./storageService";
import { PlayerSchema } from "./playerService";
import { z } from "zod";

// ── Keys que se exportan/importan ────────────────────────────────────────────

const BACKUP_KEYS = [
  "players",
  "videos",
  "match_events",
  "settings",
  "sync_queue",
  "sync_timestamps",
] as const;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface BackupData {
  version: number;
  exportedAt: string;
  app: "vitas";
  data: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  imported: string[];
  errors: string[];
  playersCount: number;
  videosCount: number;
}

// ── Schema de validación para backup ─────────────────────────────────────────

const BackupSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  app: z.literal("vitas"),
  data: z.record(z.unknown()),
});

// ── Servicio ─────────────────────────────────────────────────────────────────

export const BackupService = {
  /**
   * Exporta todos los datos como JSON string.
   */
  export(): string {
    const data: Record<string, unknown> = {};

    for (const key of BACKUP_KEYS) {
      const value = StorageService.get(key, null);
      if (value !== null) {
        data[key] = value;
      }
    }

    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "vitas",
      data,
    };

    return JSON.stringify(backup, null, 2);
  },

  /**
   * Descarga el backup como archivo JSON.
   */
  downloadBackup(): void {
    const json = this.export();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vitas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Importa datos desde un JSON string.
   * Valida estructura antes de escribir.
   */
  import(jsonString: string): ImportResult {
    const result: ImportResult = {
      success: false,
      imported: [],
      errors: [],
      playersCount: 0,
      videosCount: 0,
    };

    // 1. Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      result.errors.push("JSON inválido — el archivo no tiene formato correcto");
      return result;
    }

    // 2. Validate backup structure
    const validation = BackupSchema.safeParse(parsed);
    if (!validation.success) {
      result.errors.push("Estructura de backup inválida — no es un archivo VITAS válido");
      return result;
    }

    const backup = validation.data;

    // 3. Import each key
    for (const key of BACKUP_KEYS) {
      const value = backup.data[key];
      if (value === undefined) continue;

      try {
        // Special validation for players
        if (key === "players" && Array.isArray(value)) {
          const validPlayers = [];
          for (const p of value) {
            const playerResult = PlayerSchema.safeParse(p);
            if (playerResult.success) {
              validPlayers.push(playerResult.data);
            } else {
              result.errors.push(`Jugador inválido saltado: ${(p as Record<string, unknown>).name ?? "desconocido"}`);
            }
          }
          StorageService.set(key, validPlayers);
          result.playersCount = validPlayers.length;
          result.imported.push(`players (${validPlayers.length})`);
        } else if (key === "videos" && Array.isArray(value)) {
          StorageService.set(key, value);
          result.videosCount = value.length;
          result.imported.push(`videos (${value.length})`);
        } else {
          StorageService.set(key, value);
          result.imported.push(key);
        }
      } catch (err) {
        result.errors.push(`Error importando ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    result.success = result.errors.length === 0 || result.imported.length > 0;
    return result;
  },

  /**
   * Lee un archivo File y retorna su contenido como string.
   */
  async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Error leyendo archivo"));
      reader.readAsText(file);
    });
  },
};
