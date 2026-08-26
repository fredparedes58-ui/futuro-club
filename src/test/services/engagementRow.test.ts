// @ts-nocheck — usa node:fs para leer el SQL de la migración y fijar el contrato de
// columnas. tsconfig.app.json (frontend) no tipa node; se exime igual que los demás
// tests que leen ficheros (p. ej. fieldEval.test.ts). El mapper que ejercita SÍ está
// tipado en su módulo y en los call sites de los servicios.
/**
 * Contrato de columnas de engagement_snapshots.
 *
 * Fija el mapeo dominio↔fila contra la migración real. Existe porque el bug que
 * este módulo repara (writers escribiendo `physical_engagement`/`engagement_score`,
 * columnas inexistentes → upsert fallando en silencio) no lo cazaba ningún test:
 * el `catch` tragaba el error de PostgREST. Si alguien vuelve a divergir los
 * nombres, este test falla en CI antes de llegar a producción.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  ENGAGEMENT_DB_COLUMNS,
  engagementSnapshotToRow,
  rowToEngagementSnapshot,
  type EngagementSnapshotLike,
} from "@/services/real/engagementRow";

/** Extrae los nombres de columna del CREATE TABLE de la migración. */
function migrationColumns(): string[] {
  const sql = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/046_wellbeing_burnout.sql"),
    "utf8",
  );
  const start = sql.indexOf("CREATE TABLE IF NOT EXISTS engagement_snapshots (");
  expect(start).toBeGreaterThan(-1);
  const body = sql.slice(start + "CREATE TABLE IF NOT EXISTS engagement_snapshots (".length);
  const end = body.indexOf(");");
  expect(end).toBeGreaterThan(-1);
  return body
    .slice(0, end)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"))
    // primer identificador de cada línea de columna
    .map((l) => l.match(/^([a-z_][a-z0-9_]*)/i)?.[1])
    .filter((c): c is string => Boolean(c));
}

const SAMPLE: EngagementSnapshotLike = {
  id: "11111111-2222-3333-4444-555555555555",
  playerId: "demo-a",
  sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  date: "2026-08-26",
  physicalEngagement: 70,
  socialEngagement: 55,
  emotionalEngagement: 60,
  engagementScore: 62,
  engagementTrend: "declining",
  weeklyAvg: 58,
};

describe("engagement_snapshots · contrato de columnas", () => {
  it("ENGAGEMENT_DB_COLUMNS == columnas de la migración (salvo created_at, gestionada por la BD)", () => {
    const migration = migrationColumns().filter((c) => c !== "created_at");
    expect([...ENGAGEMENT_DB_COLUMNS].sort()).toEqual([...migration].sort());
  });

  it("engagementSnapshotToRow solo emite columnas que existen en la migración", () => {
    const migration = new Set(migrationColumns());
    const row = engagementSnapshotToRow(SAMPLE);
    for (const key of Object.keys(row)) {
      expect(migration.has(key), `columna inexistente en la migración: ${key}`).toBe(true);
    }
  });

  it("mapea composite ← engagementScore (no engagement_score)", () => {
    const row = engagementSnapshotToRow(SAMPLE);
    expect(row.composite).toBe(62);
    expect(row.physical).toBe(70);
    expect(row).not.toHaveProperty("engagement_score");
    expect(row).not.toHaveProperty("physical_engagement");
  });

  it("session_id no-UUID → null; id no-UUID → omitido (columnas UUID)", () => {
    const row = engagementSnapshotToRow({ ...SAMPLE, id: "eng_local_123", sessionId: "sess-7" });
    expect(row.session_id).toBeNull();
    expect(row.id).toBeUndefined();
  });

  it("round-trip fila→dominio→fila preserva el composite bajo la columna correcta", () => {
    const dbRow = {
      id: SAMPLE.id,
      player_id: SAMPLE.playerId,
      session_id: SAMPLE.sessionId,
      date: SAMPLE.date,
      physical: 70,
      social: 55,
      emotional: 60,
      composite: 62,
      trend: "declining",
      weekly_avg: 58,
    };
    const domain = rowToEngagementSnapshot(dbRow);
    expect(domain.engagementScore).toBe(62);
    expect(domain.engagementTrend).toBe("declining");
    expect(engagementSnapshotToRow(domain).composite).toBe(62);
  });

  it("composite ausente cae a 0 (DEFAULT 0 de la columna; la honestidad la aplica el consumidor)", () => {
    const domain = rowToEngagementSnapshot({ player_id: "demo-a", date: "2026-08-26" });
    expect(domain.engagementScore).toBe(0);
    expect(domain.engagementTrend).toBe("stable");
  });
});
