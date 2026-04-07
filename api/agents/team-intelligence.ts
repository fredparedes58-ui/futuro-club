/**
 * VITAS - Team Intelligence Agent v1
 * POST /api/agents/team-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Recibe observaciones de Gemini sobre el equipo + YOLO opcional.
 * Retorna SSE → TeamIntelligenceOutput completo.
 */

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("progress", { step: "Iniciando análisis de equipo...", percent: 5 });
        const body = await req.json();
        const { teamContext, geminiObservations, keyframes, videoId, yoloTrackData, analysisFocus } = body;

        if (!teamContext) {
          send("error", { message: "Faltan datos requeridos (teamContext)" });
          controller.close();
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send("error", { message: "ANTHROPIC_API_KEY no configurada en el servidor" });
          controller.close();
          return;
        }

        send("progress", { step: "Preparando análisis táctico...", percent: 15 });

        const ctx = teamContext;
        const hasGemini = !!geminiObservations;
        const hasYolo = Array.isArray(yoloTrackData) && yoloTrackData.length > 0;

        // Build image content blocks from keyframes (fallback mode)
        const imageBlocks: unknown[] = [];
        if (!hasGemini && Array.isArray(keyframes)) {
          for (const kf of keyframes.slice(0, 12)) {
            const url: string = typeof kf === "string" ? kf : kf?.url ?? "";
            if (url.startsWith("data:image/")) {
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                imageBlocks.push({
                  type: "image",
                  source: { type: "base64", media_type: match[1], data: match[2] },
                });
              }
            } else if (url.startsWith("http")) {
              imageBlocks.push({
                type: "image",
                source: { type: "url", url },
              });
            }
          }
        }

        send("progress", { step: hasGemini ? "Generando informe táctico..." : `Analizando ${imageBlocks.length} fotogramas...`, percent: 30 });

        // Gemini observations block
        const geminiBlock = hasGemini ? `
OBSERVACIONES TÁCTICAS DEL EQUIPO (generadas por IA que analizó el video completo):

FORMACIÓN DETECTADA: ${geminiObservations.formacionDetectada || "No identificada"}
POSESIÓN ESTIMADA: Equipo ${geminiObservations.posesionEstimada?.equipo ?? "?"}% — Rival ${geminiObservations.posesionEstimada?.rival ?? "?"}%

JUGADORES OBSERVADOS (${geminiObservations.jugadoresObservados?.length ?? 0}):
${(geminiObservations.jugadoresObservados ?? []).map((j: {
  dorsalEstimado: string | null; posicionEstimada: string;
  acciones: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  eventosContados: Record<string, number>;
}, i: number) => {
  const ev = j.eventosContados ?? {};
  return `  ${i + 1}. #${j.dorsalEstimado ?? "?"} — ${j.posicionEstimada}
     Pases: ${ev.pasesCompletados ?? 0}✓/${ev.pasesFallados ?? 0}✗ | Recup: ${ev.recuperaciones ?? 0} | Duelos: ${ev.duelosGanados ?? 0}G/${ev.duelosPerdidos ?? 0}P | Disparos: ${ev.disparosAlArco ?? 0} | Centros: ${ev.centros ?? 0}
     Acciones: ${(j.acciones ?? []).map((a: { timestamp: string; descripcion: string }) => `[${a.timestamp}] ${a.descripcion}`).join(" | ")}`;
}).join("\n")}

FASES DE JUEGO:
- Pressing: ${geminiObservations.fasesJuego?.pressing?.tipo ?? "?"} (intensidad: ${geminiObservations.fasesJuego?.pressing?.intensidad ?? "?"}/10, línea: ${geminiObservations.fasesJuego?.pressing?.alturaLinea ?? "?"})
  ${(geminiObservations.fasesJuego?.pressing?.observaciones ?? []).join("; ")}
- Trans. ofensiva: ${geminiObservations.fasesJuego?.transicionOfensiva?.velocidad ?? "?"} — ${(geminiObservations.fasesJuego?.transicionOfensiva?.patrones ?? []).join(", ")}
- Trans. defensiva: ${geminiObservations.fasesJuego?.transicionDefensiva?.velocidad ?? "?"} — ${(geminiObservations.fasesJuego?.transicionDefensiva?.patrones ?? []).join(", ")}
- Posesión: ${geminiObservations.fasesJuego?.posesion?.estilo ?? "?"} — ${(geminiObservations.fasesJuego?.posesion?.patrones ?? []).join(", ")}

MOMENTOS COLECTIVOS:
${(geminiObservations.momentosColectivos ?? []).map((m: { timestamp: string; tipo: string; descripcion: string }) => `- [${m.timestamp}] (${m.tipo}) ${m.descripcion}`).join("\n")}

RESUMEN: ${geminiObservations.resumenGeneral ?? ""}

Estas observaciones provienen del análisis del VIDEO COMPLETO. Úsalas como base principal.` : "";

        // YOLO tracking data block
        const yoloBlock = hasYolo ? `
MÉTRICAS FÍSICAS POR JUGADOR (tracking por computadora, datos objetivos):
${yoloTrackData.map((t: {
  trackId: number; maxSpeedMs: number; avgSpeedMs: number;
  distanceM: number; sprintCount: number; duelsWon: number; duelsLost: number;
}) => `  Track #${t.trackId}: vel.máx ${(t.maxSpeedMs * 3.6).toFixed(1)} km/h | prom ${(t.avgSpeedMs * 3.6).toFixed(1)} km/h | dist ${t.distanceM.toFixed(0)}m | sprints ${t.sprintCount} | duelos ${t.duelsWon}G/${t.duelsLost}P`
).join("\n")}

