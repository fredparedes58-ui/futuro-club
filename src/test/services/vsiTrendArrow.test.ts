/**
 * Flecha de tendencia ↑/↓ (/rankings) y lista «Talentos en tendencia» (/pulse).
 *
 * Antes: adaptPlayerForUI (fallback local de /rankings + dashboardService → /pulse)
 * restaba vsiHistory.at(-2) —historial legacy SIN fechas ni origen, con el 57.5
 * fabricado antes de #146— con banda ±2. Samu (vsiHistory [57.5, 67.4], vsi 67.4, sin
 * evaluaciones con fecha) salía con ↑ en /rankings y como «talento en tendencia» en
 * /pulse, mientras el panel de familia y el informe bloqueaban la MISMA variación
 * («historial anterior sin fecha ni origen»): invariantes #2/#7.
 *
 * Ahora: vsiTrendArrow = signo de computeVsiDelta (dos evaluaciones reales con fecha);
 * bloqueada ⇒ sin flecha. Solo los jugadores demo (MOCK con banner) conservan la flecha
 * de su historial sembrado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Player } from "@/services/real/playerService";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
  SUPABASE_CONFIGURED: false, // fuerza el fallback local de /rankings
}));

const mockGetAll = vi.fn<() => Player[]>(() => []);
vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: () => mockGetAll(),
    sort: (players: Player[]) => [...players],
  },
}));

import { vsiTrendArrow, computeVsiDelta } from "@/lib/scoring/vsiDelta";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { fetchTrendingPlayers } from "@/services/dashboardService";
import { fetchRankedPlayers } from "@/services/rankingsService";

const METRICS = { speed: 70, technique: 70, vision: 70, stamina: 70, shooting: 70, defending: 70 };

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: "p",
    name: "Jugador",
    age: 9,
    position: "Mediocentro",
    foot: "right",
    height: 135,
    weight: 30,
    competitiveLevel: "Regional",
    minutesPlayed: 0,
    metrics: METRICS,
    vsi: 70,
    vsiHistory: [70],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  } as Player;
}

/** El caso que migración 070 marca como fabricado: 57.5 = barras por defecto antes de #146. */
const SAMU = makePlayer({ id: "p-samu", name: "Samu", vsi: 67.4, vsiHistory: [57.5, 67.4] });

/** Jugador real con dos evaluaciones del entrenador con fecha: 60 → 67.4 (+7.4). */
const REAL_RISER = makePlayer({
  id: "p-real",
  name: "Real",
  vsi: 67.4,
  vsiHistory: [60, 67.4],
  vsiEvaluations: [
    { value: 60, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
    { value: 67.4, at: "2026-09-20T10:00:00.000Z", source: "coach_form" },
  ],
});

/** Jugador demo (MOCK con banner): evaluación demo_seed + historial sembrado. */
const DEMO_RISER = makePlayer({
  id: "p-demo",
  name: "Demo",
  isDemo: true,
  vsi: 72.4,
  vsiHistory: [67, 72],
  vsiEvaluations: [{ value: 72.4, at: "2026-09-01T10:00:00.000Z", source: "demo_seed" }],
});

describe("vsiTrendArrow — única fuente de la flecha", () => {
  it("Samu: legacy [57.5, 67.4] sin evaluaciones con fecha ⇒ sin flecha (la variación está bloqueada)", () => {
    const input = { evaluations: SAMU.vsiEvaluations, legacyHistory: SAMU.vsiHistory, currentVsi: SAMU.vsi };
    expect(computeVsiDelta(input).gate_code).toBe("legacy_undated");
    expect(vsiTrendArrow({ ...input, isDemo: SAMU.isDemo })).toBe("stable");
  });

  it("dos evaluaciones reales con fecha ⇒ la flecha es el signo de computeVsiDelta (banda ±2)", () => {
    expect(vsiTrendArrow({ evaluations: REAL_RISER.vsiEvaluations, currentVsi: 67.4 })).toBe("up");
    const falling = [
      { value: 70, at: "2026-09-01T10:00:00.000Z", source: "players_api" },
      { value: 64.5, at: "2026-09-20T10:00:00.000Z", source: "players_api" },
    ];
    expect(vsiTrendArrow({ evaluations: falling, currentVsi: 64.5 })).toBe("down");
    const flat = [
      { value: 70, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
      { value: 72, at: "2026-09-20T10:00:00.000Z", source: "coach_form" },
    ];
    expect(vsiTrendArrow({ evaluations: flat, currentVsi: 72 })).toBe("stable");
  });

  it("VSI actual distinto de la última evaluación (movido por otra ruta) ⇒ sin flecha", () => {
    expect(vsiTrendArrow({ evaluations: REAL_RISER.vsiEvaluations, currentVsi: 75.3 })).toBe("stable");
  });

  it("solo isDemo === true reabre el historial legacy (demo = MOCK con banner)", () => {
    const legacy = { evaluations: undefined, legacyHistory: [57.5, 67.4], currentVsi: 67.4 };
    expect(vsiTrendArrow({ ...legacy, isDemo: true })).toBe("up");
    expect(vsiTrendArrow({ ...legacy, isDemo: false })).toBe("stable");
    expect(vsiTrendArrow({ ...legacy, isDemo: undefined })).toBe("stable");
    expect(vsiTrendArrow({ ...legacy, isDemo: "true" as unknown as boolean })).toBe("stable");
  });
});

describe("Samu en las superficies de tendencia", () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockGetAll.mockReturnValue([SAMU, REAL_RISER, DEMO_RISER]);
  });

  it("adaptPlayerForUI: Samu sin flecha; real y demo con ↑", () => {
    expect(adaptPlayerForUI(SAMU).trending).toBe("stable");
    expect(adaptPlayerForUI(REAL_RISER).trending).toBe("up");
    expect(adaptPlayerForUI(DEMO_RISER).trending).toBe("up");
  });

  it("/pulse «Talentos en tendencia» (dashboardService): Samu NO aparece", async () => {
    const trending = await fetchTrendingPlayers();
    const ids = trending.map((p) => p.id);
    expect(ids).not.toContain("p-samu");
    expect(ids).toEqual(expect.arrayContaining(["p-real", "p-demo"]));
  });

  it("/rankings (fallback local): Samu sin flecha", async () => {
    const res = await fetchRankedPlayers("vsi", "desc", {});
    const byId = Object.fromEntries(res.players.map((p) => [p.id, p.trending]));
    expect(byId["p-samu"]).toBe("stable");
    expect(byId["p-real"]).toBe("up");
    expect(byId["p-demo"]).toBe("up");
  });
});
