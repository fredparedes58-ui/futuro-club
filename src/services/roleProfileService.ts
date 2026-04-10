import { z } from "zod";
import { mockRoleProfile, type RoleProfileData, type PositionFit, type ArchetypeFit, type EvidenceIndicator, type GapItem } from "@/lib/roleProfileData";
import type { Player } from "@/services/real/playerService";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

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
 * Lee los análisis de video del jugador (Supabase) y genera el Role Profile
 * alimentado con datos reales de video. Si no hay videos analizados, retorna null.
 */
export async function fetchRoleProfile(playerId: string): Promise<RoleProfileData | null> {
  const { PlayerService } = await import("@/services/real/playerService");
  const player = PlayerService.getById(playerId);
  if (!player) return null;

  // 1. Buscar análisis de video guardados en Supabase
  let videoAnalyses: Array<{ report: Record<string, unknown>; created_at: string; video_id?: string }> = [];
  if (SUPABASE_CONFIGURED) {
    try {
      const { data } = await supabase
        .from("player_analyses")
        .select("report, created_at, video_id")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data && data.length > 0) videoAnalyses = data;
    } catch {
      // Supabase no disponible
    }
  }

  // Sin análisis de video → no hay datos reales para generar el perfil
  if (videoAnalyses.length === 0) {
    console.warn("[roleProfileService] No video analyses found for player", playerId);
    return null;
  }

  // 2. Extraer datos consolidados de los análisis de video
  const latestReport = videoAnalyses[0].report as Record<string, unknown>;
  const estadoActual = latestReport.estadoActual as Record<string, unknown> | undefined;
  const dimensiones = (estadoActual?.dimensiones ?? {}) as Record<string, { score: number; observacion: string }>;
  const adnFutbolistico = latestReport.adnFutbolistico as Record<string, unknown> | undefined;
  const planDesarrollo = latestReport.planDesarrollo as Record<string, unknown> | undefined;
  const jugadorReferencia = latestReport.jugadorReferencia as Record<string, unknown> | undefined;
  const proyeccionCarrera = latestReport.proyeccionCarrera as Record<string, unknown> | undefined;

  // 3. Intentar generar Role Profile con el agente AI + datos de video
  try {
    const { AgentService } = await import("@/services/real/agentService");

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
        // Inyectar resumen de análisis de video para que el agente lo use
        videoAnalysisSummary: {
          totalAnalyses: videoAnalyses.length,
          latestDimensions: dimensiones,
          strengths: (estadoActual?.fortalezasPrimarias as string[]) ?? [],
          areasDesarrollo: (estadoActual?.areasDesarrollo as string[]) ?? [],
          nivelActual: (estadoActual?.nivelActual as string) ?? "desarrollo",
          arquetipoTactico: (adnFutbolistico?.arquetipoTactico as string) ?? "",
          estiloJuego: (adnFutbolistico?.estiloJuego as string) ?? "",
        },
      },
    });

    if (res.success && res.data) {
      const d = res.data;

      // Construir evidencia desde dimensiones del video (no métricas manuales)
      const buildVideoEvidence = (): EvidenceIndicator[] => {
        const dimMap: Array<{ key: string; label: string; phase: EvidenceIndicator["phase_of_play"] }> = [
          { key: "inteligenciaTactica", label: "Inteligencia táctica",  phase: "in_possession" },
          { key: "tecnicaConBalon",     label: "Técnica con balón",     phase: "in_possession" },
          { key: "velocidadDecision",   label: "Velocidad de decisión", phase: "in_possession" },
          { key: "capacidadFisica",     label: "Capacidad física",      phase: "transition" },
          { key: "liderazgoPresencia",  label: "Liderazgo y presencia", phase: "out_of_possession" },
          { key: "eficaciaCompetitiva", label: "Eficacia competitiva",  phase: "in_possession" },
        ];
        return dimMap.map((m) => {
          const dim = dimensiones[m.key];
          const score = dim?.score ?? 5;
          const norm = score / 10;
          return {
            indicator: m.key,
            label: m.label,
            raw_value: score,
            normalized: Math.round(norm * 100),
            reliability: 0.8,
            phase_of_play: m.phase,
            impact: norm >= 0.7 ? "positivo" as const : norm >= 0.45 ? "neutro" as const : "negativo" as const,
            contribution: Math.round(norm * 10) / 10,
            positions_impacted: d.topPositions.slice(0, 2).map(p => p.code),
            archetypes_impacted: d.topArchetypes.slice(0, 1).map(a => a.code),
            explanation: dim?.observacion ?? `${m.label}: ${score}/10`,
          };
        });
      };

      const sampleTier: RoleProfileData["sample_tier"] =
        videoAnalyses.length >= 4 ? "platinum" :
        videoAnalyses.length >= 3 ? "gold"     :
        videoAnalyses.length >= 2 ? "silver"   : "bronze";

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
          "0_6m":   { tactical: Math.min(100, d.capabilities.tactical.p6m),      technical: Math.min(100, d.capabilities.technical.p6m),      physical: Math.min(100, d.capabilities.physical.p6m) },
          "6_18m":  { tactical: Math.min(100, d.capabilities.tactical.p18m),     technical: Math.min(100, d.capabilities.technical.p18m),     physical: Math.min(100, d.capabilities.physical.p18m) },
          "18_36m": { tactical: Math.min(100, d.capabilities.tactical.p18m + 3), technical: Math.min(100, d.capabilities.technical.p18m + 3), physical: Math.min(100, d.capabilities.physical.p18m + 2) },
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
        strengths: d.strengths.map((s) => ({
          label:      s,
          evidence:   `Detectado en análisis de ${videoAnalyses.length} video(s)`,
          confidence: d.overallConfidence,
        })),
        risks: d.risks.map((r, i) => ({
          code:        `RSK_${i}`,
          label:       r,
          description: r,
        })),
        gaps: d.gaps.map((g, i) => ({
          label:            g,
          priority:         (i === 0 ? "alta" : i === 1 ? "media" : "baja") as GapItem["priority"],
          relatedPositions: d.topPositions.slice(0, 2).map(p => p.code as RoleProfileData["positions"][0]["code"]),
        })),
        consolidation_notes: d.strengths.slice(0, 2),
        evidence:            buildVideoEvidence(),
      };

      const parsed = RoleProfileSchema.safeParse(agentProfile);
      if (parsed.success) return parsed.data as RoleProfileData;
    }
  } catch (err) {
    console.error("[roleProfileService] Agent error:", err);
  }

  // Agente falló pero hay datos de video → construir perfil básico desde video
  const dim = dimensiones;
  const tacticalScore = (dim.inteligenciaTactica?.score ?? 5) * 10;
  const technicalScore = (dim.tecnicaConBalon?.score ?? 5) * 10;
  const physicalScore = (dim.capacidadFisica?.score ?? 5) * 10;

  const videoBasedProfile: RoleProfileData = {
    run_id: `run_video_${Date.now()}`,
    player_id: playerId,
    player_name: player.name,
    player_age: player.age,
    dominant_foot: player.foot === "right" ? "derecho" : player.foot === "left" ? "izquierdo" : "ambidiestro",
    minutes_played: player.minutesPlayed,
    competitive_level: player.competitiveLevel,
    sample_tier: videoAnalyses.length >= 3 ? "gold" : videoAnalyses.length >= 2 ? "silver" : "bronze",
    overall_confidence: 0.65,
    current: { tactical: tacticalScore, technical: technicalScore, physical: physicalScore },
    projections: {
      "0_6m":   { tactical: Math.min(100, tacticalScore + 2),  technical: Math.min(100, technicalScore + 2),  physical: Math.min(100, physicalScore + 3) },
      "6_18m":  { tactical: Math.min(100, tacticalScore + 5),  technical: Math.min(100, technicalScore + 5),  physical: Math.min(100, physicalScore + 7) },
      "18_36m": { tactical: Math.min(100, tacticalScore + 8),  technical: Math.min(100, technicalScore + 7),  physical: Math.min(100, physicalScore + 10) },
    },
    identity: {
      dominant: technicalScore >= tacticalScore && technicalScore >= physicalScore ? "tecnico"
        : tacticalScore >= physicalScore ? "defensivo" : "fisico",
      distribution: {
        tecnico: technicalScore / 100,
        ofensivo: (dim.eficaciaCompetitiva?.score ?? 5) / 10,
        defensivo: (dim.inteligenciaTactica?.score ?? 5) / 10,
        fisico: physicalScore / 100,
        mixto: 0,
      },
      explanation: `Perfil generado desde ${videoAnalyses.length} análisis de video.`,
    },
    positions: [
      { code: player.position.includes("Portero") ? "GK" : player.position.includes("Central") ? "RCB" : player.position.includes("Lateral") ? "RB" : player.position.includes("Pivote") ? "DM" : player.position.includes("Mediocent") ? "RCM" : player.position.includes("Extremo") ? "RW" : player.position.includes("Delantero") ? "ST" : "RCM",
        prob: 0.5, score: Math.max(tacticalScore, technicalScore), confidence: 0.65, reason: "Posición registrada — pendiente análisis completo con agente AI" },
    ],
    archetypes: [],
    strengths: ((estadoActual?.fortalezasPrimarias as string[]) ?? []).map(s => ({
      label: s, evidence: "Observado en análisis de video", confidence: 0.7,
    })),
    risks: [{ code: "AGENT_UNAVAILABLE", label: "Perfil parcial", description: "El agente AI no pudo procesar los datos. Este perfil se basa únicamente en las dimensiones del análisis de video." }],
    gaps: ((estadoActual?.areasDesarrollo as string[]) ?? []).map((g, i) => ({
      label: g,
      priority: (i === 0 ? "alta" : "media") as GapItem["priority"],
      relatedPositions: [],
    })),
    consolidation_notes: [`Perfil basado en ${videoAnalyses.length} análisis de video. Para mayor precisión, el agente AI debe estar disponible.`],
    evidence: Object.entries(dimensiones).map(([key, dim]) => ({
      indicator: key,
      label: dim.observacion?.slice(0, 50) ?? key,
      raw_value: dim.score,
      normalized: Math.round((dim.score / 10) * 100),
      reliability: 0.75,
      phase_of_play: "in_possession" as const,
      impact: dim.score >= 7 ? "positivo" as const : dim.score >= 4.5 ? "neutro" as const : "negativo" as const,
      contribution: Math.round(dim.score) / 10,
      positions_impacted: [],
      archetypes_impacted: [],
      explanation: dim.observacion ?? `${key}: ${dim.score}/10`,
    })),
  };

  const parsed = RoleProfileSchema.safeParse(videoBasedProfile);
  if (parsed.success) return parsed.data as RoleProfileData;

  console.warn("[roleProfileService] Could not build profile from video data");
  return null;
}

/**
 * GET /api/player/:id/position-fit
 */
export async function fetchPositionFit(playerId: string): Promise<PositionFit[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile?.positions ?? [];
}

/**
 * GET /api/player/:id/archetypes
 */
export async function fetchArchetypes(playerId: string): Promise<ArchetypeFit[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile?.archetypes ?? [];
}

/**
 * GET /api/player/:id/role-profile/audit/:run_id
 */
export async function fetchAuditIndicators(playerId: string, _runId?: string): Promise<EvidenceIndicator[]> {
  const profile = await fetchRoleProfile(playerId);
  return profile?.evidence ?? [];
}