Intenta asociar cada Track con un jugador observado por posición en el campo. Si no puedes asociar con certeza, usa null para velocidad/distancia.` : "";

        const introBlock = hasGemini
          ? `Eres VITAS, un analista táctico IA de élite. Un sistema de observación ha analizado el video completo del equipo y te proporciona sus observaciones detalladas. Tu trabajo es interpretar estas observaciones y generar el informe táctico estructurado.`
          : `Eres VITAS, un analista táctico IA de élite. Analiza estos ${imageBlocks.length} fotogramas de un partido de fútbol:`;

        const frameInstructionBlock = !hasGemini
          ? `\nObserva cuidadosamente cada fotograma. Identifica al equipo con uniforme ${ctx.teamColor || "?"}.`
          : "";

        const prompt = `${introBlock}

DATOS DEL EQUIPO:
- Color uniforme: ${ctx.teamColor || "?"}
- Color rival: ${ctx.opponentColor || "no especificado"}
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
${geminiBlock}${frameInstructionBlock}${yoloBlock}
${analysisFocus ? `
ENFOQUE DEL ANÁLISIS: Concentra especialmente el análisis en: ${Array.isArray(analysisFocus) ? analysisFocus.join(", ") : analysisFocus}.
Dedica más detalle a estas acciones en el resumen ejecutivo, fases de juego, métricas colectivas y per-jugador. Si el enfoque es defensivo, profundiza en pressing, línea defensiva, recuperaciones. Si es ofensivo, profundiza en circulación, transiciones ofensivas, centros, disparos.` : ""}

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "videoId": "${videoId || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "equipoAnalizado": {
    "colorUniforme": "${ctx.teamColor || "?"}",
    "jugadoresDetectados": number
  },
  "resumenEjecutivo": "string max 500 chars — evaluación global del equipo",
  "formacion": {
    "sistema": "4-3-3",
    "variantes": ["En ataque pasa a 3-4-3 con laterales altos"],
    "rigidez": 1-10
  },
  "posesion": {
    "porcentaje": 55,
    "estiloCirculacion": "string max 200",
    "zonasDominadas": ["banda derecha", "mediocampo"]
  },
  "fasesJuego": {
    "pressing": {
      "tipo": "pressing alto tras pérdida",
      "alturaLinea": "alta|media|baja",
      "intensidad": 1-10,
      "descripcion": "string max 200"
    },
    "transiciones": {
      "ofensiva": {"velocidad":"rápida|media|lenta","patron":"string","descripcion":"string max 200"},
      "defensiva": {"velocidad":"rápida|media|lenta","patron":"string","descripcion":"string max 200"}
    }
  },
  "metricasColectivas": {
    "compacidad": 1-10,
    "alturaLineaDefensiva": "alta|media|baja",
    "amplitud": 1-10,
    "sincronizacion": 1-10,
    "descripcion": "string max 300"
  },
  "jugadores": [
    {
      "dorsalEstimado": "7" o null,
      "posicion": "extremo derecho",
      "rol": "desborde y profundidad por banda",
      "rendimiento": "destacado|bueno|regular|bajo",
      "velocidadMaxKmh": number o null,
      "distanciaM": number o null,
      "pases": {"completados": 8, "fallados": 2},
      "duelos": {"ganados": 2, "perdidos": 1},
      "recuperaciones": 1,
      "resumen": "string max 150"
    }
  ],
  "evaluacionGeneral": {
    "fortalezasEquipo": ["max 4 strings"],
    "areasTrabajar": ["max 3 strings"],
    "recomendaciones": ["max 3 strings — acciones concretas para el entrenador"]
  },
  "confianza": 0-1
}

REGLAS:
- Incluye TODOS los jugadores observados en el array "jugadores"
- velocidadMaxKmh y distanciaM: usa datos YOLO si están disponibles, sino null
- Sé honesto y específico para el nivel competitivo
- Recomendaciones deben ser accionables para un entrenador
- Responde en español`;

        const content: unknown[] = hasGemini
          ? [{ type: "text", text: prompt }]
          : [...imageBlocks, { type: "text", text: prompt }];

        send("progress", { step: "Procesando con IA...", percent: 45 });

        let fullText = "";
        try {
          const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type":      "application/json",
              "x-api-key":         apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model:      "claude-sonnet-4-20250514",
              max_tokens: 8000,
              messages:   [{ role: "user", content }],
            }),
          });

          if (!claudeRes.ok) {
            const errBody = await claudeRes.text().catch(() => "");
            console.error("Claude API error:", claudeRes.status, errBody);
            send("error", { message: `Error de Claude API: ${claudeRes.status}` });
            controller.close();
            return;
          }

          const data = await claudeRes.json() as {
            content: Array<{ type: string; text?: string }>;
          };
          for (const block of data.content) {
            if (block.type === "text" && block.text) fullText += block.text;
          }
        } catch (e: unknown) {
          console.error("Claude fetch error:", e instanceof Error ? e.message : e);
          send("error", { message: "Error conectando con Claude API" });
          controller.close();
          return;
        }

        send("progress", { step: "Procesando respuesta...", percent: 85 });

        let report = null;
        if (fullText) {
          try {
            const m = fullText.match(/\{[\s\S]*\}/);
            if (m) report = JSON.parse(m[0]);
          } catch (e) {
            console.error("JSON parse error:", e, "Raw text:", fullText.substring(0, 200));
          }
        }

        if (!report) {
          send("error", { message: "No se pudo parsear la respuesta de Claude" });
          controller.close();
          return;
        }

        send("progress", { step: "Finalizando informe táctico...", percent: 95 });
        send("complete", { report, videoId, timestamp: new Date().toISOString() });
      } catch (error: unknown) {
        send("error", { message: error instanceof Error ? error.message : "Error interno" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
