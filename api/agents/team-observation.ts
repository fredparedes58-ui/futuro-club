/**
 * VITAS - Team Observation Agent (Gemini)
 * POST /api/agents/team-observation
 *
 * Node runtime — video puede ser grande.
 * Envía el video completo a Gemini para observación táctica del equipo.
 * Retorna JSON con formación, posesión, jugadores, fases de juego.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "nodejs", maxDuration: 120 };

export default withHandler(
  { requireAuth: true, rawBody: true },
  async ({ req }) => {
    try {
      const body = await req.json();
      const { videoBase64, mediaType, teamContext } = body;

      if (!videoBase64 || !teamContext) {
        return errorResponse("Faltan datos requeridos (videoBase64, teamContext)", 400);
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return errorResponse("GEMINI_API_KEY no configurada", 503, "GEMINI_NOT_CONFIGURED");
      }

      const ctx = teamContext;

      const levelCalibration = ctx.competitiveLevel === "profesional"
        ? `CALIBRACIÓN (Profesional): Evalúa con exigencia máxima. Se esperan automatismos tácticos consolidados, transiciones rápidas, pressing coordinado, y circulación fluida bajo presión.`
        : ctx.competitiveLevel === "semi-profesional"
        ? `CALIBRACIÓN (Semi-profesional): Evalúa con exigencia alta. Se esperan principios tácticos claros, cierta coordinación colectiva, y ejecución técnica aceptable. Los errores en sincronización son esperables.`
        : `CALIBRACIÓN (Formativo/Cantera): Evalúa en contexto de desarrollo. Lo importante es si se VEN principios tácticos en construcción: ¿el equipo intenta salir jugando? ¿hay estructura de pressing o solo corren? ¿los jugadores entienden dónde posicionarse? Valora la INTENCIÓN táctica aunque la ejecución falle.`;

      const prompt = `Eres un analista táctico de fútbol profesional formado en análisis de rendimiento colectivo. Tienes experiencia en departamentos de análisis de clubes profesionales y academias de élite. Tu especialidad es identificar el MODELO DE JUEGO de un equipo — sus principios, patrones y nivel de organización colectiva.

Analiza al EQUIPO que viste uniforme color ${ctx.teamColor || "?"}.
${ctx.opponentColor ? `El rival viste color ${ctx.opponentColor}.` : ""}

CONTEXTO:
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
- Jugadores esperados: ${ctx.playerCount || "11"}

${levelCalibration}

METODOLOGÍA DE ANÁLISIS TÁCTICO:

1. ESTRUCTURA Y FORMACIÓN:
   - Identifica el sistema base (4-3-3, 4-4-2, 3-5-2, etc.)
   - ¿El sistema cambia entre ataque y defensa? (ej: 4-3-3 en posesión → 4-4-2 en defensa)
   - ¿Es un sistema rígido o fluido? ¿Los jugadores rotan posiciones?
   - Distancia entre líneas: ¿equipo compacto o disperso?

2. FASE DE POSESIÓN (ataque organizado):
   - SALIDA DE BALÓN: ¿Cómo construye desde atrás? ¿El portero participa? ¿Los centrales abren? ¿El pivote baja a recibir?
   - PROGRESIÓN: ¿Avanza por bandas o por el centro? ¿Usa pases cortos o directos? ¿Hay jugadores entre líneas?
   - FINALIZACIÓN: ¿Cómo genera ocasiones? ¿Centros? ¿Combinaciones en corto? ¿Jugadas individuales?
   - AMPLITUD Y PROFUNDIDAD: ¿Los laterales dan amplitud? ¿Los extremos buscan profundidad o se asocian?

3. FASE DE NO POSESIÓN (defensa organizada):
   - PRESSING: ¿Cuándo y dónde presionan? ¿Es pressing alto (en campo rival), medio (en mediocampo), o bajo (atrás)?
   - TRIGGERS DE PRESSING: ¿Qué activa la presión? ¿Un pase atrás del rival? ¿Un toque malo? ¿Presionan siempre o solo en ciertas zonas?
   - BLOQUE DEFENSIVO: ¿Cómo defienden cuando no presionan? ¿Línea de 4 plana? ¿Se repliegan ordenados?
   - BASCULACIÓN: ¿El equipo se mueve junto hacia el lado del balón?

4. TRANSICIONES:
   - TRANSICIÓN OFENSIVA (recuperación → ataque): ¿Ataque rápido/directo o pausa para reorganizar?
   - TRANSICIÓN DEFENSIVA (pérdida → defensa): ¿Gegenpressing (presión inmediata) o repliegue?
   - Velocidad de reacción al cambio de posesión
   - ¿Quién lidera las transiciones? (generalmente mediocampistas)

5. BALÓN PARADO:
   - ¿Cómo defienden corners y faltas? ¿Zonal, al hombre, o mixto?
   - ¿Tienen jugadas ensayadas ofensivas?

6. CALIDAD DE ACCIONES (diferenciar por impacto):
   - Pases progresivos (superan línea de presión) vs pases simples (laterales/atrás)
   - Pressing efectivo (genera recuperación o error) vs pressing inefectivo (solo correr)
   - Regates que generan superioridad vs regates innecesarios
   - Escaneos visuales colectivos: ¿los jugadores miran antes de recibir?

7. VELOCIDAD DE DECISIÓN COLECTIVA:
   - ¿Cuánto tarda el equipo en pasar de fase defensiva a ofensiva tras recuperar?
   - ¿Cuánto tarda en organizar pressing tras perder? (<4s = gegenpressing, >6s = repliegue)
   - ¿Los jugadores deciden rápido con balón o retienen buscando opciones?
   - Velocidad de circulación: ¿1-2 toques o >3 toques por jugador en promedio?

8. CONTEXTO DEL RIVAL:
   - ¿El rival presiona organizadamente o solo corre?
   - ¿El rival tiene nivel similar, superior o inferior?
   - Clasificar: fuerte / medio / débil
   - Si el rival es débil, no sobrevaluar el rendimiento ofensivo del equipo
   - Si el rival es fuerte, valorar más la capacidad de mantener el modelo de juego

9. POR JUGADOR — Registra las acciones más relevantes:
   - Enfócate en acciones que REVELAN la función del jugador en el sistema
   - Un lateral que sube constantemente indica un equipo que busca amplitud
   - Un pivote que recibe entre centrales indica salida de balón trabajada
   - Un extremo que corta hacia adentro indica estructura de juego interior

Genera un análisis con esta estructura JSON exacta (sin markdown, sin backticks):

{
  "formacionDetectada": "4-3-3",
  "posesionEstimada": {"equipo": 55, "rival": 45},
  "jugadoresObservados": [
    {
      "dorsalEstimado": "7",
      "posicionEstimada": "extremo derecho",
      "acciones": [
        {"timestamp": "0:15", "tipo": "accion_con_balon", "descripcion": "Recibe en banda y desborda por fuera al lateral rival con cambio de ritmo"},
        {"timestamp": "1:30", "tipo": "defensiva", "descripcion": "Pressing alto sobre lateral rival cuando recibe de espaldas — genera pérdida"}
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
      "observaciones": ["Los 3 delanteros presionan en bloque coordinado al portero rival", "Activación inmediata (3-4 segundos) tras perder balón — gegenpressing claro"]
    },
    "transicionOfensiva": {
      "velocidad": "rápida",
      "patrones": ["Balón directo a extremos en velocidad tras recuperación", "El pivote distribuye rápido buscando superioridad en banda"]
    },
    "transicionDefensiva": {
      "velocidad": "media",
      "patrones": ["Repliegue posicional ordenado — los mediocampistas retroceden a sus zonas", "Los laterales tardan en replegar cuando están altos — ventana de vulnerabilidad"]
    },
    "posesion": {
      "estilo": "circulación corta desde atrás con salida por centrales",
      "patrones": ["Salida 2+1 con centrales abiertos y pivote entre ellos", "Cambios de orientación buscando lado débil", "El mediapunta baja al half-space para recibir entre líneas"]
    }
  },
  "momentosColectivos": [
    {"timestamp": "3:20", "tipo": "positivo", "descripcion": "Jugada combinativa de 8 pases desde la defensa terminando en ocasión clara — muestra automatismos de posesión"},
    {"timestamp": "5:45", "tipo": "negativo", "descripcion": "Pérdida colectiva de marca en corner — 3 jugadores dejan solo al mismo rival en segunda area"}
  ],
  "resumenGeneral": "Equipo con modelo de juego posicional claro: salida desde atrás con centrales, pivote como referencia, y progresión por bandas. El pressing alto tras pérdida es su mejor arma. Principal debilidad: vulnerabilidad en transiciones defensivas cuando los laterales están altos y el pivote no cubre el espacio. En nivel formativo, muestra principios tácticos bien trabajados por el cuerpo técnico."
}

REGLAS:
- Incluye TODOS los jugadores visibles del equipo analizado (mínimo 7, idealmente 11)
- Máximo 5 acciones por jugador — elige las MÁS REVELADORAS de su función en el sistema
- eventosContados: cuenta CADA evento observando el video. Si no puedes confirmar, no cuentes. Mejor sub-contar
- Posesión estimada debe sumar 100%
- Usa vocabulario táctico preciso: "half-space", "pressing trigger", "línea de presión", "superioridad numérica/posicional", "basculación", "escalonamiento defensivo"
- Sé honesto y objetivo para el nivel competitivo — un equipo formativo no va a tener pressing de Champions League, pero puede tener principios claros
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
          temperature: 0,
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
        return errorResponse(`Gemini API error: ${geminiRes.status}`, 502, "GEMINI_API_ERROR");
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
        return errorResponse("Gemini no retornó respuesta", 502, "GEMINI_EMPTY_RESPONSE");
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
        return errorResponse("No se pudo parsear la respuesta de Gemini", 502, "GEMINI_PARSE_ERROR");
      }

      return successResponse({ observations });
    } catch (error: unknown) {
      console.error("[Team Gemini] Handler error:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Error interno",
        500,
        "INTERNAL_ERROR"
      );
    }
  }
);
