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
  const parsed = z.array(ScoutInsightSchema).safeParse(mockScoutInsights);
  if (!parsed.success) {
    throw new Error(`Datos de insights inválidos: ${parsed.error.issues[0]?.message}`);
  }
  return simulateDelay(parsed.data as ScoutInsight[]);
}
