/**
 * Migración 069 — backfill del PHV persistido (players + player_metric_snapshots).
 *
 * No hay Postgres en CI: se fija el CONTRATO del SQL de forma estática.
 *  - RE-EJECUTABLE: el criterio es «no respaldado por una fila FIABLE de
 *    player_anthropometrics» (misma regla que trustAnthropometricsRow), no «aún sin
 *    archivar» (`phv_legacy IS NULL`). Con ese guard, si 069 se aplicaba antes del
 *    despliegue y el CRUD antiguo re-escribía players.phv_category desde el blob
 *    (service_role atraviesa el trigger), re-ejecutar 069 se saltaba esas filas.
 *  - phv_legacy nunca se pisa: la 1.ª copia se conserva, las siguientes se añaden.
 *  - no borra filas (inv #8) y el orden del operador es «desplegar, luego 069».
 */
import { describe, it, expect } from "vitest";

const FILE = "/supabase/migrations/069_phv_gate_all_surfaces.sql";
const migrations069 = import.meta.glob("/supabase/migrations/069_*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const sql = migrations069[FILE] ?? "";
// Sin comentarios SQL, para que las aserciones no choquen con la prosa.
const code = sql
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/** Sentencia UPDATE (hasta el `;`) sobre la tabla dada. */
function updateOf(table: string): string {
  const m = code.match(new RegExp(`UPDATE public\\.${table}\\b[\\s\\S]*?;`));
  return m?.[0] ?? "";
}

describe("069 · backfill del PHV persistido", () => {
  it("es la única migración 069 y es transaccional", () => {
    expect(Object.keys(migrations069)).toEqual([FILE]);
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code.trim().endsWith("COMMIT;")).toBe(true);
  });

  it.each([
    ["players", "player_latest_anthropometrics"],
    ["player_metric_snapshots", "player_anthropometrics"],
  ])("%s: re-ejecutable — anula solo lo NO respaldado por una fila fiable", (table, source) => {
    const upd = updateOf(table);
    expect(upd).not.toBe("");
    // Sin el guard «aún sin archivar» que hacía que una re-ejecución se saltara
    // las filas re-contaminadas.
    expect(upd).not.toMatch(/phv_legacy\s+IS\s+NULL\s*;/i);
    expect(upd).not.toMatch(/AND\s+\w*\.?phv_legacy\s+IS\s+NULL/i);
    expect(upd).toMatch(new RegExp(`NOT EXISTS\\s*\\(\\s*SELECT 1\\s+FROM public\\.${source} a`));
    // Misma regla que trustAnthropometricsRow (src/lib/phv/phvGate.ts).
    for (const cond of [
      /a\.age_source = 'birth_date'/,
      /a\.height_cm IS NOT NULL/,
      /a\.weight_kg IS NOT NULL/,
      /a\.sitting_height_cm IS NOT NULL/,
      /a\.leg_length_cm IS NOT NULL OR a\.height_cm > a\.sitting_height_cm/,
      /a\.maturity_offset IS NOT NULL/,
      /a\.phv_category IS NOT NULL/,
    ]) {
      expect(upd).toMatch(cond);
    }
    // phv_legacy se conserva y se amplía (no se pisa la 1.ª copia).
    expect(upd).toMatch(/WHEN \w\.phv_legacy IS NULL THEN jsonb_build_object\(/);
    expect(upd).toMatch(/phv_legacy \|\| jsonb_build_object\(\s*'rearchived'/);
    expect(upd).toMatch(/phv_category = NULL/);
    expect(upd).toMatch(/phv_offset\s+= NULL/);
  });

  it("no borra filas (inv #8)", () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("documenta el orden del operador: desplegar primero, luego 069", () => {
    expect(sql).toMatch(/primero desplegar el código de este PR, DESPUÉS aplicar/);
  });
});
