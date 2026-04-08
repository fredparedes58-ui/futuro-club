/**
 * VITAS · Health Check Service
 *
 * Diagnóstico automático al iniciar la app.
 * Verifica: localStorage funcional, datos no corruptos, schema actualizado,
 * cuota de almacenamiento, y conectividad básica.
 */

import { SchemaMigrationService } from "./schemaMigration";
import { StorageService } from "./storageService";
import { SyncQueueService } from "./syncQueueService";

export interface HealthCheckResult {
  healthy: boolean;
  checks: HealthCheckItem[];
  timestamp: string;
}

export interface HealthCheckItem {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export const HealthCheckService = {
  /**
   * Ejecuta todas las verificaciones de salud.
   * Retorna resultado con detalle por check.
   */
  run(): HealthCheckResult {
    const checks: HealthCheckItem[] = [];

    // 1. localStorage escribible
    checks.push(this.checkStorageWritable());

    // 2. Integridad de datos
    checks.push(this.checkDataIntegrity());

    // 3. Schema versioning
    checks.push(this.checkSchemaVersion());

    // 4. Cuota de almacenamiento
    checks.push(this.checkStorageQuota());

    // 5. Cola de sync
    checks.push(this.checkSyncQueue());

    const healthy = checks.every(c => c.status !== "error");

    return {
      healthy,
      checks,
      timestamp: new Date().toISOString(),
    };
  },

  checkStorageWritable(): HealthCheckItem {
    const writable = SchemaMigrationService.isStorageWritable();
    return {
      name: "localStorage",
      status: writable ? "ok" : "error",
      message: writable ? "Almacenamiento funcional" : "localStorage no disponible o cuota llena",
    };
  },

  checkDataIntegrity(): HealthCheckItem {
    const { valid, corruptedKeys } = SchemaMigrationService.validateDataIntegrity();
    if (valid) {
      return { name: "Integridad de datos", status: "ok", message: "Datos consistentes" };
    }
    // Auto-repair: remove corrupted keys
    for (const key of corruptedKeys) {
      console.warn(`[HealthCheck] Removing corrupted key: ${key}`);
      StorageService.remove(key);
    }
    return {
      name: "Integridad de datos",
      status: "warning",
      message: `Datos corruptos reparados: ${corruptedKeys.join(", ")}`,
    };
  },

  checkSchemaVersion(): HealthCheckItem {
    try {
      const result = SchemaMigrationService.migrateIfNeeded();
      if (result.errors.length > 0) {
        return {
          name: "Schema",
          status: "error",
          message: `Migración falló: ${result.errors[0]}`,
        };
      }
      if (result.migrated && result.stepsApplied.length > 0) {
        return {
          name: "Schema",
          status: "ok",
          message: `Migrado: ${result.stepsApplied.join(", ")}`,
        };
      }
      return { name: "Schema", status: "ok", message: `v${SchemaMigrationService.CURRENT_VERSION}` };
    } catch (err) {
      return {
        name: "Schema",
        status: "error",
        message: `Error de migración: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },

  checkStorageQuota(): HealthCheckItem {
    const quota = SchemaMigrationService.checkStorageQuota();
    if (quota.critical) {
      return {
        name: "Cuota de almacenamiento",
        status: "error",
        message: `Almacenamiento al ${quota.usagePercent}% (${quota.usedMB}MB / ~${quota.estimatedMaxMB}MB)`,
      };
    }
    if (quota.warning) {
      return {
        name: "Cuota de almacenamiento",
        status: "warning",
        message: `Almacenamiento al ${quota.usagePercent}% (${quota.usedMB}MB)`,
      };
    }
    return {
      name: "Cuota de almacenamiento",
      status: "ok",
      message: `${quota.usedMB}MB usado`,
    };
  },

  checkSyncQueue(): HealthCheckItem {
    const pending = SyncQueueService.pendingCount();
    if (pending > 20) {
      return {
        name: "Cola de sincronización",
        status: "warning",
        message: `${pending} operaciones pendientes — posible problema de conexión`,
      };
    }
    if (pending > 0) {
      return {
        name: "Cola de sincronización",
        status: "ok",
        message: `${pending} operaciones pendientes`,
      };
    }
    return { name: "Cola de sincronización", status: "ok", message: "Sin pendientes" };
  },
};
