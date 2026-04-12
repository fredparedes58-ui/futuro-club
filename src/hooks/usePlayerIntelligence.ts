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
import { getAuthHeaders } from "@/lib/apiAuth";
import type { VideoIntelligenceOutput } from "@/agents/contracts";
import { findSimilarPlayers, type VSIMetrics, type SimilarityResult } from "@/services/real/similarityService";
import { PlayerService, type Player } from "@/services/real/playerService";
import { extractKeyframesFromVideo, isLocalSrc, readVideoAsBase64, getOptimalFrameCount } from "@/lib/localVideoUtils";
import { computeKPIs, generateMonthlyChallenges } from "@/lib/kpiProjections";
import type { PhysicalMetrics, FieldPosition } from "@/lib/yolo/types";

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
    const bunnyBaseUrl = `https://${import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "vz-b1fc8d2f-960.b-cdn.net"}`;
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
          headers: await getAuthHeaders(),
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
    // Extract from player.metrics (the actual nested object on Player type)
    const m = player.metrics;
    if (m) {
      return {
        speed:     m.speed     ?? 50,
        shooting:  m.shooting  ?? 50,
        vision:    m.vision    ?? 50,
        technique: m.technique ?? 50,
        defending: m.defending ?? 50,
        stamina:   m.stamina   ?? 50,
      };
    }
    // Fallback if no metrics available — return null-ish to signal "no real data"
    // Use VSI as base but add position-based variation to avoid flat profiles
    const base = player.vsi ?? 50;
    const pos = player.position?.toUpperCase() ?? "";
    // Add slight variation by position to avoid cosine=1.0 with every pro
    if (pos.includes("ST") || pos.includes("CF")) {
      return { speed: base + 8, shooting: base + 10, vision: base, technique: base + 5, defending: base - 15, stamina: base - 5 };
    } else if (pos.includes("GK")) {
      return { speed: base - 10, shooting: base - 15, vision: base, technique: base - 5, defending: base + 15, stamina: base + 5 };
    } else if (pos.includes("CB")) {
      return { speed: base - 5, shooting: base - 10, vision: base, technique: base - 5, defending: base + 15, stamina: base + 8 };
    } else if (pos.includes("W") || pos.includes("LM") || pos.includes("RM")) {
      return { speed: base + 10, shooting: base + 3, vision: base + 3, technique: base + 8, defending: base - 12, stamina: base };
    } else if (pos.includes("CAM")) {
      return { speed: base + 3, shooting: base + 5, vision: base + 10, technique: base + 8, defending: base - 12, stamina: base - 3 };
    } else {
      // CM/DM default — balanced but not flat
      return { speed: base, shooting: base - 3, vision: base + 5, technique: base + 3, defending: base + 3, stamina: base + 5 };
    }
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

  // runAnalysis acepta objeto { videoId, videoDuration?, jerseyNumber?, teamColor?, localVideoSrc?, physicalMetrics? }
  const runAnalysis = useCallback(async (opts: {
        videoId:          string;
        videoDuration?:   number;
        jerseyNumber?:    string;
        teamColor?:       string;
        localVideoSrc?:   string; // blob: URL para videos locales
        physicalMetrics?: PhysicalMetrics; // métricas YOLO de sesión de tracking previa
        trackPositions?:  FieldPosition[]; // posiciones del jugador para heatmap
        analysisFocus?:   string[]; // enfoque: ofensivas, defensivas, recuperación, duelos
  }) => {
        const { videoId, videoDuration, jerseyNumber, teamColor, localVideoSrc, physicalMetrics, trackPositions, analysisFocus } = opts;
        setState({ step: "keyframes", progress: 10, message: "Preparando video para análisis..." });

        try {
          const vsiMetrics = playerToVSI(player);

          // 1. Calcular similitud ANTES del análisis (para informar a Claude)
          setState({ step: "analyzing", progress: 12, message: "Calculando similitud con pros..." });
          let similarityData: SimilarityResult | null = null;
          setIsSimilarityLoading(true);
          try {
            similarityData = await findSimilarPlayers(vsiMetrics, player.position, {
              youthAge: player.age,
              phvOffset: player.phvOffset ?? 0,
            });
          } catch {
            // similitud es opcional
          } finally {
            setIsSimilarityLoading(false);
          }

          // 2. Intentar Gemini primero (video completo) si es video local
          let geminiObservations: Record<string, unknown> | null = null;
          let keyframes: KeyframeData[] = [];

          if (localVideoSrc) {
            // 2a. SIEMPRE intentar Gemini PRIMERO (video completo)
            setState({ step: "analyzing", progress: 18, message: "🎬 Preparando video para Gemini (primera opción)..." });
            try {
              const videoData = await readVideoAsBase64(localVideoSrc);
              if (videoData) {
                const videoSizeMB = (videoData.sizeBytes / 1024 / 1024).toFixed(1);
                setState({ step: "analyzing", progress: 22, message: `🎬 Analizando video completo con Gemini (${videoSizeMB}MB)...` });
                console.log(`[Intelligence] Enviando video a Gemini: ${videoSizeMB}MB`);
                const geminiRes = await fetch("/api/agents/video-observation", {
                  method: "POST",
                  headers: await getAuthHeaders(),
                  body: JSON.stringify({
                    videoBase64: videoData.base64,
                    mediaType: videoData.mediaType,
                    playerContext: {
                      name: player.name,
                      age: player.age,
                      position: player.position,
                      foot: player.foot,
                      height: player.height,
                      weight: player.weight,
                      competitiveLevel: player.competitiveLevel,
                      jerseyNumber,
                      teamColor,
                    },
                  }),
                });

                if (geminiRes.ok) {
                  const geminiData = await geminiRes.json() as { observations?: Record<string, unknown> };
                  if (geminiData.observations) {
                    geminiObservations = geminiData.observations;
                    console.log("[Intelligence] ✅ Gemini analizó el video completo exitosamente");
                  }
                } else {
                  const errStatus = geminiRes.status;
                  const errText = await geminiRes.text().catch(() => "");
                  console.warn(`[Intelligence] ⚠️ Gemini falló (HTTP ${errStatus}): ${errText.slice(0, 200)}`);
                  console.warn("[Intelligence] Cayendo a fallback: extracción de frames → Claude");
                }
              } else {
                console.warn("[Intelligence] ⚠️ Video demasiado grande o blob expirado — no se pudo leer para Gemini");
                console.warn("[Intelligence] Cayendo a fallback: extracción de frames → Claude");
              }
            } catch (geminiErr) {
              console.warn("[Intelligence] ⚠️ Error con Gemini, cayendo a fallback frames:", geminiErr);
            }

            // 2b. SOLO si Gemini falló → extraer 100 frames → seleccionar 20 → enviar a Claude
            if (!geminiObservations) {
              const extractCount = getOptimalFrameCount(videoDuration || 120); // siempre 100
              setState({ step: "keyframes", progress: 20, message: `⚠️ Gemini no disponible — extrayendo ${extractCount} fotogramas para Claude (fallback)...` });
              const allFrames = await extractKeyframesFromVideo(localVideoSrc, videoDuration || 120, extractCount);
              if (allFrames.length === 0) throw new Error("No se pudieron extraer frames del video");

              // Claude API acepta máximo 20 imágenes — seleccionar 20 espaciados uniformemente
              const MAX_CLAUDE_FRAMES = 20;
              if (allFrames.length <= MAX_CLAUDE_FRAMES) {
                keyframes = allFrames;
              } else {
                const step = Math.ceil(allFrames.length / MAX_CLAUDE_FRAMES);
                keyframes = allFrames.filter((_, i) => i % step === 0).slice(0, MAX_CLAUDE_FRAMES);
              }

              setState({ step: "keyframes", progress: 28, message: `${allFrames.length} fotogramas extraídos → enviando ${keyframes.length} a Claude...` });

              // Verificar que el payload no exceda 4MB (límite Vercel)
              let payloadEstimate = JSON.stringify(keyframes).length;
              while (payloadEstimate > 4_000_000 && keyframes.length > 10) {
                console.warn(`[Intelligence] Payload ${(payloadEstimate / 1e6).toFixed(1)}MB con ${keyframes.length} frames, reduciendo...`);
                keyframes = keyframes.filter((_, i) => i % 2 === 0);
                payloadEstimate = JSON.stringify(keyframes).length;
              }
            }
          } else {
            // Bunny CDN — solo thumbnails
            keyframes = getBunnyKeyframes(videoId, videoDuration);
          }

          setState({ step: "analyzing", progress: 35, message: geminiObservations ? "✅ Video analizado por Gemini — generando informe completo..." : `⚠️ Fallback: analizando ${keyframes.length} fotogramas con Claude...` });

          // 3a. RAG enrichment: fetch relevant drills and methodology
          let ragContext = "";
          try {
            const ragRes = await fetch("/api/rag/query", {
              method: "POST",
              headers: await getAuthHeaders(),
              body: JSON.stringify({
                query: `${player.position} ${player.age} años mejora ${
                  Object.entries(player.metrics || {})
                    .sort(([, a], [, b]) => (a as number) - (b as number))
                    .slice(0, 2)
                    .map(([k]) => k)
                    .join(" ")
                }`,
                limit: 3,
              }),
            });
            if (ragRes.ok) {
              const ragData = await ragRes.json() as { data?: { results?: Array<{ content: string }> } };
              const results = ragData.data?.results ?? [];
              if (results.length > 0) {
                ragContext = "\n\nCONTEXTO RAG (drills y metodología relevante):\n" +
                  results.map(r => r.content.slice(0, 300)).join("\n---\n");
              }
            }
          } catch { /* RAG query failed — continue without */ }

          // 3. Llamar a Claude con SSE streaming (con observaciones Gemini O con frames)
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
              geminiObservations,
              similarityMatches: similarityData ? {
                bestMatch: {
                  name:     similarityData.bestMatch.player.short_name,
                  club:     similarityData.bestMatch.player.club,
                  position: similarityData.bestMatch.player.position,
                  overall:  similarityData.bestMatch.player.overall,
                  score:    similarityData.bestMatch.score,
                },
                top5: similarityData.top5.map(m => ({
                  name:     m.player.short_name,
                  club:     m.player.club,
                  position: m.player.position,
                  overall:  m.player.overall,
                  score:    m.score,
                })),
              } : null,
              // KPIs y retos mensuales calculados client-side
              kpiReport: computeKPIs(vsiMetrics, player.age, player.position, player.phvOffset ?? 0),
              monthlyChallenges: generateMonthlyChallenges(vsiMetrics, player.age, player.position),
              // Métricas cuantitativas (YOLO tracking + Gemini event counting)
              physicalMetrics: physicalMetrics ? {
                maxSpeedKmh:   physicalMetrics.maxSpeedMs * 3.6,
                avgSpeedKmh:   physicalMetrics.avgSpeedMs * 3.6,
                distanceM:     physicalMetrics.distanceCoveredM,
                sprints:       physicalMetrics.sprintCount,
                duelsWon:      physicalMetrics.duelsWon,
                duelsLost:     physicalMetrics.duelsLost,
                intensityZones: {
                  walk:   physicalMetrics.intensityZones.walk,
                  jog:    physicalMetrics.intensityZones.jog,
                  run:    physicalMetrics.intensityZones.run,
                  sprint: physicalMetrics.intensityZones.sprint,
                },
              } : null,
              geminiEventCounts: geminiObservations?.eventosContados ?? null,
              analysisFocus: analysisFocus ?? null,
              ragContext: ragContext || null,
            },
            (msg) => setState((prev) => ({ ...prev, message: msg, progress: Math.min(prev.progress + 5, 85) }))
          );

          // Enriquecer reporte con métricas cuantitativas client-side
          const geminiEvents = geminiObservations?.eventosContados as {
            pasesCompletados?: number; pasesFallados?: number; recuperaciones?: number;
            duelosGanados?: number; duelosPerdidos?: number; disparosAlArco?: number;
            disparosFuera?: number;
          } | undefined;

          const hasYolo = !!physicalMetrics;
          const hasGeminiEvents = !!geminiEvents;

          if (hasYolo || hasGeminiEvents) {
            const totalPases = (geminiEvents?.pasesCompletados ?? 0) + (geminiEvents?.pasesFallados ?? 0);
            analysisResult.metricasCuantitativas = {
              fisicas: hasYolo ? {
                velocidadMaxKmh:  physicalMetrics!.maxSpeedMs * 3.6,
                velocidadPromKmh: physicalMetrics!.avgSpeedMs * 3.6,
                distanciaM:       physicalMetrics!.distanceCoveredM,
                sprints:          physicalMetrics!.sprintCount,
                zonasIntensidad: {
                  caminar: physicalMetrics!.intensityZones.walk,
                  trotar:  physicalMetrics!.intensityZones.jog,
                  correr:  physicalMetrics!.intensityZones.run,
                  sprint:  physicalMetrics!.intensityZones.sprint,
                },
              } : undefined,
              eventos: hasGeminiEvents ? {
                pasesCompletados: geminiEvents!.pasesCompletados ?? 0,
                pasesFallados:    geminiEvents!.pasesFallados ?? 0,
                precisionPases:   totalPases > 0 ? Math.round(((geminiEvents!.pasesCompletados ?? 0) / totalPases) * 100) : 0,
                recuperaciones:   geminiEvents!.recuperaciones ?? 0,
                duelosGanados:    geminiEvents!.duelosGanados ?? 0,
                duelosPerdidos:   geminiEvents!.duelosPerdidos ?? 0,
                disparosAlArco:   geminiEvents!.disparosAlArco ?? 0,
                disparosFuera:    geminiEvents!.disparosFuera ?? 0,
              } : undefined,
              fuente: hasYolo && hasGeminiEvents ? "yolo+gemini" : hasGeminiEvents ? "gemini_only" : "yolo_only",
              confianza: hasYolo && hasGeminiEvents ? 0.85 : hasGeminiEvents ? 0.7 : 0.6,
              // Posiciones comprimidas para heatmap (subsamplear a ~1 por segundo)
              heatmapPositions: trackPositions && trackPositions.length > 0
                ? subsamplePositions(trackPositions, 1000)
                : undefined,
            };
          }

          const savedAt = new Date().toISOString();

          // Guardar análisis en Supabase para persistencia
          if (SUPABASE_CONFIGURED) {
            try {
              // Obtener user_id del usuario autenticado (requerido por RLS)
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                console.warn("[Intelligence] No hay usuario autenticado — no se puede guardar análisis");
              } else {
                const { error: insertErr } = await supabase.from("player_analyses").insert({
                  user_id:         user.id,
                  player_id:       player.id,
                  video_id:        videoId,
                  report:          analysisResult,
                  similarity_top5: similarityData,
                  created_at:      savedAt,
                });
                if (insertErr) {
                  console.error("[Intelligence] Error guardando análisis en Supabase:", insertErr.message);
                } else {
                  console.log("[Intelligence] ✅ Análisis guardado en Supabase (player_analyses)");
                }
              }
            } catch (saveErr) {
              console.error("[Intelligence] No se pudo guardar en Supabase:", saveErr);
            }
          }

          setResult({
                    report:     analysisResult,
                    similarity: similarityData,
                    savedAt,
          });

          // ── Auto-update player metrics from Claude dimensions ────────────
          // Convierte dimensiones (0-10) → métricas player (0-100)
          const dimToMetric: Record<string, keyof Player["metrics"]> = {
            velocidadDecision: "speed",
            tecnicaConBalon: "technique",
            inteligenciaTactica: "vision",
            capacidadFisica: "stamina",
            eficaciaCompetitiva: "shooting",
            liderazgoPresencia: "defending",
          };
          const dims = analysisResult.estadoActual?.dimensiones;
          if (dims) {
            try {
              const newMetrics: Player["metrics"] = { ...player.metrics };
              for (const [dimKey, metricKey] of Object.entries(dimToMetric)) {
                const dimScore = (dims as Record<string, { score: number }>)[dimKey]?.score;
                if (dimScore != null) {
                  newMetrics[metricKey] = Math.round(dimScore * 10);
                }
              }
              await PlayerService.updateMetrics(player.id, newMetrics);
              queryClient.invalidateQueries({ queryKey: ["player", player.id] });
            } catch (metricsErr) {
              console.warn("[Intelligence] No se pudieron actualizar métricas:", metricsErr);
            }
          }

          // Invalidar caché de análisis guardados
          queryClient.invalidateQueries({ queryKey: ["player-analyses", player.id] });

          // ── Auto-generate scout insight for this player ─────────────────
          try {
            const { triggerInsightForPlayer } = await import("@/services/scoutService");
            await triggerInsightForPlayer(player.id);
            queryClient.invalidateQueries({ queryKey: ["scout-insights"] });
          } catch (insightErr) {
            console.warn("[Intelligence] No se pudo generar insight automático:", insightErr);
          }

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
                const similarityData = await findSimilarPlayers(vsiMetrics, player.position, {
                  youthAge: player.age,
                  phvOffset: player.phvOffset ?? 0,
                });
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

// ——— Helper: comprimir posiciones a ~1 por segundo ——————————————

function subsamplePositions(positions: FieldPosition[], intervalMs: number): Array<{ fx: number; fy: number }> {
  if (positions.length === 0) return [];
  const result: Array<{ fx: number; fy: number }> = [];
  let lastTs = -Infinity;
  for (const p of positions) {
    if (p.timestampMs - lastTs >= intervalMs) {
      result.push({ fx: Math.round(p.fx * 10) / 10, fy: Math.round(p.fy * 10) / 10 });
      lastTs = p.timestampMs;
    }
  }
  return result;
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
                    .limit(50);
                  if (error) throw error;
                  return data ?? [];
          },
          enabled:   !!playerId && SUPABASE_CONFIGURED,
          staleTime: 1000 * 60,
    });
}
