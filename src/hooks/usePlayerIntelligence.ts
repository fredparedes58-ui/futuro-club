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
// El agente video-intelligence emite:
//   event: progress\ndata: { step, percent }\n\n
//   event: complete\ndata: { report, videoId, timestamp }\n\n
//   event: error\ndata: { message }\n\n

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
        // Intenta JSON, si no, usa texto plano
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        let errMsg = `HTTP ${response.status}`;
        try { errMsg = (JSON.parse(errText) as { error?: string }).error ?? errMsg; } catch { /* ok */ }
        throw new Error(errMsg);
  }

  if (!response.body) {
        throw new Error("No response body");
  }

  const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

  try {
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Los eventos SSE están separados por \n\n
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;

          // Extraer línea "event:" y línea "data:"
          const eventMatch = chunk.match(/^event:\s*(.+)$/m);
          const dataMatch  = chunk.match(/^data:\s*(.+)$/m);

          const eventType = eventMatch?.[1]?.trim();
          const jsonStr   = dataMatch?.[1]?.trim();

          if (!jsonStr) continue;

          let data: Record<string, unknown>;
          try { data = JSON.parse(jsonStr) as Record<string, unknown>; }
          catch { continue; }

          if (eventType === "progress") {
            onProgress((data.step as string) ?? "Analizando...");
          } else if (eventType === "complete") {
            // { report: VideoIntelligenceOutput, videoId, timestamp }
            const report = data.report as VideoIntelligenceOutput | undefined;
            if (report) return report;
          } else if (eventType === "error") {
            throw new Error((data.message as string) ?? "Error en el análisis");
          }
        }
    }
  } finally {
    reader.releaseLock();
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

  const [isSimilarityLoading, setIsSimilarityLoading] = useState(false);

  // runAnalysis acepta objeto { videoId, videoDuration?, jerseyNumber?, teamColor? }
  const runAnalysis = useCallback(async (opts: {
        videoId:        string;
        videoDuration?: number;
        jerseyNumber?:  string;
        teamColor?:     string;
  }) => {
        const { videoId, videoDuration, jerseyNumber, teamColor } = opts;
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
                                      jerseyNumber,
                                      teamColor,
                        },
                        keyframes,
                        videoDuration,
                        vsiMetrics,
            },
                    (msg) => setState((prev) => ({ ...prev, message: msg, progress: Math.min(prev.progress + 5, 85) }))
                  );

          setState({ step: "analyzing", progress: 90, message: "Calculando similitud con pros..." });

          // 3. Similitud con jugadores profesionales
          let similarityData: SimilarityResult | null = null;
          setIsSimilarityLoading(true);
                                              try {
                                                        similarityData = await findSimilarPlayers(vsiMetrics);
                                              } catch {
                                                        // similitud es opcional
                                              } finally {
                                                        setIsSimilarityLoading(false);
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
        setIsSimilarityLoading(true);
        try {
                const vsiMetrics = playerToVSI(player);
                const similarityData = await findSimilarPlayers(vsiMetrics);
                setResult((prev) => ({ ...prev, similarity: similarityData }));
        } catch {
                // silencioso
        } finally {
                setIsSimilarityLoading(false);
        }
  }, [player]);

  const reset = useCallback(() => {
        setState({ step: "idle", progress: 0, message: "" });
        setResult({ report: null, similarity: null, savedAt: null });
  }, []);

  const isAnalyzing = state.step === "keyframes" || state.step === "analyzing";

  return {
        // Estado
        state,
        isLoading:          isAnalyzing,
        isAnalyzing,
        isSimilarityLoading,

        // Resultados
        analysisResult: result.report,
        similarityData: result.similarity,

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
