/**
 * VITAS · useTeamIntelligence hook
 * Orquesta el análisis táctico de equipo:
 *  1. Envía video a Gemini (team-observation) para observación colectiva
 *  2. Llama a Claude (team-intelligence) via SSE streaming
 *  3. Enriquece con datos YOLO opcionales
 *  4. Devuelve TeamIntelligenceOutput
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TeamIntelligenceOutput } from "@/agents/contracts";
import { isLocalSrc, readVideoAsBase64, extractKeyframesFromVideo, getOptimalFrameCount } from "@/lib/localVideoUtils";
import type { Track } from "@/lib/yolo/types";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

// ——— Tipos ——————————————————————————————————————————————————————

export interface TeamIntelligenceState {
  step:     "idle" | "keyframes" | "analyzing" | "done" | "error";
  progress: number;
  message:  string;
}

// ——— Helper: leer SSE stream ————————————————————————————————————

async function readSSEStream(
  url: string,
  body: object,
  onProgress: (msg: string) => void
): Promise<TeamIntelligenceOutput> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    let errMsg = `HTTP ${response.status}`;
    try { errMsg = (JSON.parse(errText) as { error?: string }).error ?? errMsg; } catch { /* ok */ }
    throw new Error(errMsg);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
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
          const report = data.report as TeamIntelligenceOutput | undefined;
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

// ——— Hook principal ——————————————————————————————————————————————

export function useTeamIntelligence() {
  const [state, setState] = useState<TeamIntelligenceState>({
    step: "idle", progress: 0, message: "",
  });

  const [result, setResult] = useState<TeamIntelligenceOutput | null>(null);

  const runAnalysis = useCallback(async (opts: {
    videoId:          string;
    videoDuration?:   number;
    teamColor:        string;
    opponentColor?:   string;
    competitiveLevel?: string;
    localVideoSrc?:   string;
    yoloTracks?:      Track[];
  }) => {
    const { videoId, videoDuration, teamColor, opponentColor, competitiveLevel, localVideoSrc, yoloTracks } = opts;
    setState({ step: "analyzing", progress: 10, message: "Preparando video para análisis de equipo..." });

    try {
      let geminiObservations: Record<string, unknown> | null = null;
      let keyframes: Array<{ url: string; timestamp: number; frameIndex: number }> = [];

      // 1. Intentar Gemini con video completo
      if (localVideoSrc && isLocalSrc(localVideoSrc)) {
        setState({ step: "analyzing", progress: 15, message: "Preparando video..." });
        try {
          const videoData = await readVideoAsBase64(localVideoSrc);
          if (videoData) {
            setState({ step: "analyzing", progress: 22, message: "Analizando equipo con Gemini..." });
            const geminiRes = await fetch("/api/agents/team-observation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                videoBase64: videoData.base64,
                mediaType: videoData.mediaType,
                teamContext: {
                  teamColor,
                  opponentColor,
                  competitiveLevel: competitiveLevel || "formativo",
                },
              }),
            });

            if (geminiRes.ok) {
              const geminiData = await geminiRes.json() as { observations?: Record<string, unknown> };
              if (geminiData.observations) {
                geminiObservations = geminiData.observations;
                console.log("[Team Intelligence] Gemini observaciones recibidas");
              }
            } else {
              console.warn("[Team Intelligence] Gemini no disponible, usando fallback frames");
            }
          }
        } catch (geminiErr) {
          console.warn("[Team Intelligence] Error con Gemini:", geminiErr);
        }

        // Fallback: extraer frames si Gemini falló
        if (!geminiObservations) {
          setState({ step: "keyframes", progress: 20, message: "Extrayendo fotogramas..." });
          const frameCount = getOptimalFrameCount(videoDuration || 120);
          keyframes = await extractKeyframesFromVideo(localVideoSrc, videoDuration || 120, frameCount);
          if (keyframes.length === 0) throw new Error("No se pudieron extraer frames del video");

          const payloadEstimate = JSON.stringify(keyframes).length;
          if (payloadEstimate > 4_000_000) {
            keyframes = keyframes.filter((_, i) => i % 2 === 0);
          }
        }
      }

      // 2. Preparar datos YOLO si están disponibles
      const yoloTrackData = yoloTracks?.map(t => ({
        trackId:     t.id,
        maxSpeedMs:  t.speedMs,
        avgSpeedMs:  t.smoothSpeedMs,
        distanceM:   t.distanceM,
        sprintCount: t.sprintCount,
        duelsWon:    0,
        duelsLost:   0,
        positions:   t.positions.filter((_, i) => i % 8 === 0).map(p => ({
          fx: Math.round(p.fx * 10) / 10,
          fy: Math.round(p.fy * 10) / 10,
        })),
      })) ?? null;

      setState({ step: "analyzing", progress: 35, message: geminiObservations ? "Generando informe táctico con Claude..." : "Enviando a VITAS Intelligence..." });

      // 3. Llamar a Claude con SSE
      const analysisResult = await readSSEStream(
        "/api/agents/team-intelligence",
        {
          teamContext: { teamColor, opponentColor, competitiveLevel },
          geminiObservations,
          keyframes,
          videoId,
          yoloTrackData,
        },
        (msg) => setState(prev => ({ ...prev, message: msg, progress: Math.min(prev.progress + 5, 85) }))
      );

      // 4. Enriquecer con heatmap positions de YOLO
      if (yoloTrackData && analysisResult.jugadores) {
        for (let i = 0; i < analysisResult.jugadores.length && i < yoloTrackData.length; i++) {
          if (yoloTrackData[i].positions.length > 0) {
            analysisResult.jugadores[i].heatmapPositions = yoloTrackData[i].positions;
          }
        }
      }

      // 5. Guardar en Supabase
      const savedAt = new Date().toISOString();
      if (SUPABASE_CONFIGURED) {
        try {
          await supabase.from("team_analyses").insert({
            video_id:   videoId,
            report:     analysisResult,
            created_at: savedAt,
          });
        } catch (saveErr) {
          console.warn("[Team Intelligence] No se pudo guardar en Supabase:", saveErr);
        }
      }

      setResult(analysisResult);
      setState({ step: "done", progress: 100, message: "Análisis de equipo completado" });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setState({ step: "error", progress: 0, message: msg });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ step: "idle", progress: 0, message: "" });
    setResult(null);
  }, []);

  const isAnalyzing = state.step === "keyframes" || state.step === "analyzing";

  return {
    state,
    isLoading: isAnalyzing,
    isAnalyzing,
    analysisResult: result,
    runAnalysis,
    reset,
  };
}

// ——— Hook para cargar análisis de equipo guardados ——————————————

export function useSavedTeamAnalyses(videoId: string) {
  return useQuery({
    queryKey: ["team-analyses", videoId],
    queryFn:  async () => {
      if (!SUPABASE_CONFIGURED) return [];
      const { data, error } = await supabase
        .from("team_analyses")
        .select("*")
        .eq("video_id", videoId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled:   !!videoId && SUPABASE_CONFIGURED,
    staleTime: 1000 * 60 * 5,
  });
}
