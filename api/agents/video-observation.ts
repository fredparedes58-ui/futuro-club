/**
 * VITAS - Video Observation Agent (Gemini)
 * POST /api/agents/video-observation
 *
 * Node runtime (no Edge) — video puede ser grande.
 * Envía el video completo a Gemini para observación detallada.
 * Retorna JSON con timeline, dimensiones, momentos y patrones.
 */

export const config = { runtime: "nodejs", maxDuration: 120 };

interface GeminiObservation {
  timeline: Array<{
    timestamp: string;
    tipo: string;
    descripcion: string;
  }>;
  dimensiones: Record<string, {
    observaciones: string[];
    score_estimado: number;
  }>;
  momentosDestacados: Array<{
    timestamp: string;
    tipo: "positivo" | "negativo";
    descripcion: string;
  }>;
  patronesJuego: string[];
  resumenGeneral: string;
  eventosContados: {
    pasesCompletados: number;
    pasesFallados: number;
    recuperaciones: number;
    duelosGanados: number;
    duelosPerdidos: number;
    disparosAlArco: number;
    disparosFuera: number;
    centros: number;
    faltas: number;
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { videoBase64, mediaType, playerContext } = body;

    if (!videoBase64 || !playerContext) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos (videoBase64, playerContext)" }),
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

    const ctx = playerContext;
    const prompt = `Eres un scout profesional de fútbol de élite. Observa este video completo con máxima atención.
Busca al jugador con dorsal ${ctx.jerseyNumber || "?"} y uniforme color ${ctx.teamColor || "?"}.

DATOS DEL JUGADOR:
- Nombre: ${ctx.name}
- Edad: ${ctx.age} años
- Posición: ${ctx.position}
- Pie: ${ctx.foot || "no especificado"}
- Estatura: ${ctx.height || "?"} cm | Peso: ${ctx.weight || "?"} kg
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}

INSTRUCCIONES:
1. Observa TODO el video de principio a fin
2. Identifica al jugador objetivo y sigue cada una de sus acciones
3. Anota timestamps precisos de cada acción relevante
4. Evalúa cada dimensión basándote SOLO en lo que observas
5. CUENTA con precisión cada evento del jugador: pases completados/fallados, recuperaciones, duelos, disparos, centros, faltas

Genera un análisis detallado con esta estructura JSON exacta (sin markdown, sin backticks):

{
  "timeline": [
    {"timestamp": "0:15", "tipo": "accion_con_balon", "descripcion": "Recibe de espaldas, gira y filtra pase entre líneas"},
    {"timestamp": "0:32", "tipo": "sin_balon", "descripcion": "Desmarcaje diagonal al espacio"}
  ],
  "dimensiones": {
    "velocidadDecision": {"observaciones": ["Decide rápido en espacios reducidos", "Elige bien cuándo filtrar"], "score_estimado": 7},
    "tecnicaConBalon": {"observaciones": ["Buen primer toque orientado", "Control limpio bajo presión"], "score_estimado": 6},
    "inteligenciaTactica": {"observaciones": ["Se posiciona entre líneas", "Lee bien los espacios"], "score_estimado": 7},
    "capacidadFisica": {"observaciones": ["Buena aceleración en corto", "Aguanta bien los duelos"], "score_estimado": 5},
    "liderazgoPresencia": {"observaciones": ["Pide el balón constantemente", "Comunica con compañeros"], "score_estimado": 6},
    "eficaciaCompetitiva": {"observaciones": ["2 pases clave", "1 disparo al arco"], "score_estimado": 6}
  },
  "momentosDestacados": [
    {"timestamp": "2:30", "tipo": "positivo", "descripcion": "Regate en velocidad superando a 2 rivales"},
    {"timestamp": "5:10", "tipo": "negativo", "descripcion": "Pierde balón por exceso de confianza en zona peligrosa"}
  ],
  "patronesJuego": ["Tiende a asociarse por banda derecha", "Busca el 1v1 en velocidad", "Se ofrece como pivote de descarga"],
  "resumenGeneral": "Jugador con buen pie y visión de juego. Destaca en la toma de decisiones y lectura táctica para su edad. Necesita mejorar intensidad defensiva y presencia física en duelos aéreos.",
  "eventosContados": {
    "pasesCompletados": 12,
    "pasesFallados": 3,
    "recuperaciones": 2,
    "duelosGanados": 3,
    "duelosPerdidos": 1,
    "disparosAlArco": 1,
    "disparosFuera": 0,
    "centros": 2,
    "faltas": 0
  }
}

REGLAS:
- Tipos de timeline: "accion_con_balon", "sin_balon", "defensiva", "tactica", "transicion"
- Tipos de momentos: "positivo" o "negativo"
- Scores: 1-10, sé honesto y objetivo para la edad del jugador
- Mínimo 10 entradas en timeline, 3 momentos destacados
- Describe lo que VES, no lo que asumes
- eventosContados: cuenta CADA evento individualmente mirando el video. Si no puedes confirmar un evento, no lo cuentes. Es mejor sub-contar que inventar.
- Responde en español
- Solo JSON válido, sin markdown ni backticks`;

    // Llamar a Gemini API directamente via REST
    // Usamos gemini-2.0-flash para video (soporta hasta 1h)
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
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
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
      console.error("[Gemini] API error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({
          error: `Gemini API error: ${geminiRes.status}`,
          fallback: true,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    // Extraer texto de la respuesta
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

    // Parsear JSON de la respuesta
    let observations: GeminiObservation;
    try {
      // Gemini con responseMimeType: "application/json" debería retornar JSON limpio
      // pero por seguridad intentamos extraer si viene envuelto
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        observations = JSON.parse(jsonMatch[0]) as GeminiObservation;
      } else {
        throw new Error("No se encontró JSON en la respuesta");
      }
    } catch (e) {
      console.error("[Gemini] JSON parse error:", e, "Raw:", fullText.substring(0, 300));
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
    console.error("[Gemini] Handler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error interno",
        fallback: true,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
