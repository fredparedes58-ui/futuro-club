import { z } from "zod";
import { mockScoutInsights, type ScoutInsight } from "@/lib/mockData";

const ScoutInsightSchema = z.object({
  id: z.string(),
  player: z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    positionShort: z.string(),
    academy: z.string(),
    avatar: z.string(),
    vsi: z.number(),
  }).passthrough(),
  insightType: z.enum(["breakout", "comparison", "phv-alert", "drill-record"]),
  title: z.string(),
  description: z.string(),
  metric: z.string(),
  metricValue: z.string(),
  timestamp: z.string(),
});

function simulateDelay<T>(data: T, ms = 700): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export async function fetchScoutInsights(): Promise<ScoutInsight[]> {
  // Validate basic shape, passthrough allows full Player objects
  const raw = mockScoutInsights;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("No hay insights disponibles");
  }
  return simulateDelay(raw);
}
