/**
 * VITAS · Pipeline Start
 * POST /api/pipeline/start
 *
 * Orquesta el pipeline completo de análisis de video:
 *   1. Obtiene metadatos del video desde Bunny Stream
 *   2. Construye keyframes desde thumbnails de Bunny
 *   3. Obtiene contexto del jugador desde Supabase
 *   4. Llama a /api/agents/video-intelligence con todos los datos
 *   5. Devuelve el reporte completo al cliente
 *
 * Body: { videoId, playerId, analysisMode?, homographyPoints? }
 */

export const config = { maxDuration: 60 };

interface HomographyPoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

interface PipelineStartBody {
  videoId:           string;
  playerId:          string;
  analysisMode?:     string;
  homographyPoints?: HomographyPoint[];
}

interface BunnyVideoInfo {
  videoId:       string;
  title:         string;
  length:        number;        // seconds
  width:         number;
  height:        number;
  thumbnailFileName?: string;
  status:        number;
  storageSize:   number;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const bunnyLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const bunnyApiKey    = process.env.BUNNY_STREAM_API_KEY;
  const bunnyCdnHost   = process.env.BUNNY_CDN_HOSTNAME || process.env.VITE_BUNNY_CDN_HOSTNAME;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL;
  const supabaseKey    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const baseUrl        = new URL(req.url).origin;

  // ─── Parse body ────────────────────────────────────────────────────────────
  let body: PipelineStartBody;
  try {
    body = await req.json() as PipelineStartBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { videoId, playerId, analysisMode } = body;

  if (!videoId || !playerId) {
    return new Response(
      JSON.stringify({ error: "videoId and playerId are required" }),
      { status: 400 }
    );
  }

  // ─── 1. Fetch video info from Bunny Stream ─────────────────────────────────
  let videoDuration = 0;
  let keyframes: string[] = [];

  if (bunnyLibraryId && bunnyApiKey) {
    try {
      const bunnyRes = await fetch(
        `https://video.bunnycdn.com/library/${bunnyLibraryId}/videos/${videoId}`,
        { headers: { AccessKey: bunnyApiKey } }
      );
      if (bunnyRes.ok) {
        const info = await bunnyRes.json() as BunnyVideoInfo;
        videoDuration = info.length ?? 0;

        // Build keyframe URLs from Bunny CDN thumbnails
        // Bunny provides thumbnail at ?time=X (seconds) on some plans
        // Fallback: use standard thumbnail endpoint
        const cdnHost = bunnyCdnHost || `${videoId}.b-cdn.net`;
        const thumbBase = `https://${cdnHost}/${videoId}`;

        if (videoDuration > 0) {
          // Sample at 5 evenly-spaced points
          const intervals = [0.05, 0.2, 0.4, 0.6, 0.8];
          intervals.forEach(pct => {
            const t = Math.round(videoDuration * pct);
            keyframes.push(`${thumbBase}/thumbnail.jpg?time=${t}`);
          });
        } else {
          // Fallback: single thumbnail
          keyframes.push(`${thumbBase}/thumbnail.jpg`);
        }
      }
    } catch {
      /* Bunny unavailable, continue without keyframes */
    }
  }

  // If no keyframes from Bunny, signal graceful degradation
  if (keyframes.length === 0) {
    // Still run the analysis — Claude will work with player data only (no vision)
    keyframes = [];
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
    foot:             foot as "right" | "left" | "both",
    height:           pd.height  as number | undefined,
    weight:           pd.weight  as number | undefined,
    currentVSI:       pd.vsi     as number | undefined,
    phvCategory:      pd.phvCategory as "early" | "ontme" | "late" | undefined,
    phvOffset:        pd.phvOffset   as number | undefined,
    competitiveLevel: (pd.competitiveLevel as string | undefined) ?? "Regional",
  };

  const rawMetrics = pd.metrics as Record<string, number> | undefined;
  const vsiMetrics = rawMetrics
    ? {
        speed:     rawMetrics.speed     ?? 70,
        shooting:  rawMetrics.shooting  ?? 70,
        vision:    rawMetrics.vision    ?? 70,
        technique: rawMetrics.technique ?? 70,
        defending: rawMetrics.defending ?? 70,
        stamina:   rawMetrics.stamina   ?? 70,
      }
    : undefined;

  // ─── 4. Forward to video-intelligence agent ─────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";

  try {
    const intelligenceRes = await fetch(`${baseUrl}/api/agents/video-intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        playerId,
        videoId,
        playerContext,
        keyframes,
        videoDuration: videoDuration || undefined,
        vsiMetrics,
        analysisMode,
      }),
    });

    const result = await intelligenceRes.json() as Record<string, unknown>;

    // Pass through the response, enriched with pipeline metadata
    return new Response(
      JSON.stringify({
        ...result,
        pipelineMeta: {
          keyframesUsed:  keyframes.length,
          videoDuration,
          analysisMode:   analysisMode ?? "all",
          bunnyConfigured: !!(bunnyLibraryId && bunnyApiKey),
          ranAt:          new Date().toISOString(),
        },
      }),
      {
        status:  intelligenceRes.status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[pipeline/start] video-intelligence call failed:", msg);
    return new Response(
      JSON.stringify({ error: "Pipeline execution failed", details: msg }),
      { status: 500 }
    );
  }
}
