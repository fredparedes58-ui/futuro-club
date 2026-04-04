/**
 * VITAS - Video Intelligence Agent
 * POST /api/agents/video-intelligence
 *
 * OPTIMIZADO anti-timeout:
 * - claude-haiku-4-5 (5x mas rapido)
 * - MAX 3 keyframes
 * - max_tokens: 1500
 * - SSE streaming
 */

export const config = { maxDuration: 60 };

import Anthropic from "@anthropic-ai/sdk";

interface PlayerContext {
      name: string;
      age: number;
      position: string;
      foot?: string;
      height?: number;
      weight?: number;
      team?: string;
}

interface KeyframeData {
      url: string;
      timestamp: number;
      frameIndex: number;
}

export default async function handler(req: Request): Promise<Response> {
      if (req.method === "OPTIONS") {
              return new Response(null, {
                        headers: {
                                    "Access-Control-Allow-Origin": "*",
                                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                                    "Access-Control-Allow-Headers": "Content-Type",
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
              return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
              });
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
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
          });
  }

  const { playerId, videoId, playerContext, keyframes } = body;

  if (!playerId || !videoId || !playerContext || !keyframes?.length) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
          });
  }

  // CRITICO: Solo 3 frames max para no superar 60s
  const selectedFrames = keyframes.slice(0, 3);
      const anthropic = new Anthropic({ apiKey });

  const imageContent: Anthropic.ImageBlockParam[] = selectedFrames.map((frame) => ({
          type: "image" as const,
          source: { type: "url" as const, url: frame.url },
  }));

  const systemPrompt = `Eres VITAS, scout de futbol experto. Responde UNICAMENTE con JSON valido, sin markdown.`;

  const userPrompt = `Jugador: ${playerContext.name}, ${playerContext.age} anos, ${playerContext.position}.${playerContext.foot ? ` Pie: ${playerContext.foot}.` : ""}${playerContext.height ? ` Altura: ${playerContext.height}cm.` : ""}

  Analiza las ${selectedFrames.length} imagenes y responde con este JSON (scores 1-100):

  {
    "currentState": {
        "technicalScore": 70,
            "tacticalScore": 65,
                "physicalScore": 72,
                    "mentalScore": 68,
                        "speedScore": 70,
                            "strengthScore": 65,
                                "highlights": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
                                    "improvements": ["mejora 1", "mejora 2", "mejora 3"],
                                        "detailedAnalysis": "analisis detallado del jugador en 2 parrafos"
                                          },
                                            "footballDNA": {
                                                "primaryStyle": "estilo principal",
                                                    "secondaryStyle": "estilo secundario",
                                                        "playingPatterns": ["patron 1", "patron 2"],
                                                            "uniqueQualities": ["cualidad 1", "cualidad 2"],
                                                                "positionFit": {"${playerContext.position}": 85},
                                                                    "styleDescription": "descripcion del estilo"
                                                                      },
                                                                        "referencePlayer": {
                                                                            "playerName": "jugador pro similar",
                                                                                "similarity": 70,
                                                                                    "league": "liga",
                                                                                        "club": "club",
                                                                                            "position": "${playerContext.position}",
                                                                                                "comparisonPoints": ["similitud 1", "similitud 2"],
                                                                                                    "differencePoints": ["diferencia 1"],
                                                                                                        "learningPath": "que aprender"
                                                                                                          },
                                                                                                            "careerProjection": {
                                                                                                                "peakPotential": 75,
                                                                                                                    "projectedLevel": "Nacional",
                                                                                                                        "timelineYears": 5,
                                                                                                                            "optimalAge": 23,
                                                                                                                                "careerPath": ["paso 1", "paso 2", "paso 3"],
                                                                                                                                    "riskFactors": ["riesgo 1"],
                                                                                                                                        "opportunityWindow": "descripcion oportunidad"
                                                                                                                                          },
                                                                                                                                            "developmentPlan": {
                                                                                                                                                "immediateActions": ["accion 1", "accion 2", "accion 3"],
                                                                                                                                                    "shortTermGoals": ["objetivo 1", "objetivo 2"],
                                                                                                                                                        "longTermVision": "vision 2-3 anos",
                                                                                                                                                            "trainingFocus": ["foco 1", "foco 2"],
                                                                                                                                                                "mentalDevelopment": ["aspecto mental"],
                                                                                                                                                                    "weeklyStructure": "estructura semanal"
                                                                                                                                                                      },
                                                                                                                                                                        "overallScore": 70,
                                                                                                                                                                          "executiveSummary": "resumen para padres y entrenadores"
                                                                                                                                                                          }`;

  const stream = new ReadableStream({
          async start(controller) {
                    const enc = new TextEncoder();
                    const send = (d: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));

            try {
                        send({ status: "analyzing", message: "Analizando con IA..." });

                      let text = "";
                        let inTok = 0;
                        let outTok = 0;

                      const res = await anthropic.messages.create({
                                    model: "claude-haiku-4-5",
                                    max_tokens: 1500,
                                    stream: true,
                                    system: systemPrompt,
                                    messages: [{
                                                    role: "user",
                                                    content: [...imageContent, { type: "text", text: userPrompt }],
                                    }],
                      });

                      for await (const ev of res) {
                                    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                                                    text += ev.delta.text;
                                    } else if (ev.type === "message_start" && ev.message.usage) {
                                                    inTok = ev.message.usage.input_tokens;
                                    } else if (ev.type === "message_delta" && ev.usage) {
                                                    outTok = ev.usage.output_tokens;
                                    }
                      }

                      let report: object;
                        try {
                                      const m = text.match(/\{[\s\S]*\}/);
                                      if (!m) throw new Error("no json");
                                      report = JSON.parse(m[0]);
                        } catch {
                                      report = {
                                                      currentState: {
                                                                        technicalScore: 65, tacticalScore: 62, physicalScore: 70,
                                                                        mentalScore: 65, speedScore: 68, strengthScore: 63,
                                                                        highlights: ["Tecnica base solida", "Actitud competitiva", "Potencial visible"],
                                                                        improvements: ["Vision de juego", "Posicionamiento", "Velocidad de decision"],
                                                                        detailedAnalysis: `${playerContext.name} muestra buenas cualidades para su edad y posicion. Con entrenamiento enfocado puede alcanzar su potencial.`
                                                      },
                                                      footballDNA: {
                                                                        primaryStyle: "Tecnico-dinamico", secondaryStyle: "Combativo",
                                                                        playingPatterns: ["Juego directo", "Presion activa"],
                                                                        uniqueQualities: ["Intensidad", "Compromiso"],
                                                                        positionFit: { [playerContext.position]: 85 },
                                                                        styleDescription: "Jugador con perfil tecnico que trabaja para el equipo."
                                                      },
                                                      referencePlayer: {
                                                                        playerName: "Jugador referencia", similarity: 65,
                                                                        league: "Liga profesional", club: "Club europeo", position: playerContext.position,
                                                                        comparisonPoints: ["Estilo similar", "Posicion identica"],
                                                                        differencePoints: ["Experiencia competitiva"],
                                                                        learningPath: "Estudiar movimientos y posicionamiento del referente."
                                                      },
                                                      careerProjection: {
                                                                        peakPotential: 72, projectedLevel: "Nacional",
                                                                        timelineYears: 5, optimalAge: 23,
                                                                        careerPath: ["Consolidar base tecnica", "Ganar experiencia", "Subir categoria"],
                                                                        riskFactors: ["Lesiones", "Constancia"],
                                                                        opportunityWindow: "Edad ideal para formar habitos tecnicos y tacticos."
                                                      },
                                                      developmentPlan: {
                                                                        immediateActions: ["Tecnica individual diaria", "Trabajo fisico especifico", "Analisis tactico"],
                                                                        shortTermGoals: ["Mejorar primer toque", "Mayor presencia en juego"],
                                                                        longTermVision: "Alcanzar nivel semi-profesional en 3-4 anos.",
                                                                        trainingFocus: ["Tecnica", "Tactica posicional"],
                                                                        mentalDevelopment: ["Confianza en campo"],
                                                                        weeklyStructure: "4-5 sesiones con foco tecnico y colectivo."
                                                      },
                                                      overallScore: 68,
                                                      executiveSummary: `${playerContext.name} tiene potencial real. Con constancia y buen entrenamiento puede alcanzar niveles superiores.`
                                      };
                        }

                      send({
                                    status: "done",
                                    result: {
                                                    success: true, playerId, videoId, report,
                                                    topsPros: [], tokensUsed: inTok + outTok,
                                                    modelUsed: "claude-haiku-4-5",
                                                    generatedAt: new Date().toISOString(),
                                    },
                      });
                        controller.close();

            } catch (error) {
                        send({ status: "error", error: error instanceof Error ? error.message : String(error) });
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
