/**
 * VITAS - Video Observation Agent (Gemini)
 * POST /api/agents/video-observation
 *
 * Node runtime (no Edge) — video puede ser grande.
 * Envía el video completo a Gemini para observación detallada.
 * Retorna JSON con timeline, dimensiones, momentos y patrones.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

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
    pasesProgresivos: number;
    regatesConVentaja: number;
    regatesSinVentaja: number;
    pressingEfectivo: number;
    pressingInefectivo: number;
    escaneos: number;
    recuperaciones: number;
    duelosGanados: number;
    duelosPerdidos: number;
    disparosAlArco: number;
    disparosFuera: number;
    centros: number;
    faltas: number;
  };
}

export default withHandler(
  { requireAuth: true, rawBody: true },
  async ({ req }) => {
    try {
      let body: Record<string, unknown>;
      try {
        body = await req.json() as Record<string, unknown>;
      } catch (parseErr) {
        console.error("[Gemini] Body parse error (possibly too large):", parseErr);
        return errorResponse("No se pudo leer el body — el video puede ser demasiado grande para Vercel (máx ~4MB)", 413, "BODY_TOO_LARGE");
      }
      const { videoUrl, videoBase64: videoBase64FromBody, mediaType: mediaTypeFromBody, playerContext } = body;

      if (!playerContext) {
        return errorResponse("Faltan datos requeridos (playerContext)", 400);
      }
      if (!videoUrl && !videoBase64FromBody) {
        return errorResponse("Faltan datos requeridos (videoUrl o videoBase64)", 400);
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return errorResponse("GEMINI_API_KEY no configurada", 503, "GEMINI_NOT_CONFIGURED");
      }

      // Obtener video como base64 — desde URL (descarga server-side) o directo
      let videoBase64: string;
      let mediaType: string;

      if (videoUrl && typeof videoUrl === "string") {
        // Descargar video desde Bunny CDN (sin límite de tamaño en server-side fetch)
        console.log(`[Gemini] Descargando video desde: ${videoUrl}`);
        try {
          const videoRes = await fetch(videoUrl as string);
          if (!videoRes.ok) {
            return errorResponse(`No se pudo descargar el video desde CDN: HTTP ${videoRes.status}`, 502, "VIDEO_DOWNLOAD_FAILED");
          }
          const videoBuffer = await videoRes.arrayBuffer();
          // Node.js Buffer para base64 (btoa no existe en Node)
          videoBase64 = Buffer.from(videoBuffer).toString("base64");
          mediaType = videoRes.headers.get("content-type") || "video/mp4";
          const sizeMB = (videoBuffer.byteLength / 1024 / 1024).toFixed(1);
          console.log(`[Gemini] Video descargado: ${sizeMB}MB, tipo: ${mediaType}`);
        } catch (dlErr) {
          console.error("[Gemini] Error descargando video:", dlErr);
          return errorResponse(`Error descargando video: ${dlErr instanceof Error ? dlErr.message : "unknown"}`, 502, "VIDEO_DOWNLOAD_ERROR");
        }
      } else {
        videoBase64 = videoBase64FromBody as string;
        mediaType = (mediaTypeFromBody as string) || "video/mp4";
      }

      const ctx = playerContext;

      // Calibración de exigencia por edad y nivel competitivo
      const ageCalibration = ctx.age <= 12
        ? `CALIBRACIÓN POR EDAD (sub-12): A esta edad prioriza la relación con el balón, la capacidad de tomar decisiones simples y la disposición a participar. NO penalices errores técnicos bajo presión — es normal. Valora especialmente: primer toque, orientación corporal al recibir, disposición a pedir el balón, alegría y desparpajo con balón. La capacidad física es IRRELEVANTE a esta edad para predecir talento.`
        : ctx.age <= 15
        ? `CALIBRACIÓN POR EDAD (sub-15): Etapa de formación técnico-táctica. Valora: capacidad de ejecutar bajo presión, lectura de espacios, timing de pase, desmarques inteligentes, y primeros signos de toma de decisiones en velocidad. La diferencia física entre "early" y "late maturers" puede ser enorme — un jugador más pequeño que lee bien el juego puede tener más potencial que uno grande y rápido que solo usa el físico.`
        : ctx.age <= 18
        ? `CALIBRACIÓN POR EDAD (sub-18): Etapa de especialización. Aquí ya se puede evaluar rendimiento competitivo real. Valora: consistencia, capacidad de rendir bajo presión, contribución táctica al equipo, eficacia en acciones decisivas, y madurez competitiva. Los jugadores deben demostrar que pueden combinar técnica + inteligencia + físico.`
        : `CALIBRACIÓN POR EDAD (adulto/profesional): Evaluación de rendimiento completo. Se espera dominio técnico, inteligencia táctica avanzada, consistencia física, y capacidad de impactar partidos en momentos clave.`;

      const positionFocus = {
        GK: "FOCO POSICIONAL (Portero): Observa posicionamiento en el arco, decisión de salir o quedarse, juego con los pies, distribución, comunicación con la defensa, valentía en 1v1, reflejos.",
        RB: "FOCO POSICIONAL (Lateral derecho): Observa incorporaciones al ataque, centros, 1v1 defensivo, posicionamiento en repliegue, amplitud que da al equipo, timing de subida.",
        LB: "FOCO POSICIONAL (Lateral izquierdo): Observa incorporaciones al ataque, centros, 1v1 defensivo, posicionamiento en repliegue, amplitud que da al equipo, timing de subida.",
        RCB: "FOCO POSICIONAL (Central derecho): Observa anticipación, lectura de línea de pase, juego aéreo, salida con balón, coberturas, duelos 1v1, comunicación con la línea defensiva.",
        LCB: "FOCO POSICIONAL (Central izquierdo): Observa anticipación, lectura de línea de pase, juego aéreo, salida con balón, coberturas, duelos 1v1, comunicación con la línea defensiva.",
        DM: "FOCO POSICIONAL (Pivote/Mediocentro defensivo): Observa posicionamiento entre líneas, interceptaciones, distribución de juego, orientación corporal al recibir, capacidad de filtrar pases verticales, cobertura de espacios, pressing.",
        RCM: "FOCO POSICIONAL (Interior derecho): Observa llegada al área, asociaciones en corto, cambios de ritmo, pases entre líneas, equilibrio ataque-defensa, transiciones.",
        LCM: "FOCO POSICIONAL (Interior izquierdo): Observa llegada al área, asociaciones en corto, cambios de ritmo, pases entre líneas, equilibrio ataque-defensa, transiciones.",
        RW: "FOCO POSICIONAL (Extremo derecho): Observa 1v1, desborde, centros, regates, movimiento sin balón al espacio, repliegue defensivo, combinaciones con lateral.",
        LW: "FOCO POSICIONAL (Extremo izquierdo): Observa 1v1, desborde, centros, regates, movimiento sin balón al espacio, repliegue defensivo, combinaciones con lateral.",
        ST: "FOCO POSICIONAL (Delantero centro): Observa movimientos de desmarque, disparo, juego de espaldas, pressing al rival, inteligencia en el área, timing de carrera.",
      } as Record<string, string>)[ctx.position] || "Observa todas las acciones del jugador con atención al contexto táctico.";

      const prompt = `Eres un scout profesional de fútbol formado en metodologías de scouting europeas (La Masia, Ajax Academy, Clairefontaine). Tienes experiencia evaluando jugadores desde categorías sub-10 hasta profesional. Observa este video completo con la mentalidad de un ojeador que debe decidir si este jugador merece seguimiento.

Busca al jugador con dorsal ${ctx.jerseyNumber || "?"} y uniforme color ${ctx.teamColor || "?"}.

DATOS DEL JUGADOR:
- Nombre: ${ctx.name}
- Edad: ${ctx.age} años
- Posición: ${ctx.position}
- Pie: ${ctx.foot || "no especificado"}
- Estatura: ${ctx.height || "?"} cm | Peso: ${ctx.weight || "?"} kg
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}

${ageCalibration}

${positionFocus}

METODOLOGÍA DE OBSERVACIÓN (sigue este orden):

1. PRIMERA PASADA — Contexto general:
   - ¿Qué tipo de partido es? (intensidad, nivel de los equipos, espacio disponible)
   - ¿Dónde se posiciona el jugador cuando su equipo tiene/no tiene el balón?
   - ¿Cuánto participa? (¿pide el balón? ¿se esconde? ¿busca el juego?)

2. SEGUNDA PASADA — Acciones con balón:
   - Primer toque: ¿orienta el control hacia donde quiere jugar o para y piensa?
   - Pases: ¿son seguros/cortos o arriesga con pases verticales/entre líneas?
   - Conducción: ¿usa el regate como recurso táctico o por inercia?
   - Disparo: ¿busca gol cuando tiene oportunidad o evita la responsabilidad?
   - Centros/asistencias: ¿tiene capacidad de generar peligro para los compañeros?

3. TERCERA PASADA — Acciones sin balón (CLAVE para detectar talento):
   - Escaneo visual: ¿gira la cabeza antes de recibir? (el mejor indicador de inteligencia)
   - Desmarques: ¿se mueve al espacio o se queda estático esperando?
   - Pressing: ¿presiona con intención de recuperar o solo "corre hacia"?
   - Posicionamiento defensivo: ¿ajusta su posición según el balón?
   - Transiciones: ¿reacciona rápido al cambio de posesión?

4. CUARTA PASADA — Indicadores de mentalidad y psicología:
   - RESILIENCIA: ¿Cómo reacciona después de un error? ¿Pide el balón o se esconde?
   - COMUNICACIÓN: ¿Señala? ¿Organiza? ¿Grita instrucciones a compañeros?
   - TOLERANCIA AL RIESGO: ¿Intenta pases difíciles o siempre elige lo seguro?
   - HAMBRE COMPETITIVA: ¿Presiona cada balón? ¿Se frustra con errores propios? ¿Quiere ganar cada duelo?
   - LENGUAJE CORPORAL: Postura erguida vs hombros caídos, cabeza arriba vs baja
   Clasifica cada indicador como: alto, medio, bajo — con evidencia del video

5. QUINTA PASADA — Contexto del rival:
   - ¿El rival presiona organizadamente o solo corre?
   - ¿Los defensas rivales anticipan o solo reaccionan?
   - ¿El nivel técnico del rival es comparable, superior o inferior?
   - Categoría: fuerte (peso ×1.15), medio (×1.0), débil (×0.85)
   - Las acciones contra rival fuerte valen más. Un regate 1v1 contra defensor que anticipa vale más que contra uno que solo corre

6. CONTEO DE EVENTOS — Cuenta cada acción individualmente:
   - Pases completados y fallados
   - Pases PROGRESIVOS (superan línea de presión) vs simples (laterales/atrás)
   - Regates CON VENTAJA (generan superioridad) vs sin ventaja
   - Pressing EFECTIVO (genera recuperación o error) vs inefectivo
   - Escaneos visuales (giros de cabeza antes de recibir)
   - Recuperaciones (robo activo vs interceptación posicional)
   - Duelos ganados y perdidos (1v1 ofensivo y defensivo)
   - Disparos al arco y fuera
   - Centros intentados
   - Faltas cometidas y recibidas

Genera un análisis detallado con esta estructura JSON exacta (sin markdown, sin backticks):

{
  "timeline": [
    {"timestamp": "0:15", "tipo": "accion_con_balon", "descripcion": "Recibe de espaldas al juego, gira sobre pie derecho y filtra pase entre líneas al mediapunta — buen escaneo previo"},
    {"timestamp": "0:32", "tipo": "sin_balon", "descripcion": "Desmarcaje diagonal al half-space derecho creando línea de pase progresiva"}
  ],
  "dimensiones": {
    "velocidadDecision": {"observaciones": ["Decide rápido en espacios reducidos, elige pase vertical sobre opción segura", "Tiempo de decisión corto tras control orientado"], "score_estimado": 7},
    "tecnicaConBalon": {"observaciones": ["Primer toque orientado limpio bajo presión de 2 rivales", "Conducción con cambio de ritmo en zona 14"], "score_estimado": 6},
    "inteligenciaTactica": {"observaciones": ["Se posiciona en el half-space entre líneas de presión rival", "Escanea 2 veces antes de recibir — lee el juego"], "score_estimado": 7},
    "capacidadFisica": {"observaciones": ["Buena aceleración en los primeros 5 metros", "Aguanta contacto físico en duelo pero pierde en duelo aéreo"], "score_estimado": 5},
    "liderazgoPresencia": {"observaciones": ["Pide el balón en situaciones de presión — no se esconde", "Comunica con central para solicitar pase en profundidad"], "score_estimado": 6},
    "eficaciaCompetitiva": {"observaciones": ["2 de 3 pases progresivos completados — buena ratio", "1 disparo al arco desde fuera del área, colocado"], "score_estimado": 6}
  },
  "momentosDestacados": [
    {"timestamp": "2:30", "tipo": "positivo", "descripcion": "Regate en velocidad superando a 2 rivales con cambio de dirección al half-space — muestra capacidad de desequilibrio individual"},
    {"timestamp": "5:10", "tipo": "negativo", "descripcion": "Pierde balón por exceso de confianza en zona de construcción propia — error de decisión, no técnico"}
  ],
  "patronesJuego": ["Tiende a asociarse por banda derecha buscando combinaciones con el lateral", "Busca el 1v1 en velocidad cuando recibe de cara — prefiere atacar espacio a jugar de espaldas", "Se ofrece como pivote de descarga para la salida de balón"],
  "resumenGeneral": "Jugador con buen pie y visión de juego para su edad. Destaca en la toma de decisiones bajo presión y en la lectura de espacios entre líneas. Su escaneo visual antes de recibir indica madurez táctica superior a la media. Necesita mejorar la intensidad defensiva en las transiciones y la presencia física en duelos aéreos — esto último puede ser cuestión de maduración biológica.",
  "eventosContados": {
    "pasesCompletados": 12,
    "pasesFallados": 3,
    "pasesProgresivos": 5,
    "regatesConVentaja": 2,
    "regatesSinVentaja": 1,
    "pressingEfectivo": 3,
    "pressingInefectivo": 2,
    "escaneos": 8,
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
- Scores: 1-10, calibrados para la edad y nivel competitivo del jugador. Un 7 en un sub-12 formativo NO es lo mismo que un 7 en un sub-18 de liga nacional
- Mínimo 10 entradas en timeline, 3 momentos destacados
- Describe lo que VES con vocabulario táctico preciso: usa términos como "half-space", "entre líneas", "pase progresivo", "control orientado", "pressing tras pérdida", "transición defensiva", "línea de pase", "desmarque de ruptura"
- Las observaciones por dimensión deben ser ESPECÍFICAS del video, no genéricas. Mal: "Buena técnica". Bien: "Control con exterior del pie derecho bajo presión del central, girando hacia el espacio libre"
- eventosContados: cuenta CADA evento individualmente mirando el video. Si no puedes confirmar un evento, no lo cuentes. Es mejor sub-contar que inventar
- pasesProgresivos: pases que superan al menos una línea de presión rival (vertical u oblicuo hacia adelante, NO lateral ni atrás)
- regatesConVentaja: regates exitosos que generaron espacio, superioridad o oportunidad real (no solo "pasó al rival y perdió luego")
- pressingEfectivo: presión que resultó en recuperación directa o error forzado del rival
- escaneos: giros de cabeza observables ANTES de recibir el balón. Es la métrica más predictiva de inteligencia de juego
- Responde en español
- Solo JSON válido, sin markdown ni backticks`;

      // Llamar a Gemini API directamente via REST
      // Usamos gemini-2.0-flash para video (soporta hasta 1h)
      const model = "gemini-2.0-flash";

      // Determinar si usamos File API (>15MB) o inlineData (<15MB)
      const videoSizeBytes = Buffer.from(videoBase64, "base64").length;
      const videoSizeMB = videoSizeBytes / (1024 * 1024);
      const useFileApi = videoSizeMB > 15;

      let videoPart: Record<string, unknown>;

      if (useFileApi) {
        // Gemini File API para videos grandes (hasta 2GB)
        console.log(`[Gemini] Video grande (${videoSizeMB.toFixed(1)}MB) — usando File API`);
        const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
        const videoBuffer = Buffer.from(videoBase64, "base64");

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": mediaType || "video/mp4",
            "X-Goog-Upload-Protocol": "raw",
            "X-Goog-Upload-Command": "upload, finalize",
          },
          body: videoBuffer,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => "");
          console.error("[Gemini] File upload error:", uploadRes.status, errText);
          return errorResponse(`Gemini File API upload error: ${uploadRes.status}`, 502, "GEMINI_UPLOAD_ERROR");
        }

        const uploadData = await uploadRes.json() as { file?: { uri?: string; name?: string; state?: string } };
        const fileUri = uploadData.file?.uri;
        const fileName = uploadData.file?.name;

        if (!fileUri) {
          return errorResponse("Gemini File API no retornó URI", 502, "GEMINI_UPLOAD_NO_URI");
        }

        // Esperar a que el archivo esté procesado (ACTIVE)
        let fileState = uploadData.file?.state || "PROCESSING";
        let attempts = 0;
        while (fileState === "PROCESSING" && attempts < 30) {
          await new Promise(r => setTimeout(r, 2000));
          const statusRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json() as { state?: string };
            fileState = statusData.state || "PROCESSING";
          }
          attempts++;
        }

        if (fileState !== "ACTIVE") {
          return errorResponse(`Video no procesado por Gemini (state: ${fileState})`, 502, "GEMINI_FILE_NOT_READY");
        }

        console.log(`[Gemini] Archivo listo: ${fileUri}`);
        videoPart = { fileData: { mimeType: mediaType || "video/mp4", fileUri } };
      } else {
        // InlineData para videos pequeños (<15MB)
        console.log(`[Gemini] Video pequeño (${videoSizeMB.toFixed(1)}MB) — usando inlineData`);
        videoPart = { inlineData: { mimeType: mediaType || "video/mp4", data: videoBase64 } };
      }

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const geminiBody = {
        contents: [
          {
            parts: [
              videoPart,
              { text: prompt },
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
        return errorResponse(`Gemini API error: ${geminiRes.status}`, 502, "GEMINI_API_ERROR");
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
        return errorResponse("Gemini no retornó respuesta", 502, "GEMINI_EMPTY_RESPONSE");
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
        return errorResponse("No se pudo parsear la respuesta de Gemini", 502, "GEMINI_PARSE_ERROR");
      }

      return successResponse({ observations });
    } catch (error: unknown) {
      console.error("[Gemini] Handler error:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Error interno",
        500,
        "INTERNAL_ERROR"
      );
    }
  }
);
