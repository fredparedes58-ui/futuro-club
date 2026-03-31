/**
 * VITAS · Video Intelligence Agent
 * POST /api/agents/video-intelligence
 *
 * Analiza keyframes de video con Claude Sonnet vision y genera:
 *   1. Estado Actual (6 dimensiones)
 *   2. ADN Futbolístico
 *   3. Jugador Referencia / Clon (similitud coseno)
 *   4. Proyección de Carrera
 *   5. Plan de Desarrollo
 *
 * Body: { playerId, videoId, playerContext, keyframes[], videoDuration? }
 * Response: VideoIntelligenceOutput
 */

export const config = { runtime: "edge" };

import Anthropic from "@anthropic-ai/sdk";
import type { ProPlayer } from "../../src/data/proPlayers";

// ─── Tipos locales (Edge runtime no puede importar el bundle completo) ────────

interface PlayerContext {
  name:             string;
  age:              number;
  position:         string;
  foot:             "right" | "left" | "both";
  height?:          number;
  weight?:          number;
  currentVSI?:      number;
  phvCategory?:     "early" | "ontme" | "late";
  phvOffset?:       number;
  competitiveLevel?: string;
}

interface RequestBody {
  playerId:       string;
  videoId:        string;
  playerContext:  PlayerContext;
  keyframes:      string[];
  videoDuration?: number;
  vsiMetrics?: {
    speed:     number;
    shooting:  number;
    vision:    number;
    technique: number;
    defending: number;
    stamina:   number;
  };
}

// ─── Posición helpers ─────────────────────────────────────────────────────────

const POSITION_GROUPS: Record<string, string[]> = {
  GK: ["GK"],
  CB: ["CB", "RCB", "LCB"],
  FB: ["RB", "LB", "WB", "RWB", "LWB"],
  DM: ["CDM", "DM"],
  CM: ["CM", "LCM", "RCM"],
  AM: ["CAM", "SS", "LM", "RM"],
  W:  ["LW", "RW"],
  ST: ["ST", "CF"],
};
const ADJACENT: Record<string, string[]> = {
  ST: ["W", "AM"], W: ["ST", "AM"], AM: ["W", "CM"],
  CM: ["AM", "DM"], DM: ["CM", "CB"], FB: ["CB", "W"], CB: ["DM", "FB"],
};
function getGroup(pos: string) {
  for (const [g, list] of Object.entries(POSITION_GROUPS)) if (list.includes(pos)) return g;
  return "CM";
}
function isCompatible(yP: string, proP: string) {
  const yG = getGroup(yP), pG = getGroup(proP);
  return yG === pG || (ADJACENT[yG]?.includes(pG) ?? false);
}

// ─── Similitud coseno ─────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]) {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; mA += a[i]*a[i]; mB += b[i]*b[i]; }
  return mA && mB ? dot / (Math.sqrt(mA) * Math.sqrt(mB)) : 0;
}

// ─── Prompt del agente ────────────────────────────────────────────────────────

function buildSystemPrompt(player: PlayerContext, top5: ProPlayer[]): string {
  const phvInfo = player.phvCategory
    ? `PHV: ${player.phvCategory} (offset ${player.phvOffset?.toFixed(1) ?? "N/A"} años)`
    : "PHV: no disponible";

  const proNames = top5.map((p, i) => `${i+1}. ${p.name} (${p.position}, ${p.club}) — overall ${p.overall}`).join("\n");

  return `Eres VITAS Intelligence, el sistema de análisis de talento futbolístico más avanzado.
Analizas jugadores de academia (8-21 años) con visión computacional sobre keyframes de video.

JUGADOR A ANALIZAR:
- Nombre: ${player.name}
- Edad: ${player.age} años
- Posición: ${player.position}
- Pie: ${player.foot}
- Altura: ${player.height ?? "N/D"} cm
- Peso: ${player.weight ?? "N/D"} kg
- Nivel competitivo: ${player.competitiveLevel ?? "Regional"}
- VSI actual: ${player.currentVSI ?? "N/D"}/100
- ${phvInfo}

TOP 5 JUGADORES PROFESIONALES POR SIMILITUD MÉTRICA:
${proNames}

INSTRUCCIONES CRÍTICAS:
1. Analiza LOS KEYFRAMES con máximo detalle técnico-táctico
2. Genera un informe JSON EXACTO según el schema indicado
3. El análisis de video COMPLEMENTA el PHV (no lo reemplaza)
4. Sé específico con las observaciones — menciona acciones concretas vistas en los frames
5. El ajusteVSIVideoScore debe ser entre -15 y +15 (corrección sobre el VSI actual)
6. Los jugadores referencia deben corresponder a los del top5 proporcionado
7. Responde SOLO el JSON, sin markdown, sin texto adicional`;
}

