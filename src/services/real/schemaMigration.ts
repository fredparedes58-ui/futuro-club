/**
 * VITAS · Schema Migration Service
 *
 * Gestiona versiones del schema de localStorage para migraciones seguras.
 * Cuando el schema de Player, Video, etc. cambia entre versiones,
 * este servicio detecta la versión vieja y aplica transforms automáticos.
 *
 * También verifica la cuota de localStorage para prevenir crashes silenciosos.
 */

import { StorageService } from "./storageService";

// ── Versión actual del schema ────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1;
const VERSION_KEY = "schema_version";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: () => void;
}

export interface MigrationResult {
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  stepsApplied: string[];
  errors: string[];
}

export interface StorageQuotaInfo {
  usedBytes: number;
  usedMB: string;
  estimatedMaxMB: number;
  usagePercent: number;
  warning: boolean;
  critical: boolean;
}

// ── Migrations Registry ─────────────────────────────────────────────────────
// Agregar nuevas migraciones aquí cuando el schema cambie.
// Cada migración describe cómo transformar datos de versión N a N+1.

const MIGRATIONS: MigrationStep[] = [
  // Ejemplo para futuro:
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   description: "Agregar campo teamId a players",
  //   migrate: () => {
  //     const players = StorageService.get<unknown[]>("players", []);
  //     const migrated = players.map((p: any) => ({ ...p, teamId: null }));
  //     StorageService.set("players", migrated);
  //   },
  // },
];

// ── Servicio principal ──────────────────────────────────────────────────────

export const SchemaMigrationService = {
  /**
   * Obtiene la versión actual del schema en localStorage.
   * Retorna 0 si no hay versión (instalación nueva o pre-versionado).
   */
  getCurrentVersion(): number {
    return StorageService.get<number>(VERSION_KEY, 0);
  },

  /**
   * Ejecuta todas las migraciones necesarias para llegar a CURRENT_SCHEMA_VERSION.
   * Es idempotente: si ya está en la versión correcta, no hace nada.
   */
  migrateIfNeeded(): MigrationResult {
    const fromVersion = this.getCurrentVersion();
    const result: MigrationResult = {
      migrated: false,
      fromVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      stepsApplied: [],
      errors: [],
    };

    if (fromVersion >= CURRENT_SCHEMA_VERSION) {
      return result; // Ya actualizado
    }

    // Si es versión 0 (primera vez o pre-versionado), solo marcar versión
    if (fromVersion === 0 && MIGRATIONS.length === 0) {
      StorageService.set(VERSION_KEY, CURRENT_SCHEMA_VERSION);
      result.migrated = true;
      result.stepsApplied.push("Initialized schema version");
      return result;
    }

    // Aplicar migraciones secuencialmente
    const pendingMigrations = MIGRATIONS
      .filter(m => m.fromVersion >= fromVersion && m.toVersion <= CURRENT_SCHEMA_VERSION)
      .sort((a, b) => a.fromVersion - b.fromVersion);

    for (const migration of pendingMigrations) {
      try {
        console.info(`[SchemaMigration] Applying: ${migration.description} (v${migration.fromVersion} → v${migration.toVersion})`);
        migration.migrate();
        result.stepsApplied.push(migration.description);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SchemaMigration] Failed: ${migration.description}`, err);
        result.errors.push(`${migration.description}: ${msg}`);
        // No continuar si una migración falla
        break;
      }
    }

    // Solo actualizar versión si no hubo errores
    if (result.errors.length === 0) {
      StorageService.set(VERSION_KEY, CURRENT_SCHEMA_VERSION);
      result.migrated = true;
    }

    return result;
  },

  /**
   * Verifica la cuota de localStorage y retorna estado de uso.
   * localStorage típicamente tiene ~5-10MB de límite.
   */
  checkStorageQuota(): StorageQuotaInfo {
    let usedBytes = 0;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key) ?? "";
          usedBytes += key.length + value.length;
        }
      }
    } catch {
      // Si no podemos leer, asumir uso alto
      return {
        usedBytes: 0,
        usedMB: "?",
        estimatedMaxMB: 5,
        usagePercent: 0,
        warning: false,
        critical: false,
      };
    }

    // localStorage guarda UTF-16, cada char = 2 bytes
    const realBytes = usedBytes * 2;
    const usedMB = (realBytes / (1024 * 1024)).toFixed(2);
    const estimatedMaxMB = 5; // Límite típico de localStorage
    const usagePercent = Math.round((realBytes / (estimatedMaxMB * 1024 * 1024)) * 100);

    return {
      usedBytes: realBytes,
      usedMB,
      estimatedMaxMB,
      usagePercent,
      warning: usagePercent > 70,
      critical: usagePercent > 90,
    };
  },

  /**
   * Intenta escribir un byte de prueba para verificar que localStorage funciona.
   * Retorna false si la cuota está llena o localStorage no está disponible.
   */
  isStorageWritable(): boolean {
    const testKey = "vitas__write_test";
    try {
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Valida integridad básica de datos en localStorage.
   * Verifica que las keys críticas contienen JSON válido.
   */
  validateDataIntegrity(): { valid: boolean; corruptedKeys: string[] } {
    const criticalKeys = ["players", "videos", "sync_queue", "sync_timestamps"];
    const corruptedKeys: string[] = [];

    for (const key of criticalKeys) {
      const raw = localStorage.getItem(`vitas_${key}`);
      if (raw === null) continue; // Key no existe = ok

      try {
        JSON.parse(raw);
      } catch {
        corruptedKeys.push(key);
      }
    }

    return {
      valid: corruptedKeys.length === 0,
      corruptedKeys,
    };
  },

  /** Versión actual del schema (constante) */
  CURRENT_VERSION: CURRENT_SCHEMA_VERSION,
};
