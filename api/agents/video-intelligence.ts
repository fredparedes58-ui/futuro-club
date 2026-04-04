·ááááúáÚáñáááóóóóóáóéÉóóóóóñááááéóóéáóíéáóéóéóéíéííáóñéáéá/**
 * VITAS · Video Intelligence Agent
 * POST /api/agents/video-intelligence
 *
 * Usa streaming para evitar timeouts en Vercel.
 * Analiza keyframes de video con Claude Sonnet vision.
 *
 * Body: { playerId, videoId, playerContext, keyframes[], videoDuration? }
 * Response: streaming text/event-stream con JSON al final
 */

export const config = { maxDuration: 60 };

import Anthropic from "@anthropic-ai/sdk";
import type { ProPlayer } from "../../src/data/proPlayers";

// ——— Tipos locales ———————————————————————————

interface PlayerContext {
    name:             string;
    age:              number;
    position:         string;
    foot:             "right" | "left" | "both";
    height?:          number;
    weight?:          number;
    currentVSI?:      number;
    phvCategory?:     "early" | "central" | "late";
    team?:            string;
    nationality?:     string;
}

interface KeyframeData {
    url:        string;
    timestamp:  number;
    frameIndex: number;
}

interface VideoIntelligenceOutput {
    success:       boolean;
    playerId:      string;
    videoId:       string;
    report:        VideoReport;
    topsPros:      ProPlayer[];
    tokensUsed:    number;
    modelUsed:     string;
    generatedAt:   string;
}

interface VideoReport {
    currentState:       CurrentStateReport;
    footballDNA:        FootballDNAReport;
    referencePlayer:    ReferencePlayerReport;
    careerProjection:   CareerProjectionReport;
    developmentPlan:    DevelopmentPlanReport;
    overallScore:       number;
    executiveSummary:   string;
}

interface CurrentStateReport {
    technicalScore:   number;
    tacticalScore:    number;
    physicalScore:    number;
    mentalScore:      number;
    speedScore:       number;
    strengthScore:    number;
    highlights:       string[];
    improvements:     string[];
    detailedAnalysis: string;
}

interface FootballDNAReport {
    primaryStyle:      string;
    secondaryStyle:    string;
    playingPatterns:   string[];
    uniqueQualities:   string[];
    positionFit:       Record<string, number>;
    styleDescription:  string;
}

interface ReferencePlayerReport {
    playerName:       string;
    similarity:       number;
    league:           string;
    club:             string;
    position:         string;
    comparisonPoints: string[];
    differencePoints: string[];
    learningPath:     string;
}

interface CareerProjectionReport {
    peakPotential:     number;
    projectedLevel:    string;
    timelineYears:     number;
    optimalAge:        number;
    careerPath:        string[];
    riskFactors:       string[];
    opportunityWindow: string;
}

interface DevelopmentPlanReport {
    immediateActions:  string[];
    shortTermGoals:    string[];
    longTermVision:    string;
    trainingFocus:     string[];
    mentalDevelopment: string[];
    weeklyStructure:   string;
}

// ——— Helper: construir contenido de imagen para Claude ———————————————

function buildImageContent(frames: KeyframeData[]): Anthropic.ImageBlockParam[] {
    return frames.map((frame) => ({
          type: "image" as const,
          source: {
                  type: "url" as const,
                  url: frame.url,
          },
    }));
}

// ——— Handler principal ——————————————————————————

