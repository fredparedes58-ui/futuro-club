/**
 * VITAS Data Adapters
 * Convierten datos de PlayerService y AgentService
 * al formato exacto que esperan los componentes UI.
 */

import type { Player } from "./playerService";
import type { ScoutInsightOutput } from "@/agents/contracts";

// Avatares por defecto usando iniciales (sin CDN externo)
const PLACEHOLDER_AVATARS = [
  "https://api.dicebear.com/7.x/initials/svg?seed=",
];

// Imágenes de jugadores — usa placeholder local
const PLAYER_IMAGES = [
  "/placeholder.svg",
];

// ─────────────────────────────────────────
// Adapta Player → forma esperada por Dashboard/Rankings
// ─────────────────────────────────────────
export function adaptPlayerForUI(player: Player) {
  const vsiHistory = player.vsiHistory ?? [player.vsi];
  const prevVSI = vsiHistory.at(-2) ?? player.vsi;
  const delta = player.vsi - prevVSI;
  const trending: "up" | "down" | "stable" =
    delta > 2 ? "up" : delta < -2 ? "down" : "stable";

  // "ontme" → "on-time" para compatibilidad con componentes existentes
  const phvCategoryMap: Record<string, "early" | "on-time" | "late"> = {
    early: "early",
    ontme: "on-time",
    late: "late",
  };

  return {
    id: player.id,
    name: player.name,
    age: player.age,
    position: player.position,
    positionShort: player.position,
    academy: "VITAS Academy",
    vsi: player.vsi,
    phvOffset: player.phvOffset ?? 0,
    phvCategory: phvCategoryMap[player.phvCategory ?? "ontme"] ?? "on-time",
    trending,
    avatar: `${PLACEHOLDER_AVATARS[0]}${encodeURIComponent(player.name)}`,
    image: PLAYER_IMAGES[0],
    stats: {
      speed: player.metrics.speed,
      technique: player.metrics.technique,
      vision: player.metrics.vision,
      stamina: player.metrics.stamina,
      shooting: player.metrics.shooting,
      defending: player.metrics.defending,
    },
    recentDrills: Math.floor(player.minutesPlayed / 90),
    lastActive: player.updatedAt,
  };
}

// ─────────────────────────────────────────
// Adapta ScoutInsightAgent output → forma esperada por ScoutFeed
// ─────────────────────────────────────────
export function adaptInsightForUI(
  insight: ScoutInsightOutput,
  player: Player
) {
  // "phv_alert" → "phv-alert", "drill_record" → "drill-record"
  const typeMap: Record<string, string> = {
    breakout: "breakout",
    comparison: "comparison",
    phv_alert: "phv-alert",
    drill_record: "drill-record",
    regression: "regression",
    milestone: "milestone",
    general: "breakout", // fallback visual
  };

  return {
    id: `${insight.playerId}-${Date.now()}`,
    player: {
      avatar: `${PLACEHOLDER_AVATARS[0]}${encodeURIComponent(player.name)}`,
      name: player.name,
      positionShort: player.position,
      age: player.age,
      academy: "VITAS Academy",
      vsi: player.vsi,
    },
    insightType: typeMap[insight.type] ?? "breakout",
    title: insight.headline,
    description: insight.body,
    metric: insight.metric,
    metricValue: insight.metricValue,
    timestamp: insight.timestamp,
  };
}

// ─────────────────────────────────────────
// Calcula stats del Dashboard desde la lista de jugadores
// ─────────────────────────────────────────
export function computeDashboardStats(players: Player[]) {
  if (players.length === 0) {
    return { activePlayers: 0, drillsCompleted: 0, avgVsi: 0, hiddenTalents: 0 };
  }

  const avgVsi =
    Math.round(
      (players.reduce((sum, p) => sum + p.vsi, 0) / players.length) * 10
    ) / 10;

  const drillsCompleted = players.reduce(
    (sum, p) => sum + Math.floor(p.minutesPlayed / 90),
    0
  );

  // "Talentos ocultos" = jugadores early con VSI < 65 (potencial subestimado por PHV)
  const hiddenTalents = players.filter(
    (p) => p.phvCategory === "early" && p.vsi < 65
  ).length;

  return {
    activePlayers: players.length,
    drillsCompleted,
    avgVsi,
    hiddenTalents,
  };
}
