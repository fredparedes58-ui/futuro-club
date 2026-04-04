/**
 * VITAS · usePlayerIntelligence hook
 * Orquesta el análisis completo de un jugador:
 *  1. Obtiene keyframes del video (Bunny Stream CDN thumbnails)
 *  2. Llama a /api/agents/video-intelligence (Claude Sonnet vision) via SSE streaming
 *  3. Devuelve el informe + similitud + proyección
 *
 * También expone findSimilarPlayers() client-side para uso sin video.
 */

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VideoIntelligenceOutput } from "@/agents/contracts";
import { findSimilarPlayers, type VSIMetrics, type SimilarityResult } from "@/services/real/similarityService";
import type { Player } from "@/services/real/playerService";

// ——— Tipos ——————————————————————————————————————————————————————

export interface IntelligenceState {
    step:     "idle" | "keyframes" | "analyzing" | "done" | "error";
    progress: number; // 0-100
  message:  string;
}

export interface IntelligenceResult {
    report:     VideoIntelligenceOutput | null;
    similarity: SimilarityResult | null;
    savedAt:    string | null;
}

// ——— Helper: obtener keyframes de Bunny CDN ————————————————————

interface KeyframeData {
    url:        string;
    timestamp:  number;
    frameIndex: number;
}

function getBunnyKeyframes(videoId: string, videoDuration?: number): KeyframeData[] {
    const bunnyBaseUrl = "https://vz-3b255b5d-ff8.b-cdn.net";
    const duration = videoDuration || 120;
    const numFrames = 8;

  return Array.from({ length: numFrames }, (_, i) => {
        const timestamp = Math.floor((duration / (numFrames + 1)) * (i + 1));
        return {
                url: `${bunnyBaseUrl}/${videoId}/thumbnails/thumbnail_${String(timestamp).padStart(4, "0")}.jpg`,
                timestamp,
                frameIndex: i,
        };
  });
}

// ——— Helper: leer SSE stream ——————————————————————————————————

async function readSSEStream(
    url: string,
    body: object,
    onProgress: (msg: string) => void
  ): Promise<VideoIntelligenceOutput> {
    const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
    });

  if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  if (!response.body) {
        throw new Error("No response body");
  }

  const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

  while (true) {
        const { done, value } = await reader.read();
        if (done) break;

      buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

      for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

          let event: {
                    status: string;
                    result?: VideoIntelligenceOutput;
                    error?: string;
                    chunk?: string;
          };

          try {
                    event = JSON.parse(jsonStr);
          } catch {
                    continue;
          }

          if (event.status === "analyzing") {
                    onProgress("Claude está analizando las imágenes...");
          } else if (event.status === "streaming") {
                    onProgress("Generando informe...");
          } else if (event.status === "done" && event.result) {
                    return event.result;
          } else if (event.status === "error") {
                    throw new Error(event.error ?? "Error en el análisis");
          }
      }
  }

  throw new Error("El stream terminó sin resultado");
}

// ——— Helper: VSI metrics ————————————————————————————————————————

function playerToVSI(player: Player): VSIMetrics {
    return {
          age:               player.age,
          height:            player.height ?? 175,
          weight:            player.weight ?? 70,
          position:          player.position,
          foot:              player.foot ?? "right",
          phvCategory:       player.phvCategory ?? "central",
          phvOffset:         player.phvOffset ?? 0,
          competitiveLevel:  player.competitiveLevel ?? "regional",
          technicalScore:    player.vsi ?? 50,
          tacticalScore:     player.vsi ?? 50,
          physicalScore:     player.vsi ?? 50,
          mentalScore:       player.vsi ?? 50,
    };
}

// ——— Hook principal ——————————————————————————————————————————————

export function usePlayerIntelligence(player: Player) {
    const queryClient = useQueryClient();

  const [state, setState] = useState<IntelligenceState>({
        step:     "idle",
        progress: 0,
        message:  "",
  });

  const [result, setResult] = useState<IntelligenceResult>({
        report:     null,
        similarity: null,
        savedAt:    null,
  });

  const runAnalysis = useCallback(async (videoId: string, videoDuration?: number) => {
        setState({ step: "keyframes", progress: 10, message: "Obteniendo keyframes del video..." });

                                      try {
                                              // 1. Obtener keyframes
          const keyframes = getBunnyKeyframes(videoId, videoDuration);
                                              const vsiMetrics = playerToVSI(player);

          setState({ step: "analyzing", progress: 30, message: "Enviando a VITAS Intelligence..." });

          // 2. Llamar al API con SSE streaming
          const analysisResult = await readSSEStream(
                    "/api/agents/video-intelligence",
            {
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
                        jerseyNumber:  player.jerseyNumber,
                        teamColor:     player.teamColor,
            },
                    (msg) => setState((prev) => ({ ...prev, message: msg, progress: Math.min(prev.progress + 5, 85) }))
                  );

          setState({ step: "analyzing", progress: 90, message: "Calculando similitud con pros..." });

          // 3. Similitud con jugadores profesionales
          let similarityData: SimilarityResult | null = null;
                                              try {
                                                        similarityData = await findSimilarPlayers(vsiMetrics);
                                              } catch {
                                                        // similitud es opcional
                                              }

          const savedAt = new Date().toISOString();

          setResult({
                    report:     analysisResult,
                    similarity: similarityData,
                    savedAt,
          });

          // Invalidar caché de análisis guardados
          queryClient.invalidateQueries({ queryKey: ["player-analyses", player.id] });

          setState({ step: "done", progress: 100, message: "Análisis completado" });

                                      } catch (err) {
                                              const msg = err instanceof Error ? err.message : "Error desconocido";
                                              setState({ step: "error", progress: 0, message: msg });
                                              throw err;
                                      }
  }, [player, queryClient]);

  const refetchSimilarity = useCallback(async () => {
        try {
                const vsiMetrics = playerToVSI(player);
                const similarityData = await findSimilarPlayers(vsiMetrics);
                setResult((prev) => ({ ...prev, similarity: similarityData }));
        } catch {
                // silencioso
        }
  }, [player]);

  const reset = useCallback(() => {
        setState({ step: "idle", progress: 0, message: "" });
        setResult({ report: null, similarity: null, savedAt: null });
  }, []);

  return {
        // Estado
        state,
        isLoading: state.step === "keyframes" || state.step === "analyzing",

        // Resultados
        analysisResult: result.report,
        similarityData: result.similarity,

        // Resultados
        analysisResult2: result.report,
        similarityData2: result.similarity,

        // Acciones
        runAnalysis,
        refetchSimilarity,
        reset,
  };
}

// ——— Hook para cargar análisis guardados ——————————————————————

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
