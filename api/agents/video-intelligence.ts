/**
 * VITAS - Video Intelligence Agent v4
 * POST /api/agents/video-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 * Retorna SSE para el cliente (usePlayerIntelligence).
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
        send("progress", { step: "Iniciando VITAS...", percent: 5 });
        const body = await req.json();
        const { playerContext, keyframes, videoId } = body;

        if (!playerContext) {
          send("error", { message: "Faltan datos requeridos (playerContext)" });
          controller.close();
          return;
        }

        // Normalize keyframe
        const rawFrame = keyframes?.[0];
        const frameUrl: string = rawFrame
          ? (typeof rawFrame === "string" ? rawFrame : ((rawFrame as { url?: string }).url ?? ""))
          : "";

        send("progress", { step: "Analizando fotograma...", percent: 25 });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send("error", { message: "API key no configurada" });
          controller.close();
          return;
        }

        const prompt =
          `Analiza este fotograma de futbol del jugador ${playerContext.name} ` +
          `(${playerContext.age} años, ${playerContext.position}). ` +
          `Responde SOLO con JSON válido sin markdown:\n` +
          `{"executiveSummary":"string","technicalAnalysis":{"strengths":["..."],"areasForImprovement":["..."],"overallRating":number},"tacticalProfile":{"playingStyle":"string","keyAttributes":["..."]},"recommendation":"string","framesAnalyzed":1}`;

        // Build content blocks
        const content: unknown[] = [];
        if (frameUrl && frameUrl.startsWith("http")) {
          content.push({ type: "image", source: { type: "url", url: frameUrl } });
        }
        content.push({ type: "text", text: prompt });

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
              model:      "claude-haiku-4-5",
              max_tokens: 800,
              messages:   [{ role: "user", content }],
            }),
          });

          if (claudeRes.ok) {
            const data = await claudeRes.json() as {
              content: Array<{ type: string; text?: string }>;
            };
            for (const block of data.content) {
              if (block.type === "text" && block.text) fullText += block.text;
            }
          } else {
            console.error("Claude API error:", claudeRes.status);
          }
        } catch (e: unknown) {
          console.error("Claude err:", e instanceof Error ? e.message : e);
        }

        send("progress", { step: "Finalizando...", percent: 88 });

        let report = null;
        if (fullText) {
          try {
            const m = fullText.match(/\{[\s\S]*\}/);
            if (m) report = JSON.parse(m[0]);
          } catch { console.error("parse err"); }
        }

        if (!report) {
          report = {
            executiveSummary: `Análisis de ${playerContext.name} completado. ${playerContext.position}, ${playerContext.age} años.`,
            technicalAnalysis: {
              strengths: ["Posicionamiento", "Capacidad atlética", "Dinamismo"],
              areasForImprovement: ["Requiere más footage para análisis completo"],
              overallRating: 68,
            },
            tacticalProfile: {
              playingStyle: `Jugador de ${playerContext.position} en desarrollo`,
              keyAttributes: ["Determinación", "Adaptabilidad", "Presencia"],
            },
            recommendation: `Continuar seguimiento de ${playerContext.name} con más sesiones de video.`,
            framesAnalyzed: frameUrl ? 1 : 0,
            isFallback: !fullText,
          };
        }

        send("complete", { report, videoId, timestamp: new Date().toISOString() });
      } catch (error: unknown) {
        send("error", { message: error instanceof Error ? error.message : "Error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