function buildUserPrompt(duration?: number): string {
  return `Analiza estos keyframes del partido/entrenamiento${duration ? ` (duración: ${duration}s)` : ""} y genera el informe VITAS Intelligence completo.

Devuelve EXCLUSIVAMENTE este JSON (sin markdown):
{
  "estadoActual": {
    "resumenEjecutivo": "...",
    "nivelActual": "medio_alto",
    "fortalezasPrimarias": ["...", "..."],
    "areasDesarrollo": ["..."],
    "dimensiones": {
      "velocidadDecision":    { "score": 7.5, "observacion": "..." },
      "tecnicaConBalon":      { "score": 8.0, "observacion": "..." },
      "inteligenciaTactica":  { "score": 7.0, "observacion": "..." },
      "capacidadFisica":      { "score": 7.5, "observacion": "..." },
      "liderazgoPresencia":   { "score": 6.5, "observacion": "..." },
      "eficaciaCompetitiva":  { "score": 7.0, "observacion": "..." }
    },
    "ajusteVSIVideoScore": 3
  },
  "adnFutbolistico": {
    "estiloJuego": "...",
    "arquetipoTactico": "...",
    "patrones": [
      { "patron": "...", "frecuencia": "alto", "descripcion": "..." }
    ],
    "mentalidad": "..."
  },
  "jugadorReferencia": {
    "top5": [
      { "proPlayerId": "...", "nombre": "...", "posicion": "...", "club": "...", "score": 82.5, "razonamiento": "..." }
    ],
    "bestMatch": {
      "proPlayerId": "...", "nombre": "...", "posicion": "...", "club": "...", "score": 82.5, "narrativa": "..."
    }
  },
  "proyeccionCarrera": {
    "escenarioOptimista": { "descripcion": "...", "nivelProyecto": "Primera División", "clubTipo": "...", "edadPeak": 26 },
    "escenarioRealista":  { "descripcion": "...", "nivelProyecto": "Segunda División", "clubTipo": "..." },
    "factoresClave": ["..."],
    "riesgos": ["..."]
  },
  "planDesarrollo": {
    "objetivo6meses": "...",
    "objetivo18meses": "...",
    "pilaresTrabajo": [
      { "pilar": "...", "acciones": ["..."], "prioridad": "alta" }
    ],
    "recomendacionEntrenador": "..."
  },
  "confianza": 0.85
}`;
}

// ─── Similitud para obtener top5 ────────────────────────────────────────────

