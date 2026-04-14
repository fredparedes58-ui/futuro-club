/**
 * Tests for data adapters — adaptPlayerForUI, adaptInsightForUI, computeDashboardStats
 */
import { describe, it, expect } from "vitest";
import { adaptPlayerForUI, adaptInsightForUI, computeDashboardStats } from "@/services/real/adapters";
import type { Player } from "@/services/real/playerService";
import type { ScoutInsightOutput } from "@/agents/contracts";

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "p1",
  name: "Test Player",
  age: 14,
  position: "delantero",
  foot: "right",
  height: 165,
  weight: 55,
  competitiveLevel: "Regional",
  gender: "M",
  vsi: 72,
  minutesPlayed: 450,
  metrics: { speed: 75, technique: 80, vision: 65, stamina: 70, shooting: 85, defending: 40 },
  vsiHistory: [68, 70, 72],
  phvCategory: "ontme",
  phvOffset: 0.3,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-06-01T00:00:00Z",
  ...overrides,
});

// ── adaptPlayerForUI ────────────────────────────────────────────────────────
describe("adaptPlayerForUI", () => {
  it("maps core fields", () => {
    const ui = adaptPlayerForUI(makePlayer());
    expect(ui.id).toBe("p1");
    expect(ui.name).toBe("Test Player");
    expect(ui.age).toBe(14);
    expect(ui.position).toBe("delantero");
    expect(ui.vsi).toBe(72);
  });

  it("calculates trending=up when delta > 2", () => {
    const ui = adaptPlayerForUI(makePlayer({ vsi: 75, vsiHistory: [68, 70] }));
    expect(ui.trending).toBe("up");
  });

  it("calculates trending=down when delta < -2", () => {
    const ui = adaptPlayerForUI(makePlayer({ vsi: 65, vsiHistory: [68, 70] }));
    expect(ui.trending).toBe("down");
  });

  it("calculates trending=stable for small delta", () => {
    // prevVSI = vsiHistory.at(-2) = second to last, here 70. delta = 72-70 = 2
    const ui = adaptPlayerForUI(makePlayer({ vsi: 72, vsiHistory: [68, 70, 72] }));
    expect(ui.trending).toBe("stable");
  });

  it("maps ontme to on-time", () => {
    const ui = adaptPlayerForUI(makePlayer({ phvCategory: "ontme" }));
    expect(ui.phvCategory).toBe("on-time");
  });

  it("maps early to early", () => {
    const ui = adaptPlayerForUI(makePlayer({ phvCategory: "early" }));
    expect(ui.phvCategory).toBe("early");
  });

  it("maps late to late", () => {
    const ui = adaptPlayerForUI(makePlayer({ phvCategory: "late" }));
    expect(ui.phvCategory).toBe("late");
  });

  it("defaults phvCategory to on-time when undefined", () => {
    const ui = adaptPlayerForUI(makePlayer({ phvCategory: undefined }));
    expect(ui.phvCategory).toBe("on-time");
  });

  it("generates avatar URL with encoded name", () => {
    const ui = adaptPlayerForUI(makePlayer({ name: "José García" }));
    expect(ui.avatar).toContain("Jos%C3%A9%20Garc%C3%ADa");
  });

  it("maps stats correctly", () => {
    const ui = adaptPlayerForUI(makePlayer());
    expect(ui.stats.speed).toBe(75);
    expect(ui.stats.technique).toBe(80);
    expect(ui.stats.shooting).toBe(85);
  });

  it("computes recentDrills from minutesPlayed", () => {
    const ui = adaptPlayerForUI(makePlayer({ minutesPlayed: 360 }));
    expect(ui.recentDrills).toBe(4); // floor(360/90)
  });

  it("handles missing vsiHistory", () => {
    const ui = adaptPlayerForUI(makePlayer({ vsiHistory: undefined, vsi: 70 }));
    expect(ui.trending).toBe("stable");
  });

  it("defaults phvOffset to 0", () => {
    const ui = adaptPlayerForUI(makePlayer({ phvOffset: undefined }));
    expect(ui.phvOffset).toBe(0);
  });
});

// ── adaptInsightForUI ───────────────────────────────────────────────────────
describe("adaptInsightForUI", () => {
  const player = makePlayer();
  const baseInsight: ScoutInsightOutput = {
    playerId: "p1",
    type: "breakout",
    urgency: "high",
    headline: "Explosión de rendimiento",
    body: "El jugador muestra mejora significativa",
    metric: "speed",
    metricValue: "85",
    tags: ["breakout", "speed"],
    actionItems: ["Incrementar carga"],
    timestamp: "2025-06-01T00:00:00Z",
  };

  it("maps breakout type correctly", () => {
    const ui = adaptInsightForUI(baseInsight, player);
    expect(ui.insightType).toBe("breakout");
  });

  it("maps phv_alert to phv-alert", () => {
    const ui = adaptInsightForUI({ ...baseInsight, type: "phv_alert" }, player);
    expect(ui.insightType).toBe("phv-alert");
  });

  it("maps drill_record to drill-record", () => {
    const ui = adaptInsightForUI({ ...baseInsight, type: "drill_record" }, player);
    expect(ui.insightType).toBe("drill-record");
  });

  it("maps general to breakout (fallback visual)", () => {
    const ui = adaptInsightForUI({ ...baseInsight, type: "general" }, player);
    expect(ui.insightType).toBe("breakout");
  });

  it("includes player info", () => {
    const ui = adaptInsightForUI(baseInsight, player);
    expect(ui.player.name).toBe("Test Player");
    expect(ui.player.age).toBe(14);
    expect(ui.player.vsi).toBe(72);
  });

  it("preserves insight content", () => {
    const ui = adaptInsightForUI(baseInsight, player);
    expect(ui.title).toBe("Explosión de rendimiento");
    expect(ui.metric).toBe("speed");
    expect(ui.metricValue).toBe("85");
  });

  it("generates unique id with playerId", () => {
    const ui = adaptInsightForUI(baseInsight, player);
    expect(ui.id).toContain("p1-");
  });
});

// ── computeDashboardStats ───────────────────────────────────────────────────
describe("computeDashboardStats", () => {
  it("returns zeros for empty array", () => {
    const stats = computeDashboardStats([]);
    expect(stats.activePlayers).toBe(0);
    expect(stats.drillsCompleted).toBe(0);
    expect(stats.avgVsi).toBe(0);
    expect(stats.hiddenTalents).toBe(0);
  });

  it("counts active players", () => {
    const stats = computeDashboardStats([makePlayer(), makePlayer({ id: "p2" })]);
    expect(stats.activePlayers).toBe(2);
  });

  it("calculates average VSI", () => {
    const stats = computeDashboardStats([
      makePlayer({ vsi: 70 }),
      makePlayer({ id: "p2", vsi: 80 }),
    ]);
    expect(stats.avgVsi).toBe(75);
  });

  it("sums drills completed", () => {
    const stats = computeDashboardStats([
      makePlayer({ minutesPlayed: 180 }), // 2 drills
      makePlayer({ id: "p2", minutesPlayed: 270 }), // 3 drills
    ]);
    expect(stats.drillsCompleted).toBe(5);
  });

  it("counts hidden talents (early + vsi < 65)", () => {
    const stats = computeDashboardStats([
      makePlayer({ phvCategory: "early", vsi: 55 }), // ✓ hidden
      makePlayer({ id: "p2", phvCategory: "early", vsi: 70 }), // ✗ vsi too high
      makePlayer({ id: "p3", phvCategory: "ontme", vsi: 50 }), // ✗ not early
    ]);
    expect(stats.hiddenTalents).toBe(1);
  });
});
