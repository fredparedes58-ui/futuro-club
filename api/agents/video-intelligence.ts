/**
 * VITAS - Video Intelligence Agent v5
 * POST /api/agents/video-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Acepta keyframes base64 (local) o URLs (Bunny CDN).
 * Retorna SSE → VideoIntelligenceOutput completo.
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
        send("progress", { step: "Iniciando VITAS Intelligence...", percent: 5 });
        const body = await req.json();
        const { playerContext, keyframes, videoId, playerId, vsiMetrics } = body;

        if (!playerContext) {
          send("error", { message: "Faltan datos requeridos (playerContext)" });
          controller.close();
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send("error", { message: "ANTHROPIC_API_KEY no configurada en el servidor" });
          controller.close();
          return;
        }

        send("progress", { step: "Preparando fotogramas...", percent: 15 });

        // Build image content blocks from keyframes (base64 or URL)
        const imageBlocks: unknown[] = [];
        if (Array.isArray(keyframes)) {
          for (const kf of keyframes.slice(0, 8)) {
            const url: string = typeof kf === "string" ? kf : kf?.url ?? "";
            if (url.startsWith("data:image/")) {
              // Base64 encoded frame from Canvas extraction
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                imageBlocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: match[1],
                    data: match[2],
                  },
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

        send("progress", { step: `Analizando ${imageBlocks.length} fotogramas con IA...`, percent: 30 });

        // Build the full prompt requesting VideoIntelligenceOutput format
        const ctx = playerContext;
        const prompt = `Eres VITAS, un scout de fútbol IA de élite. Analiza estos ${imageBlocks.length} fotogramas del jugador:

DATOS DEL JUGADOR:
- Nombre: ${ctx.name}
- Edad: ${ctx.age} años
- Posición: ${ctx.position}
- Pie: ${ctx.foot || "no especificado"}
- Estatura: ${ctx.height || "?"} cm | Peso: ${ctx.weight || "?"} kg
- VSI actual: ${ctx.currentVSI || "?"}
- PHV: ${ctx.phvCategory || "?"} (offset: ${ctx.phvOffset || 0})
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
- Dorsal: ${ctx.jerseyNumber || "?"} | Color uniforme: ${ctx.teamColor || "?"}

Observa cuidadosamente cada fotograma. Busca al jugador con dorsal ${ctx.jerseyNumber || "?"} y uniforme ${ctx.teamColor || "?"}.

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "playerId": "${playerId || ctx.name}",
  "videoId": "${videoId || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "estadoActual": {
    "resumenEjecutivo": "string max 400 chars",
    "nivelActual": "elite|alto|medio_alto|medio|desarrollo",
    "fortalezasPrimarias": ["max 4 strings"],
    "areasDesarrollo": ["max 3 strings"],
    "dimensiones": {
      "velocidadDecision": {"score": 0-10, "observacion": "string"},
      "tecnicaConBalon": {"score": 0-10, "observacion": "string"},
      "inteligenciaTactica": {"score": 0-10, "observacion": "string"},
      "capacidadFisica": {"score": 0-10, "observacion": "string"},
      "liderazgoPresencia": {"score": 0-10, "observacion": "string"},
      "eficaciaCompetitiva": {"score": 0-10, "observacion": "string"}
    },
    "ajusteVSIVideoScore": -15 to 15
  },
  "adnFutbolistico": {
    "estiloJuego": "string max 200",
    "arquetipoTactico": "string max 100",
    "patrones": [{"patron":"string","frecuencia":"alto|medio|bajo","descripcion":"string max 150"}],
    "mentalidad": "string max 200"
  },
  "jugadorReferencia": {
    "top5": [{"proPlayerId":"id","nombre":"string","posicion":"string","club":"string","score":0-100,"razonamiento":"string max 200"}],
    "bestMatch": {"proPlayerId":"id","nombre":"string","posicion":"string","club":"string","score":0-100,"narrativa":"string max 300"}
  },
  "proyeccionCarrera": {
    "escenarioOptimista": {"descripcion":"string max 300","nivelProyecto":"string","clubTipo":"string","edadPeak":number},
    "escenarioRealista": {"descripcion":"string max 300","nivelProyecto":"string","clubTipo":"string"},
    "factoresClave": ["max 4 strings"],
    "riesgos": ["max 3 strings"]
  },
  "planDesarrollo": {
    "objetivo6meses": "string max 200",
    "objetivo18meses": "string max 200",
    "pilaresTrabajo": [{"pilar":"string","acciones":["max 3"],"prioridad":"crítica|alta|media"}],
    "recomendacionEntrenador": "string max 300"
  },
  "confianza": 0-1,
  "modeloUsado": "claude-sonnet-4-20250514"
}

Usa jugadores profesionales REALES para jugadorReferencia (usa IDs tipo "pro-nombre"). Basa tu análisis en lo que observas en los fotogramas. Sé honesto y específico. Responde en español.`;

        // Build content array: images first, then text prompt
        const content: unknown[] = [...imageBlocks, { type: "text", text: prompt }];

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
              max_tokens: 4096,
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

        send("progress", { step: "Finalizando informe...", percent: 95 });
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
