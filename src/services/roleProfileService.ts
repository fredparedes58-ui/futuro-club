import { z } from "zod";
import { mockRoleProfile, type RoleProfileData, type PositionFit, type ArchetypeFit, type EvidenceIndicator } from "@/lib/roleProfileData";

// ─── Zod Schemas for validation ──────────────────────────────────────────

const CapabilityScoresSchema = z.object({
  tactical: z.number().min(0).max(100),
  technical: z.number().min(0).max(100),
  physical: z.number().min(0).max(100),
});

const PositionFitSchema = z.object({
  code: z.string(),
  prob: z.number().min(0).max(1),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const ArchetypeFitSchema = z.object({
  code: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  stability: z.enum(["emergente", "en_desarrollo", "estable", "consolidado"]),
  positions: z.array(z.string()).optional(),
});

const EvidenceSchema = z.object({
  indicator: z.string(),
  label: z.string(),
  raw_value: z.number(),
  normalized: z.number(),
  reliability: z.number().min(0).max(1),
  phase_of_play: z.enum(["in_possession", "out_of_possession", "transition"]),
  impact: z.enum(["positivo", "neutro", "negativo"]),
  contribution: z.number(),
  positions_impacted: z.array(z.string()),
  archetypes_impacted: z.array(z.string()),
  explanation: z.string(),
});

const RoleProfileSchema = z.object({
  run_id: z.string(),
  player_id: z.string(),
  player_name: z.string(),
  player_age: z.number().int().positive(),
  dominant_foot: z.enum(["derecho", "izquierdo", "ambidiestro"]),
  minutes_played: z.number().int().min(0),
  competitive_level: z.string(),
  sample_tier: z.enum(["bronze", "silver", "gold", "platinum"]),
  overall_confidence: z.number().min(0).max(1),
  current: CapabilityScoresSchema,
  identity: z.object({
    dominant: z.enum(["ofensivo", "defensivo", "tecnico", "fisico", "mixto"]),
    distribution: z.record(z.number()),
    explanation: z.string(),
  }),
  positions: z.array(PositionFitSchema),
  archetypes: z.array(ArchetypeFitSchema),
  projections: z.object({
    "0_6m": CapabilityScoresSchema,
    "6_18m": CapabilityScoresSchema,
    "18_36m": CapabilityScoresSchema,
  }),
  strengths: z.array(z.object({
    label: z.string(),
    evidence: z.string(),
    confidence: z.number(),
  })),
  risks: z.array(z.object({
    code: z.string(),
    label: z.string(),
    description: z.string(),
  })),
  gaps: z.array(z.object({
    label: z.string(),
    priority: z.enum(["alta", "media", "baja"]),
    relatedPositions: z.array(z.string()),
  })),
  consolidation_notes: z.array(z.string()),
  evidence: z.array(EvidenceSchema),
});

// ─── Service functions ───────────────────────────────────────────────────

/**
 * Simulates network latency for mock data.
 * Replace with real fetch calls when backend is ready.
 */
function simulateDelay<T>(data: T, ms = 800): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

/**
 * GET /api/player/:id/role-profile
 */
export async function fetchRoleProfile(playerId: string): Promise<RoleProfileData> {
  // TODO: Replace with real API call
  // const response = await fetch(`/api/player/${playerId}/role-profile`);
  // const raw = await response.json();
  const raw = await simulateDelay({ ...mockRoleProfile, player_id: playerId });

  const parsed = RoleProfileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[roleProfileService] Validation error:", parsed.error.flatten());
    throw new Error(`Datos de perfil inválidos: ${parsed.error.issues[0]?.message || "error de validación"}`);
  }

  return parsed.data as RoleProfileData;
}

/**
 * GET /api/player/:id/position-fit
 */
export async function fetchPositionFit(playerId: string): Promise<PositionFit[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile.positions;
}

/**
 * GET /api/player/:id/archetypes
 */
export async function fetchArchetypes(playerId: string): Promise<ArchetypeFit[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile.archetypes;
}

/**
 * GET /api/player/:id/role-profile/audit/:run_id
 */
export async function fetchAuditIndicators(playerId: string, _runId?: string): Promise<EvidenceIndicator[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile.evidence;
}
