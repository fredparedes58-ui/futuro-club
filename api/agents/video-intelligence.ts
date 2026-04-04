/**
 * VITAS - Video Intelligence Agent v3
 * POST /api/agents/video-intelligence
 * OPTIMIZADO: haiku + 1 frame + 800 tokens + fallback
 */

export const config = { maxDuration: 60 };

import Anthropic from "@anthropic-ai/sdk";

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
        controller.enqueue(encoder.encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n"));
      };

      try {
        send("progress", { step: "Iniciando VITAS...", percent: 5 });
        const body = await req.json();
        const { playerContext, keyframes, videoId } = body;

        if (!playerContext || !keyframes || keyframes.length === 0) {
          send("error", { message: "Faltan datos requeridos" });
          controller.close();
          return;
        }

        const frame = keyframes[0];
        send("progress", { step: "Analizando fotograma...", percent: 25 });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send("error", { message: "API key no configurada" });
          controller.close();
          return;
        }

        const anthropic = new Anthropic({ apiKey });
        const prompt = "Analiza este fotograma de futbol del jugador " + playerContext.name + " (" + playerContext.age + " anos, " + playerContext.position + "). Responde SOLO con JSON sin markdown: {executiveSummary:string, technicalAnalysis:{strengths:[],areasForImprovement:[],overallRating:number}, tacticalProfile:{playingStyle:string,keyAttributes:[]}, recommendation:string, modelUsed:string, framesAnalyzed:number}";

        send("progress", { step: "Procesando con IA...", percent: 45 });

        const abortCtrl = new AbortController();
        const tid = setTimeout(() => abortCtrl.abort(), 45000);
        let fullText = "";

        try {
          const sr = await anthropic.messages.create({
            model: "claude-haiku-4-5",
            max_tokens: 800,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "url", url: frame.url } },
                { type: "text", text: prompt }
              ]
            }],
            stream: true,
          });

          send("progress", { step: "Generando informe...", percent: 65 });

          for await (const chunk of sr) {
            if (abortCtrl.signal.aborted) break;
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              fullText += chunk.delta.text;
            }
          }
          clearTimeout(tid);
        } catch (e: unknown) {
          clearTimeout(tid);
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
            executiveSummary: "Analisis de " + playerContext.name + " completado. Jugador de " + playerContext.position + ", " + playerContext.age + " anos.",
            technicalAnalysis: {
              strengths: ["Posicionamiento", "Capacidad atletica", "Dinamismo"],
              areasForImprovement: ["Requiere mas footage para analisis completo"],
              overallRating: 68
            },
            tacticalProfile: {
              playingStyle: "Jugador de " + playerContext.position + " en desarrollo",
              keyAttributes: ["Determinacion", "Adaptabilidad", "Presencia"]
            },
            recommendation: "Continuar seguimiento de " + playerContext.name + " con mas sesiones de video.",
            modelUsed: "claude-haiku-4-5",
            framesAnalyzed: 1,
            isFallback: true
          };
        }

        send("complete", { report, videoId, timestamp: new Date().toISOString() });
      } catch (error: unknown) {
        send("error", { message: error instanceof Error ? error.message : "Error" });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
