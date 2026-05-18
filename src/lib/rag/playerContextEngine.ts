/**
 * VITAS · Player Context Engine (IA → 8/10)
 *
 * Retrieval-Augmented Generation for player evaluations.
 * Before the AI evaluates a player, this engine retrieves relevant
 * historical context from the knowledge base:
 *
 *   1. Previous evaluations and how scores changed
 *   2. Tracking session summaries
 *   3. Coach notes and observations
 *   4. Injury history
 *   5. Milestones and achievements
 *
 * The AI then evaluates WITH context instead of "from scratch" each time.
 * This produces evaluations that improve over time as more data accumulates.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

/* ── Types ─────────────────────────────────────────────────────── */

export interface KnowledgeChunk {
  id: string;
  chunkType: ChunkType;
  content: string;
  metadata: Record<string, unknown>;
  sourceDate: string | null;
  similarity?: number;
}

export type ChunkType =
  | "evaluation"
  | "tracking_session"
  | "coach_note"
  | "injury"
  | "milestone"
  | "training"
  | "match_event";

export interface PlayerContext {
  playerId: string;
  /** Total chunks available for this player */
  totalChunks: number;
  /** Timeline of events (most recent first) */
  timeline: KnowledgeChunk[];
  /** Previous VSI scores */
  vsiHistory: { date: string; vsi: number; confidence: number }[];
  /** Trend: improving, stable, declining, insufficient_data */
  trend: string;
  /** Compiled context string ready for AI injection */
  compiledContext: string;
  /** Context quality (0-100) — more data = higher quality */
  contextQuality: number;
}

export interface AddChunkInput {
  playerId: string;
  orgId?: string;
  chunkType: ChunkType;
  content: string;
  metadata?: Record<string, unknown>;
  sourceDate?: string;
}

/* ── Context Engine ────────────────────────────────────────────── */

export class PlayerContextEngine {
  /**
   * Get full context for a player before AI evaluation.
   * Returns compiled context string + quality metrics.
   */
  async getContext(playerId: string, maxChunks: number = 15): Promise<PlayerContext> {
    // Get timeline (chronological, no embedding needed)
    const timeline = await this.getTimeline(playerId, maxChunks);

    // Get VSI history from evaluation_history table
    const vsiHistory = await this.getVsiHistory(playerId);

    // Calculate trend
    const trend = this.calculateTrend(vsiHistory);

    // Calculate context quality
    const contextQuality = this.calculateQuality(timeline, vsiHistory);

    // Compile into a context string for AI
    const compiledContext = this.compileContext(playerId, timeline, vsiHistory, trend);

    return {
      playerId,
      totalChunks: timeline.length,
      timeline,
      vsiHistory,
      trend,
      compiledContext,
      contextQuality,
    };
  }

