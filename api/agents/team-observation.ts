/**
 * VITAS - Team Observation Agent (Gemini)
 * POST /api/agents/team-observation
 *
 * Node runtime — video puede ser grande.
 * Envía el video completo a Gemini para observación táctica del equipo.
 * Retorna JSON con formación, posesión, jugadores, fases de juego.
 */

export const config = { runtime: "nodejs", maxDuration: 120 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { videoBase64, mediaType, teamContext } = body;

    if (!videoBase64 || !teamContext) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos (videoBase64, teamContext)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY no configurada", fallback: true }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const ctx = teamContext;
    const prompt = `Eres un analista táctico de fútbol de élite. Observa este video completo con máxima atención.
Analiza al EQUIPO que viste uniforme color ${ctx.teamColor || "?"}.
${ctx.opponentColor ? `El rival viste color ${ctx.opponentColor}.` : ""}

CONTEXTO:
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
- Jugadores esperados: ${ctx.playerCount || "11"}

INSTRUCCIONES:
1. Observa TODO el video de principio a fin
2. Identifica la FORMACIÓN del equipo (4-3-3, 4-4-2, 3-5-2, etc.)
3. Estima el % de posesión de cada equipo
4. Para CADA jugador del equipo analizado, registra:
   - Dorsal estimado (si es visible)
   - Posición en el campo
   - Hasta 5 acciones principales con timestamps
   - Conteo de eventos: pases completados/fallados, recuperaciones, duelos, disparos, centros
5. Analiza las fases de juego colectivas: pressing, transiciones, posesión
6. Identifica momentos colectivos destacados (positivos y negativos)

Genera un análisis con esta estructura JSON exacta (sin markdown, sin backticks):

{
  "formacionDetectada": "4-3-3",
  "posesionEstimada": {"equipo": 55, "rival": 45},
  "jugadoresObservados": [
    {
      "dorsalEstimado": "7",
      "posicionEstimada": "extremo derecho",
      "acciones": [
        {"timestamp": "0:15", "tipo": "accion_con_balon", "descripcion": "Recibe y desborda por banda"},
        {"timestamp": "1:30", "tipo": "defensiva", "descripcion": "Pressing alto sobre lateral rival"}
      ],
      "eventosContados": {
        "pasesCompletados": 8,
        "pasesFallados": 2,
        "recuperaciones": 1,
        "duelosGanados": 2,
        "duelosPerdidos": 1,
        "disparosAlArco": 0,
        "centros": 3
      }
    }
  ],
  "fasesJuego": {
    "pressing": {
      "tipo": "pressing alto tras pérdida",
      "alturaLinea": "alta",
      "intensidad": 7,
      "observaciones": ["Presionan en bloque los 3 delanteros", "Activación inmediata tras perder balón"]
    },
    "transicionOfensiva": {
      "velocidad": "rápida",
      "patrones": ["Balón largo a extremos en velocidad", "Transiciones por banda derecha"]
    },
    "transicionDefensiva": {
      "velocidad": "media",
      "patrones": ["Repliegue ordenado", "Mediocampistas retroceden a posición"]
    },
    "posesion": {
      "estilo": "circulación corta desde atrás",
      "patrones": ["Salida con centrales", "Pivote como referencia", "Cambios de orientación"]
    }
  },
  "momentosColectivos": [
    {"timestamp": "3:20", "tipo": "positivo", "descripcion": "Jugada combinativa de 8 pases terminando en ocasión de gol"},
    {"timestamp": "5:45", "tipo": "negativo", "descripcion": "Pérdida colectiva de marca en balón parado"}
  ],
  "resumenGeneral": "Equipo con buena circulación de balón y pressing alto organizado. Domina la posesión pero le cuesta generar peligro por el centro. Vulnerable en las transiciones defensivas cuando los laterales suben."
}

REGLAS:
- Incluye TODOS los jugadores visibles del equipo analizado (mínimo 7, idealmente 11)
- Máximo 5 acciones por jugador para mantener el JSON manejable
- eventosContados: cuenta CADA evento observando el video. Si no puedes confirmar, no cuentes. Mejor sub-contar.
- Posesión estimada debe sumar 100%
- Sé honesto y objetivo para el nivel competitivo
- Describe lo que VES, no lo que asumes
- Responde en español
- Solo JSON válido, sin markdown ni backticks`;

    const model = "gemini-2.0-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiBody = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mediaType || "video/mp4",
                data: videoBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 12000,
        responseMimeType: "application/json",
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("[Team Gemini] API error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiRes.status}`, fallback: true }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    let fullText = "";
    if (geminiData.candidates?.[0]?.content?.parts) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.text) fullText += part.text;
      }
    }

    if (!fullText) {
      return new Response(
        JSON.stringify({ error: "Gemini no retornó respuesta", fallback: true }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    let observations: unknown;
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        observations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No se encontró JSON en la respuesta");
      }
    } catch (e) {
      console.error("[Team Gemini] JSON parse error:", e, "Raw:", fullText.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "No se pudo parsear la respuesta de Gemini", fallback: true }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ observations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[Team Gemini] Handler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error interno",
        fallback: true,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
