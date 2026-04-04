/**
 * VITAS · usePlayerIntelligence hook
 * Orquesta el análisis completo de un jugador:
 *   1. Obtiene keyframes del video (Bunny Stream CDN thumbnails)
 *   2. Llama a /api/agents/video-intelligence (Claude Sonnet vision)
 *   3. Devuelve el informe + similitud + proyección
 *
 * También expone findSimilarPlayers() client-side para uso sin video.
 */

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type VideoIntelligenceOutput } from "@/agents/contracts";
import { findSimilarPlayers, type VSIMetrics, type SimilarityResult } from "@/services/real/similarityService";
import type { Player } from "@/services/real/playerService";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface IntelligenceState {
  step:     "idle" | "keyframes" | "analyzing" | "done" | "error";
  progress: number;  // 0-100
  message:  string;
}

export interface IntelligenceResult {
  report:      VideoIntelligenceOutput | null;
  similarity:  SimilarityResult | null;
  savedAt:     string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Genera URLs de keyframes desde un video de Bunny Stream.
 * Bunny Stream thumbnail API: /thumbnail?time=T (T en segundos)
 */
function generateKeyframeUrls(videoId: string, duration: number, count = 8): string[] {
  const cdnHostname = import.meta.env.VITE_BUNNY_CDN_HOSTNAME;
  if (!cdnHostname || !videoId) return [];

  const interval = Math.max(1, Math.floor(duration / (count + 1)));
  return Array.from({ length: count }, (_, i) => {
    const t = interval * (i + 1);
    return `https://${cdnHostname}/${videoId}/thumbnail.jpg?time=${t}`;
  });
}

/** Convierte métricas Player a VSIMetrics */
function playerToVSI(player: Player): VSIMetrics {
  return {
    speed:     player.metrics.speed,
    shooting:  player.metrics.shooting,
    vision:    player.metrics.vision,
    technique: player.metrics.technique,
    defending: player.metrics.defending,
    stamina:   player.metrics.stamina,
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePlayerIntelligence(player: Player) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<IntelligenceState>({
    step: "idle", progress: 0, message: "",
  });

  const setStep = (step: IntelligenceState["step"], progress: number, message: string) =>
    setState({ step, progress, message });

  // ── Similitud solo (sin video) ───────────────────────────────────────────
  const {
    data:      similarityData,
    isLoading: isSimilarityLoading,
    refetch:   refetchSimilarity,
  } = useQuery({
    queryKey:  ["similarity", player.id],
    queryFn:   () => findSimilarPlayers(playerToVSI(player), player.position),
    staleTime: 1000 * 60 * 30, // 30 min
    enabled:   false,           // manual trigger
  });

  // ── Análisis con video ───────────────────────────────────────────────────
  const { mutateAsync: runAnalysis, isPending: isAnalyzing, data: analysisResult } = useMutation({
    mutationFn: async ({
      videoId,
      videoDuration,
      jerseyNumber,
      teamColor,
    }: {
      videoId:       string;
      videoDuration: number;
      jerseyNumber?: string;
      teamColor?:    string;
    }): Promise<VideoIntelligenceOutput> => {
      // 1. Generar keyframes
      setStep("keyframes", 15, "Extrayendo fotogramas del video...");
      const keyframes = generateKeyframeUrls(videoId, videoDuration);

      if (keyframes.length === 0) {
        throw new Error("No se pudieron generar keyframes — verifica VITE_BUNNY_CDN_HOSTNAME");
      }

      // 2. Llamar al agente
      setStep("analyzing", 35, "Analizando con VITAS Intelligence...");

      const vsiMetrics = playerToVSI(player);

      const res = await fetch("/api/agents/video-intelligence", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          playerId:      player.id,
          videoId,
          playerContext: {
            name:             player.name,
            age:              player.age,
            position:         player.position,
            foot:             player.foot,
            height:           player.height,
            weight:           player.weight,
            currentVSI:       player.vsi,
            phvCategory:      player.phvCategory,
            phvOffset:        player.phvOffset,
            competitiveLevel: player.competitiveLevel,
          },
          keyframes,
          videoDuration,
          vsiMetrics,
          jerseyNumber,
          teamColor,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      setStep("analyzing", 75, "Procesando informe...");
      const data = await res.json();

      setStep("done", 100, "¡Análisis completado!");

      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ["player-analyses", player.id] });
      queryClient.invalidateQueries({ queryKey: ["similarity", player.id] });

      return data.report as VideoIntelligenceOutput;
    },
    onError: (err) => {
      setStep("error", 0, err instanceof Error ? err.message : "Error desconocido");
    },
  });

  const reset = useCallback(() => {
    setStep("idle", 0, "");
  }, []);

  return {
    // Estado UI
    state,
    isAnalyzing,
    isSimilarityLoading,

    // Resultados
    analysisResult,
    similarityData,

    // Acciones
    runAnalysis,
    refetchSimilarity,
    reset,
  };
}

// ─── Hook para cargar análisis guardados ──────────────────────────────────────

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export function useSavedAnalyses(playerId: string) {
  return useQuery({
    queryKey:  ["player-analyses", playerId],
    queryFn:   async () => {
      if (!SUPABASE_CONFIGURED) return [];
      const { data, error } = await supabase
        .from("player_analyses")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled:   !!playerId && SUPABASE_CONFIGURED,
    staleTime: 1000 * 60 * 5,
  });
}
