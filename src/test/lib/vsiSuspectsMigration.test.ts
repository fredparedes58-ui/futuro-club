/**
 * Migración 070 (v_vsi_default_suspects) — comprobación estática del SQL.
 *
 * No hay Postgres en CI para este repo: estas aserciones fijan las propiedades que
 * hacen segura la migración para datos de menores:
 *   - NO borra ni modifica ninguna fila de players (solo marca para revisión humana);
 *   - es idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE);
 *   - el corte temporal es el merge real de #146 (e36822b, 2026-08-22 00:06:21 +02:00);
 *   - el valor marcado (57.5) ES calculateFichaVsi de las barras por defecto;
 *   - tabla y vista quedan fuera del alcance de anon/authenticated.
 */
import { describe, it, expect } from "vitest";
// `?raw` (Vite): el SQL como texto, sin depender de tipos de Node en tsconfig.app.
import raw from "../../../supabase/migrations/070_vsi_default_suspects_review.sql?raw";
import { calculateFichaVsi } from "@/services/real/metricsService";

/** SQL sin comentarios de línea (`-- …`), para no confundir la documentación con sentencias. */
const sql = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/** Barras por defecto que el formulario guardaba antes de #146 (PlayerForm.tsx DEFAULT_METRICS). */
const DEFAULT_BARS = { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 50, defending: 50 };

describe("migración 070 — marcar 57.5 fabricados para revisión (sin borrar)", () => {
  it("es una transacción única BEGIN … COMMIT", () => {
    expect(sql.match(/^\s*BEGIN\s*;/gim)).toHaveLength(1);
    expect(sql.match(/^\s*COMMIT\s*;/gim)).toHaveLength(1);
    expect(sql.indexOf("BEGIN")).toBeLessThan(sql.lastIndexOf("COMMIT"));
  });

  it("NO borra ni modifica datos: sin DELETE/TRUNCATE/DROP ni UPDATE/ALTER sobre players", () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    // La UPDATE de resolución solo está documentada en comentarios, no se ejecuta.
    expect(sql).not.toMatch(/\bUPDATE\s+(public\.)?\w+\s+SET\b/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+(public\.)?players\b/i);
  });

  it("la única cascada es la de supresión RGPD: borrar al jugador borra su marca", () => {
    expect(sql.match(/ON DELETE/gi)).toHaveLength(1);
    expect(sql).toMatch(/player_id\s+text PRIMARY KEY REFERENCES public\.players\(id\) ON DELETE CASCADE/);
  });

  it("es idempotente", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.vsi_history_reviews/);
    expect(sql).toMatch(/ON CONFLICT \(player_id\) DO NOTHING/);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_vsi_default_suspects/);
  });

  it("el corte es el merge de #146 (2026-08-22 00:06:21 +02:00 = 2026-08-21 22:06:21 UTC)", () => {
    // 2026-08-22T00:06:21+02:00 === 2026-08-21T22:06:21Z
    expect(Date.parse("2026-08-22T00:06:21+02:00")).toBe(Date.parse("2026-08-21T22:06:21Z"));
    expect(sql).toMatch(/p\.created_at < timestamptz '2026-08-21 22:06:21\+00'/);
  });

  it("marca 57.5 = calculateFichaVsi(barras por defecto) en la columna Y en el blob legacy", () => {
    expect(calculateFichaVsi(DEFAULT_BARS)).toBe(57.5);
    expect(sql).toMatch(/57\.5 = ANY \(p\.vsi_history\)/);
    expect(sql).toMatch(/p\.data->'vsiHistory' @> '\[57\.5\]'::jsonb/);
  });

  it("la pista 'barras = por defecto' compara con exactamente las barras de DEFAULT_METRICS", () => {
    const m = sql.match(/p\.data->'metrics' = '(\{[^']+\})'::jsonb/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(DEFAULT_BARS);
  });

  it("solo service_role: RLS activa y revocado a anon/authenticated (tabla y vista)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.vsi_history_reviews ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.vsi_history_reviews FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.v_vsi_default_suspects FROM anon, authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    // security_invoker: la vista no abre un bypass de RLS sobre datos de menores.
    expect(sql).toMatch(/WITH \(security_invoker = true\)/);
  });

  it("la vista expone solo los casos pendientes y lo que lee /api/admin/vsi-suspects", () => {
    expect(sql).toMatch(/WHERE r\.status = 'pending'/);
    const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"), sql.indexOf("COMMENT ON VIEW"));
    for (const col of [
      "p.id", "p.user_id", "p.created_at", "p.vsi", "p.vsi_history",
      "AS data_vsi_history", "AS review_reason", "r.flagged_at",
      "r.current_vsi_is_default", "r.metrics_are_default",
    ]) {
      expect(view).toContain(col);
    }
  });
});