  /** Retrieve chronological timeline for a player */
  async getTimeline(playerId: string, limit: number = 15): Promise<KnowledgeChunk[]> {
    if (!SUPABASE_CONFIGURED) return [];

    try {
      const { data, error } = await supabase.rpc("get_player_timeline", {
        p_player_id: playerId,
        p_limit: limit,
      });

      if (error) {
        console.warn("[RAG] Timeline fetch error:", error.message);
        return [];
      }

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        chunkType: row.chunk_type as ChunkType,
        content: row.content as string,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        sourceDate: row.source_date as string | null,
      }));
    } catch {
      return [];
    }
  }

  /** Get VSI score history for a player */
  async getVsiHistory(playerId: string): Promise<{ date: string; vsi: number; confidence: number }[]> {
    if (!SUPABASE_CONFIGURED) return [];

    try {
      const { data, error } = await supabase
        .from("evaluation_history")
        .select("vsi, confidence_score, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: true })
        .limit(20);

      if (error) return [];

      return (data ?? []).map((row: Record<string, unknown>) => ({
        date: row.created_at as string,
        vsi: Number(row.vsi),
        confidence: Number(row.confidence_score ?? 0),
      }));
    } catch {
      return [];
    }
  }

  /** Add a knowledge chunk for a player */
  async addChunk(input: AddChunkInput): Promise<boolean> {
    if (!SUPABASE_CONFIGURED) return false;

    try {
      const { error } = await supabase.from("player_knowledge").insert({
        player_id: input.playerId,
        org_id: input.orgId ?? null,
        chunk_type: input.chunkType,
        content: input.content,
        metadata: input.metadata ?? {},
        source_date: input.sourceDate ?? new Date().toISOString(),
      });

      if (error) {
        console.error("[RAG] Add chunk error:", error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Auto-generate knowledge chunk from an AI evaluation result */
  async recordEvaluation(
    playerId: string,
    orgId: string | undefined,
    evalResult: {
      vsi: number;
      confidence: number;
      dimensionsEvaluated: string[];
      dimensionsTotal: number;
      summary: string;
      agentName: string;
      hadTracking: boolean;
      hadVideo: boolean;
    },
  ): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

    // 1. Record in evaluation_history
    await supabase.from("evaluation_history").insert({
      player_id: playerId,
      org_id: orgId ?? null,
      vsi: evalResult.vsi,
      confidence_score: evalResult.confidence,
      dimensions_evaluated: evalResult.dimensionsEvaluated.length,
      dimensions_total: evalResult.dimensionsTotal,
      agent_name: evalResult.agentName,
      model_used: "claude-sonnet-4-20250514",
      had_tracking_data: evalResult.hadTracking,
      had_video_data: evalResult.hadVideo,
      report_summary: evalResult.summary,
    });

    // 2. Add knowledge chunk
    await this.addChunk({
      playerId,
      orgId,
      chunkType: "evaluation",
      content: `Evaluación IA (${new Date().toLocaleDateString("es-ES")}): VSI ${evalResult.vsi}, confianza ${evalResult.confidence}%. ${evalResult.summary}`,
      metadata: {
        vsi: evalResult.vsi,
        confidence: evalResult.confidence,
        dimensions: evalResult.dimensionsEvaluated,
        agent: evalResult.agentName,
      },
    });
  }

  /** Auto-generate knowledge chunk from a tracking session */
  async recordTrackingSession(
    playerId: string,
    orgId: string | undefined,
    session: {
      durationMs: number;
      maxSpeed: number;
      avgSpeed: number;
      distanceCovered: number;
      sprintCount: number;
      intensityZones: { walk: number; jog: number; run: number; sprint: number };
    },
  ): Promise<void> {
    const durationMin = Math.round(session.durationMs / 60000);
    const content = [
      `Sesión tracking (${new Date().toLocaleDateString("es-ES")}): ${durationMin} min.`,
      `Velocidad máx: ${session.maxSpeed.toFixed(1)} m/s (${(session.maxSpeed * 3.6).toFixed(1)} km/h).`,
      `Velocidad media: ${session.avgSpeed.toFixed(1)} m/s.`,
      `Distancia: ${session.distanceCovered}m. Sprints: ${session.sprintCount}.`,
      `Zonas: caminar ${session.intensityZones.walk}%, trote ${session.intensityZones.jog}%, carrera ${session.intensityZones.run}%, sprint ${session.intensityZones.sprint}%.`,
    ].join(" ");

    await this.addChunk({
      playerId,
      orgId,
      chunkType: "tracking_session",
      content,
      metadata: session,
    });
  }

  /** Add a manual coach observation */
  async addCoachNote(
    playerId: string,
    orgId: string | undefined,
    note: string,
    coachName?: string,
  ): Promise<boolean> {
    return this.addChunk({
      playerId,
      orgId,
      chunkType: "coach_note",
      content: `Nota del entrenador${coachName ? ` (${coachName})` : ""}: ${note}`,
      metadata: { coach: coachName },
    });
  }

  /* ── Private helpers ─────────────────────────────────────────── */

  private calculateTrend(
    history: { date: string; vsi: number }[],
  ): string {
    if (history.length < 3) return "insufficient_data";

    const recent = history.slice(-3);
    const older = history.slice(0, -3);

    if (older.length === 0) return "insufficient_data";

    const recentAvg = recent.reduce((s, h) => s + h.vsi, 0) / recent.length;
    const olderAvg = older.reduce((s, h) => s + h.vsi, 0) / older.length;
    const diff = recentAvg - olderAvg;

    if (diff > 3) return "improving";
    if (diff < -3) return "declining";
    return "stable";
  }

  private calculateQuality(
    timeline: KnowledgeChunk[],
    history: { vsi: number }[],
  ): number {
    let quality = 0;

    // Has any data at all
    if (timeline.length > 0) quality += 20;

    // Has evaluations
    const evals = timeline.filter(c => c.chunkType === "evaluation");
    if (evals.length >= 1) quality += 15;
    if (evals.length >= 3) quality += 10;

    // Has tracking data
    const tracking = timeline.filter(c => c.chunkType === "tracking_session");
    if (tracking.length >= 1) quality += 15;
    if (tracking.length >= 3) quality += 10;

    // Has coach notes
    if (timeline.some(c => c.chunkType === "coach_note")) quality += 10;

    // Has VSI history for trend
    if (history.length >= 3) quality += 10;
    if (history.length >= 5) quality += 10;

    return Math.min(100, quality);
  }

  private compileContext(
    playerId: string,
    timeline: KnowledgeChunk[],
    vsiHistory: { date: string; vsi: number; confidence: number }[],
    trend: string,
  ): string {
    if (timeline.length === 0 && vsiHistory.length === 0) {
      return "CONTEXTO: Primera evaluación de este jugador. Sin historial previo.";
    }

    const sections: string[] = [];

    // VSI evolution
    if (vsiHistory.length > 0) {
      const latest = vsiHistory[vsiHistory.length - 1];
      const first = vsiHistory[0];
      sections.push(
        `HISTORIAL VSI: ${vsiHistory.length} evaluaciones previas. ` +
        `Primera: ${first.vsi} (${new Date(first.date).toLocaleDateString("es-ES")}). ` +
        `Última: ${latest.vsi} (${new Date(latest.date).toLocaleDateString("es-ES")}). ` +
        `Tendencia: ${trend === "improving" ? "MEJORANDO" : trend === "declining" ? "BAJANDO" : trend === "stable" ? "ESTABLE" : "DATOS INSUFICIENTES"}.`
      );
    }

    // Recent evaluations
    const recentEvals = timeline
      .filter(c => c.chunkType === "evaluation")
      .slice(0, 3);
    if (recentEvals.length > 0) {
      sections.push("EVALUACIONES RECIENTES:");
      for (const e of recentEvals) {
        sections.push(`  - ${e.content}`);
      }
    }

    // Tracking sessions
    const trackingSessions = timeline
      .filter(c => c.chunkType === "tracking_session")
      .slice(0, 3);
    if (trackingSessions.length > 0) {
      sections.push("DATOS DE TRACKING:");
      for (const t of trackingSessions) {
        sections.push(`  - ${t.content}`);
      }
    }

    // Coach notes
    const notes = timeline
      .filter(c => c.chunkType === "coach_note")
      .slice(0, 3);
    if (notes.length > 0) {
      sections.push("NOTAS DEL ENTRENADOR:");
      for (const n of notes) {
        sections.push(`  - ${n.content}`);
      }
    }

    // Injuries
    const injuries = timeline.filter(c => c.chunkType === "injury");
    if (injuries.length > 0) {
      sections.push("HISTORIAL LESIONES:");
      for (const inj of injuries) {
        sections.push(`  - ${inj.content}`);
      }
    }

    return sections.join("\n");
  }
}

/** Singleton instance */
export const playerContextEngine = new PlayerContextEngine();
