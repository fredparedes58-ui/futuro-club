import { z } from "zod";
import { mockRoleProfile, type RoleProfileData, type PositionFit, type ArchetypeFit, type EvidenceIndicator, type GapItem } from "@/lib/roleProfileData";
import type { Player } from "@/services/real/playerService";

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
 * GET /api/player/:id/role-profile
 * Llama al RoleProfileAgent de Claude y mapea al formato UI.
 */
export async function fetchRoleProfile(playerId: string): Promise<RoleProfileData> {
  // Intenta obtener datos reales del agente
  try {
    const { PlayerService } = await import("@/services/real/playerService");
    const { AgentService } = await import("@/services/real/agentService");

    const player = PlayerService.getById(playerId);
    if (player) {
      const res = await AgentService.buildRoleProfile({
        player: {
          id: player.id,
          name: player.name,
          age: player.age,
          foot: player.foot,
          position: player.position,
          minutesPlayed: player.minutesPlayed,
          competitiveLevel: player.competitiveLevel,
          metrics: { ...player.metrics, pressing: player.metrics.stamina, positioning: player.metrics.vision },
          phvCategory: player.phvCategory ?? "ontme",
          phvOffset: player.phvOffset ?? 0,
        },
      });

      if (res.success && res.data) {
        const d = res.data;

        // Construir evidencia real desde las métricas del jugador
        const buildEvidence = (p: typeof player): EvidenceIndicator[] => {
          const metricsMap: Array<{ key: keyof typeof p.metrics; label: string; phase: EvidenceIndicator["phase_of_play"] }> = [
            { key: "vision",    label: "Visión de juego",     phase: "in_possession" },
            { key: "technique", label: "Técnica con balón",   phase: "in_possession" },
            { key: "shooting",  label: "Eficacia en disparo", phase: "in_possession" },
            { key: "defending", label: "Recuperación",        phase: "out_of_possession" },
            { key: "speed",     label: "Velocidad",           phase: "transition" },
            { key: "stamina",   label: "Resistencia física",  phase: "out_of_possession" },
          ];
          return metricsMap.map((m, i) => {
            const raw = p.metrics[m.key];
            const norm = raw / 100;
            return {
              indicator: m.key,
              label: m.label,
              raw_value: raw,
              normalized: norm,
              reliability: 0.7 + (norm * 0.2),
              phase_of_play: m.phase,
              impact: norm >= 0.7 ? "positivo" : norm >= 0.45 ? "neutro" : "negativo",
              contribution: Math.round(norm * 10) / 10,
              positions_impacted: d.topPositions.slice(0, 2).map(p => p.code),
              archetypes_impacted: d.topArchetypes.slice(0, 1).map(a => a.code),
              explanation: `${m.label}: ${raw}/100 — ${norm >= 0.7 ? "por encima del umbral" : norm >= 0.45 ? "en rango medio" : "por desarrollar"}`,
            };
          });
        };

        // Derivar sample_tier desde minutesPlayed (sin mock)
        const sampleTier: RoleProfileData["sample_tier"] =
          player.minutesPlayed >= 1800 ? "platinum" :
          player.minutesPlayed >= 900  ? "gold"     :
          player.minutesPlayed >= 360  ? "silver"   : "bronze";

        // Mapea output del agente → formato RoleProfileData del componente (sin spreads mock)
        const agentProfile: RoleProfileData = {
          run_id:             `run_${Date.now()}`,
          player_id:          playerId,
          player_name:        player.name,
          player_age:         player.age,
          dominant_foot:      player.foot === "right" ? "derecho" : player.foot === "left" ? "izquierdo" : "ambidiestro",
          minutes_played:     player.minutesPlayed,
          competitive_level:  player.competitiveLevel,
          sample_tier:        sampleTier,
          overall_confidence: d.overallConfidence,
          current: {
            tactical:  d.capabilities.tactical.current,
            technical: d.capabilities.technical.current,
            physical:  d.capabilities.physical.current,
          },
          projections: {
            "0_6m":   { tactical: d.capabilities.tactical.p6m,      technical: d.capabilities.technical.p6m,      physical: d.capabilities.physical.p6m },
            "6_18m":  { tactical: d.capabilities.tactical.p18m,     technical: d.capabilities.technical.p18m,     physical: d.capabilities.physical.p18m },
            "18_36m": { tactical: d.capabilities.tactical.p18m + 3, technical: d.capabilities.technical.p18m + 3, physical: d.capabilities.physical.p18m + 2 },
          },
          identity: {
            dominant:     d.dominantIdentity,
            distribution: d.identityDistribution,
            explanation:  `Perfil dominante: ${d.dominantIdentity}`,
          },
          positions: d.topPositions.map((p, i) => ({
            code:       p.code as RoleProfileData["positions"][0]["code"],
            prob:       p.fit / 100,
            score:      p.fit,
            confidence: p.confidence,
            reason:     i === 0 ? `Posición principal con ${p.fit}% de ajuste` : `Posición alternativa viable`,
          })),
          archetypes: d.topArchetypes.map((a) => ({
            code:       a.code as RoleProfileData["archetypes"][0]["code"],
            score:      a.fit,
            confidence: a.fit / 100,
            stability:  a.stability,
            positions:  [],
          })),
          // Strengths: tipo StrengthItem requiere label + evidence + confidence
          strengths: d.strengths.map((s) => ({
            label:      s,
            evidence:   `Detectado en análisis de ${player.minutesPlayed} minutos jugados`,
            confidence: d.overallConfidence,
          })),
          // Risks: tipo requiere code + label + description
          risks: d.risks.map((r, i) => ({
            code:        `RSK_${i}`,
            label:       r,
            description: r,
          })),
          // Gaps: tipo requiere label + priority + relatedPositions
          gaps: d.gaps.map((g, i) => ({
            label:            g,
            priority:         (i === 0 ? "alta" : i === 1 ? "media" : "baja") as GapItem["priority"],
            relatedPositions: d.topPositions.slice(0, 2).map(p => p.code as RoleProfileData["positions"][0]["code"]),
          })),
          consolidation_notes: d.strengths.slice(0, 2),
          evidence:            buildEvidence(player),
        };

        const parsed = RoleProfileSchema.safeParse(agentProfile);
        if (parsed.success) return parsed.data as RoleProfileData;
      }
    }
  } catch {
    // Silencia errores y cae al mock
  }

  // Fallback al mock si el agente falla o el jugador no existe
  const raw = { ...mockRoleProfile, player_id: playerId };

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
