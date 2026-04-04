/**
 * VITAS · Pipeline Start v2
 * POST /api/pipeline/start
 *
 * Orquesta el pipeline completo de análisis de video:
 *   1. Obtiene metadatos del video desde Bunny Stream
 *   2. Construye keyframes desde thumbnails de Bunny
 *   3. Obtiene contexto del jugador desde Supabase
 *   4. Llama a Claude DIRECTAMENTE (sin pasar por video-intelligence SSE)
 *   5. Devuelve el reporte JSON al cliente
 *
 * Body: { videoId, playerId, analysisMode?, homographyPoints? }
 */

export const config = { maxDuration: 60 };

import Anthropic from "@anthropic-ai/sdk";

interface PipelineStartBody {
  videoId:      string;
  playerId:     string;
  analysisMode?: string;
}

interface BunnyVideoInfo {
  videoId:            string;
  title:              string;
  length:             number;
  width:              number;
  height:             number;
  thumbnailFileName?: string;
  status:             number;
  storageSize:        number;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const bunnyLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const bunnyApiKey    = process.env.BUNNY_STREAM_API_KEY;
  const bunnyCdnHost   = process.env.BUNNY_CDN_HOSTNAME || process.env.VITE_BUNNY_CDN_HOSTNAME;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const supabaseKey    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const anthropicKey   = process.env.ANTHROPIC_API_KEY;

  // ─── Parse body ────────────────────────────────────────────────────────────
  let body: PipelineStartBody;
  try {
    body = await req.json() as PipelineStartBody;
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { videoId, playerId, analysisMode } = body;

  if (!videoId || !playerId) {
    return json({ success: false, error: "videoId and playerId are required" }, 400);
  }

  // ─── 1. Fetch video info from Bunny Stream ─────────────────────────────────
  let videoDuration = 0;
  let frameUrl = "";

  if (bunnyLibraryId && bunnyApiKey) {
    try {
      const bunnyRes = await fetch(
        `https://video.bunnycdn.com/library/${bunnyLibraryId}/videos/${videoId}`,
        { headers: { AccessKey: bunnyApiKey } }
      );
      if (bunnyRes.ok) {
        const info = await bunnyRes.json() as BunnyVideoInfo;
        videoDuration = info.length ?? 0;

        const cdnHost = bunnyCdnHost || `${videoId}.b-cdn.net`;
        const thumbBase = `https://${cdnHost}/${videoId}`;

        if (videoDuration > 0) {
          const t = Math.round(videoDuration * 0.2);
          frameUrl = `${thumbBase}/thumbnail.jpg?time=${t}`;
        } else {
          frameUrl = `${thumbBase}/thumbnail.jpg`;
        }
      }
    } catch {
      /* Bunny unavailable, continue without frame */
    }
  }

  // ─── 2. Fetch player context from Supabase ──────────────────────────────────
  let playerData: Record<string, unknown> | null = null;

  if (supabaseUrl && supabaseKey && playerId) {
    try {
      const playerRes = await fetch(
        `${supabaseUrl}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&select=data&limit=1`,
        {
          headers: {
            apikey:        supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );
      if (playerRes.ok) {
        const rows = await playerRes.json() as Array<{ data: Record<string, unknown> }>;
        if (rows.length > 0) playerData = rows[0].data;
      }
    } catch { /* fallback to defaults */ }
  }

  // ─── 3. Build playerContext ─────────────────────────────────────────────────
  const pd = playerData ?? {};
  const foot = pd.foot === "right" ? "right" : pd.foot === "left" ? "left" : "both";

  const playerContext = {
    name:             (pd.name  as string | undefined) ?? "Jugador",
    age:              (pd.age   as number | undefined) ?? 15,
    position:         (pd.position as string | undefined) ?? "CM",
    foot,
    competitiveLevel: (pd.competitiveLevel as string | undefined) ?? "Regional",
  };

  // ─── 4. Call Claude DIRECTLY (no SSE middleman) ─────────────────────────────
  if (!anthropicKey) {
    return json({
      success: true,
      report: buildFallback(playerContext),
      pipelineMeta: meta(0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const prompt =
      `Analiza este fotograma de futbol del jugador ${playerContext.name} ` +
      `(${playerContext.age} años, ${playerContext.position}, pie ${playerContext.foot}). ` +
      `Responde SOLO con JSON válido sin markdown:\n` +
      `{"executiveSummary":"string","technicalAnalysis":{"strengths":["..."],"areasForImprovement":["..."],"overallRating":number},"tacticalProfile":{"playingStyle":"string","keyAttributes":["..."]},"recommendation":"string","framesAnalyzed":1}`;

    // Build content blocks — image only if we have a valid URL
    type Block = { type: "image"; source: { type: "url"; url: string } } | { type: "text"; text: string };
    const content: Block[] = [];
    if (frameUrl && frameUrl.startsWith("http")) {
      content.push({ type: "image", source: { type: "url", url: frameUrl } });
    }
    content.push({ type: "text", text: prompt });

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content }],
    });

    // Extract text from response
    let fullText = "";
    for (const block of msg.content) {
      if (block.type === "text") fullText += block.text;
    }

    let report: Record<string, unknown> | null = null;
    if (fullText) {
      try {
        const m = fullText.match(/\{[\s\S]*\}/);
        if (m) report = JSON.parse(m[0]) as Record<string, unknown>;
      } catch { /* parse error — use fallback */ }
    }

    if (!report) report = buildFallback(playerContext);

    return json({
      success: true,
      report,
      pipelineMeta: meta(frameUrl ? 1 : 0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pipeline/start] Claude call failed:", msg);

    // Still return success with fallback report — don't break the upload flow
    return json({
      success: true,
      report: buildFallback(playerContext),
      pipelineMeta: meta(0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
      warning: msg,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildFallback(ctx: { name: string; position: string; age: number }) {
  return {
    executiveSummary: `Análisis de ${ctx.name} completado. Jugador de ${ctx.position}, ${ctx.age} años.`,
    technicalAnalysis: {
      strengths: ["Posicionamiento", "Capacidad atlética", "Dinamismo"],
      areasForImprovement: ["Requiere más footage para análisis completo"],
      overallRating: 68,
    },
    tacticalProfile: {
      playingStyle: `Jugador de ${ctx.position} en desarrollo`,
      keyAttributes: ["Determinación", "Adaptabilidad", "Presencia"],
    },
    recommendation: `Continuar seguimiento de ${ctx.name} con más sesiones de video.`,
    framesAnalyzed: 0,
    isFallback: true,
  };
}

function meta(frames: number, duration: number, mode?: string, bunny?: boolean) {
  return {
    keyframesUsed:   frames,
    videoDuration:   duration,
    analysisMode:    mode ?? "all",
    bunnyConfigured: !!bunny,
    ranAt:           new Date().toISOString(),
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