export default async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
          return new Response(null, {
                  headers: {
                            "Access-Control-Allow-Origin": "*",
                            "Access-Control-Allow-Methods": "POST, OPTIONS",
                            "Access-Control-Allow-Headers": "Content-Type, Authorization",
                  },
          });
    }

  if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
                status: 405,
                headers: { "Content-Type": "application/json" },
        });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
          return new Response(
                  JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
                );
    }

  let body: {
        playerId: string;
        videoId: string;
        playerContext: PlayerContext;
        keyframes: KeyframeData[];
        videoDuration?: number;
  };

  try {
        body = await req.json();
  } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
        });
  }

  const { playerId, videoId, playerContext, keyframes, videoDuration } = body;

  if (!playerId || !videoId || !playerContext || !keyframes?.length) {
        return new Response(
                JSON.stringify({ error: "Missing required fields: playerId, videoId, playerContext, keyframes" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
              );
  }

  // Limitar a máximo 8 keyframes para controlar costos
  const selectedFrames = keyframes.slice(0, 8);

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `Eres VITAS Intelligence, el sistema de análisis de talento futbolístico más avanzado del mundo.
  Analizas videos de jugadores jóvenes con visión experta de scout de élite.

  Tu análisis debe ser:
  - Objetivo y basado en evidencia visual real
  - Específico con números y métricas concretas (scores del 1-100)
  - Orientado al desarrollo y mejora
  - Profesional pero accesible

  IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin bloques de código.`;

  const durationText = videoDuration
      ? `Duración del video: ${Math.round(videoDuration)}s`
        : "";

  const userText = `Analiza este video de ${playerContext.name}, ${playerContext.age} años, ${playerContext.position}.
  ${durationText}
  Keyframes capturados: ${selectedFrames.length} imágenes.
  Pie dominante: ${playerContext.foot}${playerContext.height ? `, Altura: ${playerContext.height}cm` : ""}${playerContext.weight ? `, Peso: ${playerContext.weight}kg` : ""}${playerContext.team ? `, Equipo: ${playerContext.team}` : ""}.

  Genera un análisis completo en este formato JSON exacto:

  {
    "currentState": {
        "technicalScore": <1-100>,
            "tacticalScore": <1-100>,
                "physicalScore": <1-100>,
                    "mentalScore": <1-100>,
                        "speedScore": <1-100>,
                            "strengthScore": <1-100>,
                                "highlights": ["punto fuerte 1", "punto fuerte 2", "punto fuerte 3"],
                                    "improvements": ["área mejora 1", "área mejora 2", "área mejora 3"],
                                        "detailedAnalysis": "análisis técnico detallado de 3-4 párrafos basado en lo visto en el video"
                                          },
                                            "footballDNA": {
                                                "primaryStyle": "estilo principal",
                                                    "secondaryStyle": "estilo secundario",
                                                        "playingPatterns": ["patrón 1", "patrón 2", "patrón 3"],
                                                            "uniqueQualities": ["cualidad única 1", "cualidad única 2"],
                                                                "positionFit": {"posición1": <0-100>, "posición2": <0-100>},
                                                                    "styleDescription": "descripción del ADN futbolístico en 2-3 párrafos"
                                                                      },
                                                                        "referencePlayer": {
                                                                            "playerName": "nombre del jugador referencia profesional",
                                                                                "similarity": <0-100>,
                                                                                    "league": "liga del jugador referencia",
                                                                                        "club": "club actual",
                                                                                            "position": "posición",
                                                                                                "comparisonPoints": ["similitud 1", "similitud 2", "similitud 3"],
                                                                                                    "differencePoints": ["diferencia 1", "diferencia 2"],
                                                                                                        "learningPath": "qué puede aprender del jugador referencia"
                                                                                                          },
                                                                                                            "careerProjection": {
                                                                                                                "peakPotential": <1-100>,
                                                                                                                    "projectedLevel": "nivel proyectado (Liga local/Nacional/Internacional/Élite)",
                                                                                                                        "timelineYears": <número de años hasta pico>,
                                                                                                                            "optimalAge": <edad óptima proyectada>,
                                                                                                                                "careerPath": ["paso 1", "paso 2", "paso 3", "paso 4"],
                                                                                                                                    "riskFactors": ["riesgo 1", "riesgo 2"],
                                                                                                                                        "opportunityWindow": "descripción de la ventana de oportunidad actual"
                                                                                                                                          },
                                                                                                                                            "developmentPlan": {
                                                                                                                                                "immediateActions": ["acción inmediata 1", "acción inmediata 2", "acción inmediata 3"],
                                                                                                                                                    "shortTermGoals": ["objetivo 3 meses 1", "objetivo 3 meses 2", "objetivo 3 meses 3"],
                                                                                                                                                        "longTermVision": "visión a 2-3 años",
                                                                                                                                                            "trainingFocus": ["foco entrenamiento 1", "foco entrenamiento 2", "foco entrenamiento 3"],
                                                                                                                                                                "mentalDevelopment": ["aspecto mental 1", "aspecto mental 2"],
                                                                                                                                                                    "weeklyStructure": "estructura semanal recomendada de entrenamiento"
                                                                                                                                                                      },
                                                                                                                                                                        "overallScore": <1-100>,
                                                                                                                                                                          "executiveSummary": "resumen ejecutivo de 2-3 párrafos para los padres/entrenadores"
                                                                                                                                                                          }`;

  const imageBlocks = buildImageContent(selectedFrames);

  // ——— Streaming: enviar respuesta progresiva para evitar timeout ———

  const stream = new ReadableStream({
        async start(controller) {
                const encoder = new TextEncoder();

          try {
                    // Señal de inicio al cliente
                  controller.enqueue(encoder.encode('data: {"status":"analyzing"}\n\n'));

                  let fullText = "";
                    let totalInputTokens = 0;
                    let totalOutputTokens = 0;

                  const response = await anthropic.messages.create({
                              model: "claude-sonnet-4-5",
                              max_tokens: 4096,
                              stream: true,
                              system: systemPrompt,
                              messages: [
                                {
                                                role: "user",
                                                content: [
                                                                  ...imageBlocks,
                                                  { type: "text", text: userText },
                                                                ],
                                },
                                          ],
                  });

                  for await (const event of response) {
                              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                                            fullText += event.delta.text;
                                            // Enviar progreso al cliente cada cierto tiempo
                                controller.enqueue(encoder.encode(`data: {"status":"streaming","chunk":${JSON.stringify(event.delta.text)}}\n\n`));
                              } else if (event.type === "message_delta" && event.usage) {
                                            totalOutputTokens = event.usage.output_tokens;
                              } else if (event.type === "message_start" && event.message.usage) {
                                            totalInputTokens = event.message.usage.input_tokens;
                              }
                  }

                  // Parsear el JSON generado por Claude
                  let report: VideoReport;
                    try {
                                const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                                if (!jsonMatch) throw new Error("No JSON found in response");
                                report = JSON.parse(jsonMatch[0]);
                    } catch (parseError) {
                                controller.enqueue(
                                              encoder.encode(`data: {"status":"error","error":"Failed to parse Claude response: ${String(parseError)}"}\n\n`)
                                            );
                                controller.close();
                                return;
                    }

                  const tokensUsed = totalInputTokens + totalOutputTokens;

                  // Guardar en RAG en background (no bloqueante)
                  const baseUrl = process.env.VERCEL_URL
                      ? `https://${process.env.VERCEL_URL}`
                              : "http://localhost:3001";

                  const reportContent = `ANÁLISIS VITAS INTELLIGENCE
                  Jugador: ${playerContext.name} | Posición: ${playerContext.position} | Edad: ${playerContext.age}
                  Score General: ${report.overallScore}/100

                  RESUMEN EJECUTIVO:
                  ${report.executiveSummary}

                  ESTADO ACTUAL:
                  Técnica: ${report.currentState.technicalScore}/100 | Táctica: ${report.currentState.tacticalScore}/100
                  Física: ${report.currentState.physicalScore}/100 | Mental: ${report.currentState.mentalScore}/100
                  ${report.currentState.detailedAnalysis}

                  ADN FUTBOLÍSTICO: ${report.footballDNA.primaryStyle}
                  ${report.footballDNA.styleDescription}

                  JUGADOR REFERENCIA: ${report.referencePlayer.playerName} (${report.referencePlayer.similarity}% similitud)
                  ${report.referencePlayer.learningPath}

                  PROYECCIÓN: ${report.careerProjection.projectedLevel} en ~${report.careerProjection.timelineYears} años
                  ${report.careerProjection.opportunityWindow}`;

                  fetch(`${baseUrl}/api/rag/ingest`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                            documents: [{
                                                            content: reportContent,
                                                            category: "report",
                                                            metadata: { videoId, reportDate: new Date().toISOString() },
                                                            player_id: playerId,
                                            }],
                              }),
                  }).catch(() => { /* non-blocking */ });

                  // Enviar resultado final
                  const finalResult: VideoIntelligenceOutput = {
                              success: true,
                              playerId,
                              videoId,
                              report,
                              topsPros: [],
                              tokensUsed,
                              modelUsed: "claude-sonnet-4-5",
                              generatedAt: new Date().toISOString(),
                  };

                  controller.enqueue(
                              encoder.encode(`data: {"status":"done","result":${JSON.stringify(finalResult)}}\n\n`)
                            );
                    controller.close();

          } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    controller.enqueue(
                                encoder.encode(`data: {"status":"error","error":${JSON.stringify(errMsg)}}\n\n`)
                              );
                    controller.close();
          }
        },
  });

  return new Response(stream, {
        status: 200,
        headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
        },
  });
}
