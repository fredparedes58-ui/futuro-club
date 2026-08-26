/**
 * VITAS · Tests — engagementRow (contrato de columnas)
 *
 * Blinda el contrato de columnas de `engagement_snapshots`. La regresión que
 * evita: escribir `physical_engagement`/`engagement_score` (columnas que NO
 * existen en la tabla) en vez de `physical`/`composite`.
 */
import { describe, it, expect } from "vitest";
import { toEngagementRow, fromEngagementRow } from "@/services/real/engagementRow";
import type { EngagementSnapshot } from "@/services/real/wellbeingService";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const SESSION_UUID = "223e4567-e89b-12d3-a456-426614174999";

function snapshot(overrides: Partial<EngagementSnapshot> = {}): EngagementSnapshot {
  return {
    id: UUID,
    playerId: "player-1",
    sessionId: SESSION_UUID,
    date: "2026-08-20",
    physicalEngagement: 80,
    socialEngagement: 60,
    emotionalEngagement: 70,
    engagementScore: 71,
    ...overrides,
  };
}

describe("engagementRow · toEngagementRow", () => {
  it("usa EXACTAMENTE las columnas reales de la tabla", () => {
    const row = toEngagementRow(snapshot());
    expect(Object.keys(row).sort()).toEqual(
      ["composite", "date", "emotional", "id", "physical", "player_id", "session_id", "social"].sort(),
    );
  });

  it("NO emite los nombres de columna erróneos previos", () => {
    const row = toEngagementRow(snapshot()) as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty("physical_engagement");
    expect(row).not.toHaveProperty("social_engagement");
    expect(row).not.toHaveProperty("emotional_engagement");
    expect(row).not.toHaveProperty("engagement_score");
  });

  it("mapea camelCase → columnas y engagementScore → composite", () => {
    const row = toEngagementRow(snapshot());
    expect(row.player_id).toBe("player-1");
    expect(row.physical).toBe(80);
    expect(row.social).toBe(60);
    expect(row.emotional).toBe(70);
    expect(row.composite).toBe(71);
    expect(row.date).toBe("2026-08-20");
  });

  it("incluye el id solo si ya es UUID; lo omite para ids de cliente", () => {
    expect(toEngagementRow(snapshot({ id: UUID })).id).toBe(UUID);
    expect(toEngagementRow(snapshot({ id: "eng_1724_abc" })).id).toBeUndefined();
    expect(toEngagementRow(snapshot({ id: "" })).id).toBeUndefined();
  });

  it("session_id: UUID pasa; no-UUID (o ausente) → null", () => {
    expect(toEngagementRow(snapshot({ sessionId: SESSION_UUID })).session_id).toBe(SESSION_UUID);
    expect(toEngagementRow(snapshot({ sessionId: "session-0" })).session_id).toBeNull();
    expect(toEngagementRow(snapshot({ sessionId: undefined })).session_id).toBeNull();
  });
});

describe("engagementRow · fromEngagementRow", () => {
  it("lee composite (no engagement_score) → engagementScore", () => {
    const row = {
      id: UUID,
      player_id: "player-1",
      session_id: SESSION_UUID,
      date: "2026-08-20",
      physical: 80,
      social: 60,
      emotional: 70,
      composite: 71,
    };
    const snap = fromEngagementRow(row);
    expect(snap.engagementScore).toBe(71);
    expect(snap.physicalEngagement).toBe(80);
    expect(snap.sessionId).toBe(SESSION_UUID);
  });

  it("tolera columnas ausentes con 0 (no inventa señal)", () => {
    const snap = fromEngagementRow({ id: UUID, player_id: "p", date: "2026-08-20" });
    expect(snap.physicalEngagement).toBe(0);
    expect(snap.engagementScore).toBe(0);
    expect(snap.sessionId).toBeUndefined();
  });
});

describe("engagementRow · round-trip", () => {
  it("preserva los cuatro valores numéricos", () => {
    const original = snapshot();
    const row = toEngagementRow(original);
    // Simula la vuelta desde PostgREST (que devuelve id generado si faltaba).
    const roundTripped = fromEngagementRow({
      id: original.id,
      player_id: row.player_id,
      session_id: row.session_id,
      date: row.date,
      physical: row.physical,
      social: row.social,
      emotional: row.emotional,
      composite: row.composite,
    });
    expect(roundTripped.physicalEngagement).toBe(original.physicalEngagement);
    expect(roundTripped.socialEngagement).toBe(original.socialEngagement);
    expect(roundTripped.emotionalEngagement).toBe(original.emotionalEngagement);
    expect(roundTripped.engagementScore).toBe(original.engagementScore);
  });
});
