/**
 * VITAS · Pipeline Start v3
 * POST /api/pipeline/start
 *
 * Llama a la API de Anthropic directamente con fetch() — SIN SDK.
 * El SDK (~30MB) causaba FUNCTION_INVOCATION_TIMEOUT en cold-start de Vercel.
 *
 * Body: { videoId, playerId, analysisMode? }
 */

export const config = { maxDuration: 60 };

interface PipelineStartBody {
  videoId:       string;
  playerId:      string;
  analysisMode?: string;
}

interface BunnyVideoInfo {
  length: number;
  width:  number;
  height: number;
  status: number;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

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

  const bunnyLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const bunnyApiKey    = process.env.BUNNY_STREAM_API_KEY;
  const bunnyCdnHost   = process.env.BUNNY_CDN_HOSTNAME || process.env.VITE_BUNNY_CDN_HOSTNAME;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const supabaseKey    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const anthropicKey   = process.env.ANTHROPIC_API_KEY;

  // ─── 1. Fetch video info from Bunny ────────────────────────────────────────
  let videoDuration = 0;
  let frameUrl = "";

  if (bunnyLibraryId && bunnyApiKey) {
    try {
      const r = await fetch(
        `https://video.bunnycdn.com/library/${bunnyLibraryId}/videos/${videoId}`,
        { headers: { AccessKey: bunnyApiKey } }
      );
      if (r.ok) {
        const info = await r.json() as BunnyVideoInfo;
        videoDuration = info.length ?? 0;
        const cdn = bunnyCdnHost || `${videoId}.b-cdn.net`;
        const t = videoDuration > 0 ? Math.round(videoDuration * 0.2) : 0;
        frameUrl = `https://${cdn}/${videoId}/thumbnail.jpg` + (t > 0 ? `?time=${t}` : "");
      }
    } catch { /* Bunny unavailable */ }
  }

  // ─── 2. Fetch player context from Supabase ─────────────────────────────────
  let playerName = "Jugador";
  let playerAge  = 15;
  let playerPos  = "CM";

  if (supabaseUrl && supabaseKey) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&select=data&limit=1`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (r.ok) {
        const rows = await r.json() as Array<{ data: Record<string, unknown> }>;
        if (rows.length > 0) {
          const pd = rows[0].data ?? {};
          playerName = (pd.name as string) ?? playerName;
          playerAge  = (pd.age  as number) ?? playerAge;
          playerPos  = (pd.position as string) ?? playerPos;
        }
      }
    } catch { /* fallback defaults */ }
  }

  // ─── 3. Call Claude via raw fetch (NO SDK) ─────────────────────────────────
  if (!anthropicKey) {
    return json({
      success: true,
      report: fallback(playerName, playerPos, playerAge),
      pipelineMeta: buildMeta(0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
    });
  }

  try {
    const prompt =
      `Analiza este fotograma de futbol del jugador ${playerName} ` +
      `(${playerAge} años, ${playerPos}). ` +
      `Responde SOLO con JSON válido sin markdown:\n` +
      `{"executiveSummary":"string","technicalAnalysis":{"strengths":["..."],"areasForImprovement":["..."],"overallRating":number},"tacticalProfile":{"playingStyle":"string","keyAttributes":["..."]},"recommendation":"string","framesAnalyzed":1}`;

    // Build content blocks
    const content: unknown[] = [];
    if (frameUrl && frameUrl.startsWith("http")) {
      content.push({ type: "image", source: { type: "url", url: frameUrl } });
    }
    content.push({ type: "text", text: prompt });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5",
        max_tokens: 800,
        messages:   [{ role: "user", content }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      console.error("[pipeline] Claude API error:", claudeRes.status, errText);
      return json({
        success: true,
        report: fallback(playerName, playerPos, playerAge),
        pipelineMeta: buildMeta(0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
        warning: `Claude API ${claudeRes.status}`,
      });
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    let fullText = "";
    for (const block of claudeData.content) {
      if (block.type === "text" && block.text) fullText += block.text;
    }

    let report: Record<string, unknown> | null = null;
    if (fullText) {
      try {
        const m = fullText.match(/\{[\s\S]*\}/);
        if (m) report = JSON.parse(m[0]) as Record<string, unknown>;
      } catch { /* parse error */ }
    }

    return json({
      success: true,
      report: report ?? fallback(playerName, playerPos, playerAge),
      pipelineMeta: buildMeta(frameUrl ? 1 : 0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pipeline] error:", msg);
    return json({
      success: true,
      report: fallback(playerName, playerPos, playerAge),
      pipelineMeta: buildMeta(0, videoDuration, analysisMode, !!(bunnyLibraryId && bunnyApiKey)),
      warning: msg,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fallback(name: string, pos: string, age: number) {
  return {
    executiveSummary: `Análisis de ${name} completado. ${pos}, ${age} años.`,
    technicalAnalysis: {
      strengths: ["Posicionamiento", "Capacidad atlética", "Dinamismo"],
      areasForImprovement: ["Requiere más footage para análisis completo"],
      overallRating: 68,
    },
    tacticalProfile: {
      playingStyle: `Jugador de ${pos} en desarrollo`,
      keyAttributes: ["Determinación", "Adaptabilidad", "Presencia"],
    },
    recommendation: `Continuar seguimiento de ${name} con más sesiones de video.`,
    framesAnalyzed: 0,
    isFallback: true,
  };
}

function buildMeta(frames: number, duration: number, mode?: string, bunny?: boolean) {
  return {
    keyframesUsed: frames, videoDuration: duration,
    analysisMode: mode ?? "all", bunnyConfigured: !!bunny,
    ranAt: new Date().toISOString(),
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
