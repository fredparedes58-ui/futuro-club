/**
 * VITAS Agent Contracts
 * Cada agente tiene un contrato estricto: input tipado → output tipado.
 * Claude SIEMPRE responde JSON válido según el contrato.
 */

import { z } from "zod";

// ─────────────────────────────────────────
// CONTRATO 1: PHV Calculator Agent
// Calcula maduración biológica usando fórmula Mirwald
// ─────────────────────────────────────────
export const PHVInputSchema = z.object({
  playerId: z.string(),
  chronologicalAge: z.number().min(8).max(21),
  height: z.number().min(100).max(220),       // cm
  weight: z.number().min(20).max(120),         // kg
  sittingHeight: z.number().optional(),        // cm (si disponible)
  legLength: z.number().optional(),            // cm
  gender: z.enum(["M", "F"]).default("M"),
});

export const PHVOutputSchema = z.object({
  playerId: z.string(),
  biologicalAge: z.number(),
  chronologicalAge: z.number(),
  offset: z.number(),                          // biologicalAge - chronologicalAge
  category: z.enum(["early", "ontme", "late"]),
  phvStatus: z.enum(["pre_phv", "during_phv", "post_phv"]),
  developmentWindow: z.enum(["critical", "active", "stable"]),
  adjustedVSI: z.number().min(0).max(100),     // VSI corregido por PHV
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
});

export type PHVInput = z.infer<typeof PHVInputSchema>;
export type PHVOutput = z.infer<typeof PHVOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 2: Scout Insight Agent
// Genera insights en español para ScoutFeed
// ─────────────────────────────────────────
export const ScoutInsightInputSchema = z.object({
  player: z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    position: z.string(),
    vsi: z.number(),
    vsiTrend: z.enum(["up", "down", "stable"]),
    phvCategory: z.enum(["early", "ontme", "late"]),
    recentMetrics: z.object({
      speed: z.number(),
      technique: z.number(),
      vision: z.number(),
      stamina: z.number(),
      shooting: z.number(),
      defending: z.number(),
    }),
    lastDrills: z.array(z.string()).optional(),
  }),
  context: z.enum(["breakout", "comparison", "phv_alert", "drill_record", "general"]),
});

export const ScoutInsightOutputSchema = z.object({
  playerId: z.string(),
  type: z.enum(["breakout", "comparison", "phv_alert", "drill_record", "general"]),
  headline: z.string().max(80),
  body: z.string().max(300),
  metric: z.string(),
  metricValue: z.string(),
  urgency: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string()).max(4),
  timestamp: z.string(),
});

export type ScoutInsightInput = z.infer<typeof ScoutInsightInputSchema>;
export type ScoutInsightOutput = z.infer<typeof ScoutInsightOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 3: Role Profile Agent
// Construye perfil de rol táctico completo
// ─────────────────────────────────────────
export const RoleProfileInputSchema = z.object({
  player: z.object({
    id: z.string(),
    name: z.string(),
    age: z.number(),
    foot: z.enum(["right", "left", "both"]),
    position: z.string(),
    minutesPlayed: z.number(),
    competitiveLevel: z.string(),
    metrics: z.object({
      speed: z.number().min(0).max(100),
      technique: z.number().min(0).max(100),
      vision: z.number().min(0).max(100),
      stamina: z.number().min(0).max(100),
      shooting: z.number().min(0).max(100),
      defending: z.number().min(0).max(100),
      pressing: z.number().min(0).max(100).optional(),
      positioning: z.number().min(0).max(100).optional(),
    }),
    phvCategory: z.enum(["early", "ontme", "late"]),
    phvOffset: z.number(),
  }),
});

export const RoleProfileOutputSchema = z.object({
  playerId: z.string(),
  dominantIdentity: z.enum(["ofensivo", "defensivo", "tecnico", "fisico", "mixto"]),
  identityDistribution: z.object({
    ofensivo: z.number(),
    defensivo: z.number(),
    tecnico: z.number(),
    fisico: z.number(),
    mixto: z.number(),
  }),
  topPositions: z.array(z.object({
    code: z.string(),
    fit: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
  })).max(5),
  topArchetypes: z.array(z.object({
    code: z.string(),
    fit: z.number().min(0).max(100),
    stability: z.enum(["emergente", "en_desarrollo", "estable", "consolidado"]),
  })).max(5),
  capabilities: z.object({
    tactical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
    technical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
    physical: z.object({ current: z.number(), p6m: z.number(), p18m: z.number() }),
  }),
  strengths: z.array(z.string()).max(4),
  risks: z.array(z.string()).max(3),
  gaps: z.array(z.string()).max(3),
  overallConfidence: z.number().min(0).max(1),
  summary: z.string().max(400),
});

export type RoleProfileInput = z.infer<typeof RoleProfileInputSchema>;
export type RoleProfileOutput = z.infer<typeof RoleProfileOutputSchema>;

// ─────────────────────────────────────────
// CONTRATO 4: Tactical Label Agent (Fase 2 - Video)
// Recibe detección de Roboflow → asigna etiquetas PHV/táctica
// ─────────────────────────────────────────
export const TacticalLabelInputSchema = z.object({
  frameId: z.string(),
  videoId: z.string(),
  detections: z.array(z.object({
    trackId: z.number(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    zone: z.number().min(1).max(9),
    hasBall: z.boolean(),
    speedKmh: z.number(),
    jerseyNumber: z.number().optional(),
    playerData: z.object({
      age: z.number().optional(),
      height: z.number().optional(),
      weight: z.number().optional(),
      knownPosition: z.string().optional(),
    }).optional(),
  })),
  matchContext: z.object({
    minute: z.number(),
    teamPossession: z.enum(["home", "away", "disputed"]),
    fieldZone: z.enum(["defensive", "middle", "offensive"]),
  }),
});

export const TacticalLabelOutputSchema = z.object({
  frameId: z.string(),
  labels: z.array(z.object({
    trackId: z.number(),
    positionCode: z.string(),
    phvCategory: z.enum(["early", "ontme", "late", "unknown"]),
    action: z.enum(["sprint", "pass", "shot", "press", "dribble", "tackle", "off_ball_run", "static"]),
    vsiContribution: z.number().min(0).max(1),
    labelConfidence: z.number().min(0).max(1),
  })),
});

export type TacticalLabelInput = z.infer<typeof TacticalLabelInputSchema>;
export type TacticalLabelOutput = z.infer<typeof TacticalLabelOutputSchema>;

// ─────────────────────────────────────────
// TIPO GENÉRICO DE RESPUESTA DE AGENTE
// ─────────────────────────────────────────
export interface AgentResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  agentName: string;
}
