/**
 * Migración 071 — backfill de players.birth_date desde data->>'birthDate'.
 *
 * No hay Postgres en CI: se fija el CONTRATO del SQL de forma estática.
 *  - misma regla que toIsoBirthDate (regex, cota 1900, estrictamente antes de hoy);
 *  - solo rellena NULL (no sobrescribe), no inventa (fecha no válida ⇒ NULL);
 *  - NO toca la lógica de consentimiento de 036 (función, trigger, vista, estado);
 *  - el trigger de sync blob→columnas se desactiva SOLO durante el backfill y se
 *    reactiva (no fabricar metric_* = 0), dentro de una transacción;
 *  - no toca el blob `data` ni PHV (invariante #4).
 */
import { describe, it, expect } from "vitest";
import helperSrc from "@/lib/shared/birthDate.ts?raw";
import { BIRTH_DATE_MIN_ISO } from "@/lib/shared/birthDate";

const FILE = "/supabase/migrations/071_players_birth_date_backfill.sql";
const migrations071 = import.meta.glob("/supabase/migrations/071_*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const sql = migrations071[FILE] ?? "";
// Sin comentarios SQL, para que las aserciones negativas no choquen con la prosa.
const code = sql
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("071 · backfill birth_date", () => {
  it("es la única migración 071", () => {
    expect(Object.keys(migrations071)).toEqual([FILE]);
    expect(sql.length).toBeGreaterThan(0);
  });

  it("transaccional y con el parser temporal eliminado al final", () => {
    expect(code).toMatch(/^\s*BEGIN;/m);
    expect(code.trim().endsWith("COMMIT;")).toBe(true);
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\._vitas_071_iso_birth_date\(p_raw text\)/);
    expect(code).toMatch(/DROP FUNCTION IF EXISTS public\._vitas_071_iso_birth_date\(text\);/);
  });

  it("misma regla que toIsoBirthDate: regex exacta, cota 1900 y estrictamente anterior a hoy", () => {
    const tsRegex = /const ISO_DATE_RE = \/\^\(\[0-9\]\{4\}\)-\(\[0-9\]\{2\}\)-\(\[0-9\]\{2\}\)\$\//;
    expect(helperSrc).toMatch(tsRegex);
    expect(code).toContain("p_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(code).toContain(`d < DATE '${BIRTH_DATE_MIN_ISO}' OR d >= CURRENT_DATE`);
    // fecha imposible ⇒ NULL (excepción de to_date capturada) + ida y vuelta exacta
    expect(code).toMatch(/EXCEPTION WHEN others THEN\s+RETURN NULL;/);
    expect(code).toContain("to_char(d, 'YYYY-MM-DD') <> p_raw");
    // sin recortar espacios en ninguno de los dos lados
    expect(code).not.toMatch(/btrim|trim\(/i);
    expect(helperSrc).not.toMatch(/raw\.trim\(\)/);
  });

  it("solo rellena filas con birth_date NULL y con fecha válida en el blob", () => {
    const update = code.match(/UPDATE public\.players[\s\S]*?;/g) ?? [];
    expect(update).toHaveLength(1);
    expect(update[0]).toMatch(/SET birth_date = public\._vitas_071_iso_birth_date\(data->>'birthDate'\)/);
    expect(update[0]).toMatch(/WHERE birth_date IS NULL/);
    expect(update[0]).toMatch(/_vitas_071_iso_birth_date\(data->>'birthDate'\) IS NOT NULL/);
  });

  it("no toca la lógica de consentimiento de 036 ni el estado a mano", () => {
    expect(code).not.toMatch(/check_parental_consent/);
    expect(code).not.toMatch(/is_minor_requiring_consent/);
    expect(code).not.toMatch(/trg_check_parental_consent/);
    expect(code).not.toMatch(/v_players_ai_blocked/);
    expect(code).not.toMatch(/SET\s+parental_consent_status/i);
    expect(code).not.toMatch(/parental_consent_status\s*:?=/i);
    expect(code).not.toMatch(/session_replication_role/i); // desactivaría TODOS los triggers
  });

  it("desactiva solo trg_sync_player_columns y players_updated_at durante el backfill y los reactiva", () => {
    const disables = code.match(/DISABLE TRIGGER (\w+)/g) ?? [];
    const enables = code.match(/ENABLE TRIGGER (\w+)/g) ?? [];
    expect(disables).toEqual([
      "DISABLE TRIGGER trg_sync_player_columns",
      "DISABLE TRIGGER players_updated_at",
    ]);
    expect(enables).toEqual([
      "ENABLE TRIGGER trg_sync_player_columns",
      "ENABLE TRIGGER players_updated_at",
    ]);
    const iUpdate = code.indexOf("UPDATE public.players");
    for (const trigger of ["trg_sync_player_columns", "players_updated_at"]) {
      expect(code.indexOf(`DISABLE TRIGGER ${trigger}`)).toBeLessThan(iUpdate);
      expect(code.indexOf(`ENABLE TRIGGER ${trigger}`)).toBeGreaterThan(iUpdate);
    }
    // todo dentro de la misma transacción
    expect(code.indexOf("BEGIN;")).toBeLessThan(code.indexOf("DISABLE TRIGGER"));
    expect(code.lastIndexOf("ENABLE TRIGGER")).toBeLessThan(code.lastIndexOf("COMMIT;"));
  });

  it("el backfill no toca updated_at (el inactivity cron y el orden por updated_at no cambian)", () => {
    const update = (code.match(/UPDATE public\.players[\s\S]*?;/g) ?? [])[0] ?? "";
    expect(update).not.toMatch(/updated_at/);
  });

  it("requiere 036: aborta ANTES de tocar nada si faltan sus columnas (no las crea a medias)", () => {
    expect(code).not.toMatch(/ADD COLUMN/i);
    const iGuard = code.indexOf("RAISE EXCEPTION");
    expect(iGuard).toBeGreaterThan(-1);
    expect(code).toMatch(/column_name IN \('birth_date', 'parental_consent_status'\)\) <> 2/);
    // la precondición va antes del informe, del parser y del UPDATE
    expect(iGuard).toBeLessThan(code.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(iGuard).toBeLessThan(code.indexOf("RAISE NOTICE"));
    expect(iGuard).toBeLessThan(code.indexOf("UPDATE public.players"));
    expect(sql).toMatch(/Aplica 036 primero/);
  });

  it("no toca el blob data ni columnas PHV (invariante #4)", () => {
    expect(code).not.toMatch(/SET\s+data\b/i);
    expect(code).not.toMatch(/jsonb_set/i);
    expect(code).not.toMatch(/phv_category|phv_offset|sitting_height|leg_length/);
  });
});
