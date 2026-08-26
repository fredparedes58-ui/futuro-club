/**
 * VITAS · Tests — WellbeingService.saveEngagement (idempotencia por jugador+fecha)
 *
 * La entrada MANUAL del entrenador es una observación de UN jugador en UNA fecha.
 * Re-valorar la misma fecha debe SOBRESCRIBIR, no duplicar: dos filas para el
 * mismo (playerId, date) harían que el heatmap promedie la corrección con el valor
 * viejo (un intermedio que nadie observó) y que el timeline pinte dos puntos.
 *
 * Estos tests blindan el comportamiento OFFLINE (caché localStorage), que debe
 * coincidir con la unicidad de BD (constraint engagement_player_date_unique,
 * migración 060, upsert onConflict "player_id,date"). Sin Supabase configurado
 * solo corre la caché, así que aquí forzamos ese camino.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {},
  SUPABASE_CONFIGURED: false,
}));

import { WellbeingService, type EngagementSnapshot } from "@/services/real/wellbeingService";

function rating(overrides: Partial<EngagementSnapshot> = {}): EngagementSnapshot {
  return {
    id: "", // id de cliente vacío → el servicio genera uno (nunca UUID)
    playerId: "player-1",
    date: "2026-08-20",
    physicalEngagement: 80,
    socialEngagement: 60,
    emotionalEngagement: 70,
    engagementScore: 71,
    ...overrides,
  };
}

describe("WellbeingService.saveEngagement · idempotencia offline", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("re-valorar el mismo jugador+fecha SOBRESCRIBE (1 fila, no duplica)", async () => {
    await WellbeingService.saveEngagement(rating({ engagementScore: 40 }));
    await WellbeingService.saveEngagement(rating({ engagementScore: 90 }));

    const rows = await WellbeingService.getEngagement("player-1");
    expect(rows).toHaveLength(1);
    // Conserva la corrección más reciente, no la primera ni una media.
    expect(rows[0].engagementScore).toBe(90);
  });

  it("mismo jugador, fecha DISTINTA → dos filas (son observaciones distintas)", async () => {
    await WellbeingService.saveEngagement(rating({ date: "2026-08-20" }));
    await WellbeingService.saveEngagement(rating({ date: "2026-08-21" }));

    const rows = await WellbeingService.getEngagement("player-1");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.date))).toEqual(
      new Set(["2026-08-20", "2026-08-21"]),
    );
  });

  it("misma fecha, jugador DISTINTO no se pisan entre sí", async () => {
    await WellbeingService.saveEngagement(rating({ playerId: "player-1", engagementScore: 55 }));
    await WellbeingService.saveEngagement(rating({ playerId: "player-2", engagementScore: 66 }));

    const p1 = await WellbeingService.getEngagement("player-1");
    const p2 = await WellbeingService.getEngagement("player-2");
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p1[0].engagementScore).toBe(55);
    expect(p2[0].engagementScore).toBe(66);
  });
});