async function getTop5(
  vsiMetrics: RequestBody["vsiMetrics"],
  position: string,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<ProPlayer[]> {
  if (!vsiMetrics) return [];

  // Intentar Supabase primero
  let allPros: ProPlayer[] = [];
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/pro_players?select=*&overall=gte.70`, {
        headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
      });
      if (res.ok) allPros = await res.json();
    } catch { /* fallback */ }
  }

  if (allPros.length === 0) return []; // sin datos, Claude infiere sólo con el prompt

  // Calcular similitud
  const yVec = [
    vsiMetrics.speed / 100, vsiMetrics.shooting / 100,
    vsiMetrics.vision / 100, vsiMetrics.technique / 100,
    vsiMetrics.defending / 100, vsiMetrics.stamina / 100,
  ];

  const scored = allPros.map(pro => {
    const pVec = [pro.pace/99, pro.shooting/99, pro.passing/99, pro.dribbling/99, pro.defending/99, pro.physic/99];
    let sim = cosine(yVec, pVec);
    if (isCompatible(position, pro.position)) sim = Math.min(1, sim * 1.05);
    return { pro, sim };
  });

  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, 5).map(s => s.pro);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured", code: "missing_api_key" }),
      { status: 503 }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { playerId, videoId, playerContext, keyframes, videoDuration, vsiMetrics } = body;

  if (!playerId || !videoId || !playerContext || !keyframes?.length) {
    return new Response(
      JSON.stringify({ error: "playerId, videoId, playerContext and keyframes are required" }),
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  // Obtener top5 similares para incluir en el prompt
  const top5Pros = await getTop5(vsiMetrics, playerContext.position, supabaseUrl, supabaseKey);

  // Construir mensajes para Claude
  const systemPrompt = buildSystemPrompt(playerContext, top5Pros);
  const userPromptText = buildUserPrompt(videoDuration);

  // Construir content con imágenes
  const imageContent: Anthropic.ImageBlockParam[] = keyframes
    .slice(0, 10) // máximo 10 keyframes
    .map((url) => ({
      type: "image",
      source: {
        type: "url",
        url,
      },
    }));

  const client = new Anthropic({ apiKey });

  let rawResponse = "";
  let tokensUsed = 0;

  try {
    const message = await client.messages.create({
      model:       "claude-sonnet-4-5",
      max_tokens:  4096,
      system:      systemPrompt,
      messages: [
        {
          role:    "user",
          content: [
            ...imageContent,
            { type: "text", text: userPromptText },
          ],
        },
      ],
    });

    rawResponse  = (message.content[0] as { type: string; text: string }).text ?? "";
    tokensUsed   = message.usage.input_tokens + message.usage.output_tokens;

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[video-intelligence] Claude error:", errMsg);
    return new Response(
      JSON.stringify({ error: "Claude API error", details: errMsg }),
      { status: 502 }
    );
  }

  // Parsear JSON de la respuesta
  let report: Record<string, unknown>;
  try {
    // Limpiar posibles bloques de código markdown
    const cleaned = rawResponse
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    report = JSON.parse(cleaned);
  } catch {
    console.error("[video-intelligence] Parse error. Raw:", rawResponse.slice(0, 200));
    return new Response(
      JSON.stringify({ error: "Failed to parse model response", raw: rawResponse.slice(0, 500) }),
      { status: 500 }
    );
  }

  // Enriquecer con similarity scores calculados
  if (top5Pros.length > 0 && report.jugadorReferencia) {
    const jr = report.jugadorReferencia as Record<string, unknown>;
    // Asegurar que top5 tiene los datos correctos de la DB
    const top5Array = jr.top5 as unknown[] | undefined;
    if (!top5Array || !top5Array.length) {
      const yVec = vsiMetrics
        ? [vsiMetrics.speed/100, vsiMetrics.shooting/100, vsiMetrics.vision/100,
           vsiMetrics.technique/100, vsiMetrics.defending/100, vsiMetrics.stamina/100]
        : null;

      const mappedTop5 = top5Pros.map(pro => {
        const pVec = [pro.pace/99, pro.shooting/99, pro.passing/99, pro.dribbling/99, pro.defending/99, pro.physic/99];
        const sim  = yVec ? Math.round(cosine(yVec, pVec) * 1000) / 10 : 70;
        return {
          proPlayerId: pro.id,
          nombre:      pro.name,
          posicion:    pro.position,
          club:        pro.club,
          score:       sim,
          razonamiento: `Métricas similares en ${pro.position} — overall ${pro.overall}`,
        };
      });
      jr.top5     = mappedTop5;
      jr.bestMatch = mappedTop5[0];
    }
  }

  // Guardar en Supabase si está configurado
  if (supabaseUrl && supabaseKey) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/player_analyses`, {
        method: "POST",
        headers: {
          "apikey":        supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=minimal",
        },
        body: JSON.stringify({
          user_id:         null, // será rellenado por RLS si hay auth header
          player_id:       playerId,
          video_id:        videoId,
          report:          report,
          similarity_top5: top5Pros,
          projection:      report.proyeccionCarrera,
        }),
      });
    } catch {
      // No fallar si Supabase no puede guardar
    }
  }

  return new Response(
    JSON.stringify({
      success:     true,
      playerId,
      videoId,
      report,
      top5Pros,
      tokensUsed,
      modelUsed:   "claude-sonnet-4-5",
      generatedAt: new Date().toISOString(),
    }),
    {
      status:  200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }
  );
}
