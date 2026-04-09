/**
 * VITAS - Team Intelligence Agent v1
 * POST /api/agents/team-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Recibe observaciones de Gemini sobre el equipo + YOLO opcional.
 * Retorna SSE → TeamIntelligenceOutput completo.
 */

import { withHandler } from "../_lib/withHandler";
import { checkTeamReportQuality } from "../_lib/reportQualityCheck";

export const config = { runtime: "edge" };

export default withHandler(
  { requireAuth: true, rawBody: true },
  async ({ req }) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send("progress", { step: "Iniciando análisis de equipo...", percent: 5 });
          const body = await req.json();
          const { teamContext, geminiObservations, keyframes, videoId, yoloTrackData, analysisFocus } = body;

          if (!teamContext) {
            send("error", { message: "Faltan datos requeridos (teamContext)" });
            controller.close();
            return;
          }

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            send("error", { message: "ANTHROPIC_API_KEY no configurada en el servidor" });
            controller.close();
            return;
          }

          send("progress", { step: "Preparando análisis táctico...", percent: 15 });

          const ctx = teamContext;
          const hasGemini = !!geminiObservations;
          const hasYolo = Array.isArray(yoloTrackData) && yoloTrackData.length > 0;

          // Build image content blocks from keyframes (fallback mode)
          const imageBlocks: unknown[] = [];
          if (!hasGemini && Array.isArray(keyframes)) {
            for (const kf of keyframes.slice(0, 12)) {
              const url: string = typeof kf === "string" ? kf : kf?.url ?? "";
              if (url.startsWith("data:image/")) {
                const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) {
                  imageBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: match[1], data: match[2] },
                  });
                }
              } else if (url.startsWith("http")) {
                imageBlocks.push({
                  type: "image",
                  source: { type: "url", url },
                });
              }
            }
          }

          send("progress", { step: hasGemini ? "Generando informe táctico..." : `Analizando ${imageBlocks.length} fotogramas...`, percent: 30 });

          // Gemini observations block
          const geminiBlock = hasGemini ? `
OBSERVACIONES TÁCTICAS DEL EQUIPO (generadas por IA que analizó el video completo):

FORMACIÓN DETECTADA: ${geminiObservations.formacionDetectada || "No identificada"}
POSESIÓN ESTIMADA: Equipo ${geminiObservations.posesionEstimada?.equipo ?? "?"}% — Rival ${geminiObservations.posesionEstimada?.rival ?? "?"}%

JUGADORES OBSERVADOS (${geminiObservations.jugadoresObservados?.length ?? 0}):
${(geminiObservations.jugadoresObservados ?? []).map((j: {
  dorsalEstimado: string | null; posicionEstimada: string;
  acciones: Array<{ timestamp: string; tipo: string; descripcion: string }>;
  eventosContados: Record<string, number>;
}, i: number) => {
  const ev = j.eventosContados ?? {};
  return `  ${i + 1}. #${j.dorsalEstimado ?? "?"} — ${j.posicionEstimada}
     Pases: ${ev.pasesCompletados ?? 0}✓/${ev.pasesFallados ?? 0}✗ | Recup: ${ev.recuperaciones ?? 0} | Duelos: ${ev.duelosGanados ?? 0}G/${ev.duelosPerdidos ?? 0}P | Disparos: ${ev.disparosAlArco ?? 0} | Centros: ${ev.centros ?? 0}
     Acciones: ${(j.acciones ?? []).map((a: { timestamp: string; descripcion: string }) => `[${a.timestamp}] ${a.descripcion}`).join(" | ")}`;
}).join("\n")}

FASES DE JUEGO:
- Pressing: ${geminiObservations.fasesJuego?.pressing?.tipo ?? "?"} (intensidad: ${geminiObservations.fasesJuego?.pressing?.intensidad ?? "?"}/10, línea: ${geminiObservations.fasesJuego?.pressing?.alturaLinea ?? "?"})
  ${(geminiObservations.fasesJuego?.pressing?.observaciones ?? []).join("; ")}
- Trans. ofensiva: ${geminiObservations.fasesJuego?.transicionOfensiva?.velocidad ?? "?"} — ${(geminiObservations.fasesJuego?.transicionOfensiva?.patrones ?? []).join(", ")}
- Trans. defensiva: ${geminiObservations.fasesJuego?.transicionDefensiva?.velocidad ?? "?"} — ${(geminiObservations.fasesJuego?.transicionDefensiva?.patrones ?? []).join(", ")}
- Posesión: ${geminiObservations.fasesJuego?.posesion?.estilo ?? "?"} — ${(geminiObservations.fasesJuego?.posesion?.patrones ?? []).join(", ")}

MOMENTOS COLECTIVOS:
${(geminiObservations.momentosColectivos ?? []).map((m: { timestamp: string; tipo: string; descripcion: string }) => `- [${m.timestamp}] (${m.tipo}) ${m.descripcion}`).join("\n")}

RESUMEN: ${geminiObservations.resumenGeneral ?? ""}

Estas observaciones provienen del análisis del VIDEO COMPLETO. Úsalas como base principal.` : "";

          // YOLO tracking data block
          const yoloBlock = hasYolo ? `
MÉTRICAS FÍSICAS POR JUGADOR (tracking por computadora, datos objetivos):
${yoloTrackData.map((t: {
  trackId: number; maxSpeedMs: number; avgSpeedMs: number;
  distanceM: number; sprintCount: number; duelsWon: number; duelsLost: number;
}) => `  Track #${t.trackId}: vel.máx ${(t.maxSpeedMs * 3.6).toFixed(1)} km/h | prom ${(t.avgSpeedMs * 3.6).toFixed(1)} km/h | dist ${t.distanceM.toFixed(0)}m | sprints ${t.sprintCount} | duelos ${t.duelsWon}G/${t.duelsLost}P`
).join("\n")}

Intenta asociar cada Track con un jugador observado por posición en el campo. Si no puedes asociar con certeza, usa null para velocidad/distancia.` : "";

          const introBlock = hasGemini
            ? `Eres VITAS, un sistema de análisis táctico de fútbol de nivel profesional. Combinas la visión de un analista de rendimiento de primer equipo con el conocimiento metodológico de un director de formación de cantera.

TU PERFIL COMO ANALISTA TÁCTICO:
- Formado en análisis de rendimiento con experiencia en departamentos técnicos de clubes profesionales
- Especialista en identificación de modelos de juego, principios tácticos y patrones colectivos
- Conocimiento profundo de sistemas de juego modernos: juego posicional (Guardiola), gegenpressing (Klopp), defensa zonal (Sacchi), juego directo estructurado (Ancelotti)
- Capacidad de adaptar la evaluación al nivel competitivo — lo que se exige a un equipo profesional es diferente a lo que se espera en categorías formativas

PRINCIPIOS DE TU ANÁLISIS:
1. MODELO DE JUEGO: Todo equipo (consciente o inconscientemente) tiene un modelo. Tu trabajo es identificar los PRINCIPIOS que guían su juego en cada fase
2. COHERENCIA SISTÉMICA: ¿Las decisiones individuales de los jugadores están alineadas con un plan colectivo? ¿O cada uno juega por su cuenta?
3. VULNERABILIDADES EXPLOTABLES: Identifica los momentos y zonas donde el equipo es vulnerable — esto es lo que más valora un entrenador rival
4. CONTEXTO FORMATIVO: En equipos juveniles, valora si se VEN principios en construcción. Un equipo de sub-14 que intenta salir jugando y pierde balones es MÁS prometedor que uno que solo despeja
5. RECOMENDACIONES ACCIONABLES: Cada recomendación debe ser algo que el entrenador pueda trabajar en el próximo entrenamiento

VOCABULARIO TÁCTICO (usa con precisión):
- Superioridad numérica: más jugadores en una zona que el rival
- Superioridad posicional: mejor posicionamiento que genera ventaja sin necesitar más jugadores
- Superioridad cualitativa: ventaja por calidad individual (ej: extremo rápido vs lateral lento)
- Pressing triggers: señales que activan la presión colectiva (pase atrás, mal control, pase lateral)
- Rest defense: jugadores que se quedan atrás durante el ataque para prevenir contraataques
- Tercer hombre: jugador que recibe el pase después de una combinación de 2, superando una línea
- Half-space: canales intermedios entre banda y centro — zonas de máxima creación en fútbol moderno
- Basculación: movimiento lateral colectivo de la defensa hacia el lado del balón
- Escalonamiento: organización vertical de la defensa con distancia entre líneas

ANCLAS DE SCORING COLECTIVO (escala 1-10):
- 9-10: Automatismos de equipo profesional. Principios claros en cada fase. Sincronización excepcional
- 7-8: Modelo de juego definido con buenos automatismos. Errores puntuales de ejecución pero principios claros
- 5-6: Principios básicos visibles pero ejecución inconsistente. Se ven intenciones pero falta trabajo
- 3-4: Desorganización frecuente. Acciones individuales predominan sobre el colectivo
- 1-2: Sin modelo de juego identificable. Cada jugador actúa por su cuenta

VELOCIDAD DE DECISIÓN COLECTIVA:
- Transición ofensiva: <4s de recuperación a primer pase progresivo = rápida. 4-7s = media. >7s = lenta
- Gegenpressing: <3s de pérdida a primera presión = alto. 3-5s = medio. >5s = bajo/repliegue
- Circulación en posesión: 1-2 toques promedio = rápida. 3+ toques = lenta (puede ser intencional en equipos posicionales)

CONTEXTO DEL RIVAL (obligatorio):
- Evalúa el nivel del rival: ¿presiona? ¿defiende con anticipación? ¿tiene talento individual?
- Rival fuerte (×1.15): El rendimiento del equipo gana más peso
- Rival medio (×1.0): Evaluación estándar
- Rival débil (×0.85): No sobrevaluar rendimiento ofensivo contra equipo pasivo
- SIEMPRE menciona la calidad estimada del rival en el resumenEjecutivo

CALIDAD DE ACCIONES COLECTIVAS:
- Circulación con cambio de orientación: alto valor táctico — indica equipo que busca desequilibrio posicional
- Pressing coordinado (3+ jugadores cerrando espacio simultáneamente): indica trabajo táctico del cuerpo técnico
- Salida de balón limpia desde atrás bajo presión: indica valentía y trabajo de posesión
- Contraataque con 3+ jugadores involucrados: indica transiciones trabajadas

PERSONALIDAD COLECTIVA (evaluar):
- ¿Cómo reacciona el equipo cuando va perdiendo? ¿Sube intensidad o se desmorona?
- ¿Mantienen el modelo de juego bajo presión o recurren a pelotazos?
- ¿Los jugadores se ayudan mutuamente tras errores o se culpan?
- ¿El equipo tiene una identidad clara (presión, posesión, directo) o juega sin personalidad?

Un sistema de observación ha analizado el video completo del equipo y te proporciona sus observaciones detalladas. Tu trabajo es interpretar estas observaciones con criterio de analista experto y generar el informe táctico estructurado.`
            : `Eres VITAS, un sistema de análisis táctico de fútbol de nivel profesional con experiencia en departamentos técnicos de clubes y academias. Analiza estos ${imageBlocks.length} fotogramas de un partido de fútbol:`;

          const frameInstructionBlock = !hasGemini
            ? `\nObserva cuidadosamente cada fotograma. Identifica al equipo con uniforme ${ctx.teamColor || "?"}.`
            : "";

          const prompt = `${introBlock}

DATOS DEL EQUIPO:
- Color uniforme: ${ctx.teamColor || "?"}
- Color rival: ${ctx.opponentColor || "no especificado"}
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
${geminiBlock}${frameInstructionBlock}${yoloBlock}
${analysisFocus ? `
ENFOQUE DEL ANÁLISIS: Concentra especialmente el análisis en: ${Array.isArray(analysisFocus) ? analysisFocus.join(", ") : analysisFocus}.
Dedica más detalle a estas acciones en el resumen ejecutivo, fases de juego, métricas colectivas y per-jugador. Si el enfoque es defensivo, profundiza en pressing, línea defensiva, recuperaciones. Si es ofensivo, profundiza en circulación, transiciones ofensivas, centros, disparos.` : ""}

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "videoId": "${videoId || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "equipoAnalizado": {
    "colorUniforme": "${ctx.teamColor || "?"}",
    "jugadoresDetectados": number
  },
  "resumenEjecutivo": "string max 500 chars — evaluación global del equipo",
  "formacion": {
    "sistema": "4-3-3",
    "variantes": ["En ataque pasa a 3-4-3 con laterales altos"],
    "rigidez": 1-10
  },
  "posesion": {
    "porcentaje": 55,
    "estiloCirculacion": "string max 200",
    "zonasDominadas": ["banda derecha", "mediocampo"]
  },
  "fasesJuego": {
    "pressing": {
      "tipo": "pressing alto tras pérdida",
      "alturaLinea": "alta|media|baja",
      "intensidad": 1-10,
      "descripcion": "string max 200"
    },
    "transiciones": {
      "ofensiva": {"velocidad":"rápida|media|lenta","patron":"string","descripcion":"string max 200"},
      "defensiva": {"velocidad":"rápida|media|lenta","patron":"string","descripcion":"string max 200"}
    }
  },
  "metricasColectivas": {
    "compacidad": 1-10,
    "alturaLineaDefensiva": "alta|media|baja",
    "amplitud": 1-10,
    "sincronizacion": 1-10,
    "descripcion": "string max 300"
  },
  "jugadores": [
    {
      "dorsalEstimado": "7" o null,
      "posicion": "extremo derecho",
      "rol": "desborde y profundidad por banda",
      "rendimiento": "destacado|bueno|regular|bajo",
      "velocidadMaxKmh": number o null,
      "distanciaM": number o null,
      "pases": {"completados": 8, "fallados": 2},
      "duelos": {"ganados": 2, "perdidos": 1},
      "recuperaciones": 1,
      "resumen": "string max 150"
    }
  ],
  "evaluacionGeneral": {
    "fortalezasEquipo": ["max 4 strings"],
    "areasTrabajar": ["max 3 strings"],
    "recomendaciones": ["max 3 strings — acciones concretas para el entrenador"]
  },
  "confianza": 0-1
}

REGLAS CRÍTICAS:
- Incluye TODOS los jugadores observados en el array "jugadores"
- velocidadMaxKmh y distanciaM: usa datos YOLO si están disponibles, sino null

EVALUACIÓN DE MÉTRICAS COLECTIVAS:
- compacidad (1-10): ¿Qué tan juntas están las líneas del equipo? Un equipo compacto tiene máximo 35m entre la última línea defensiva y la primera ofensiva. 8+ = bloque compacto que se mueve junto. 4- = equipo disperso con huecos entre líneas
- alturaLineaDefensiva: "alta" si la línea defensiva está en el centro del campo o más arriba, "media" si entre el centro y el borde del área, "baja" si cerca del área propia
- amplitud (1-10): ¿El equipo usa todo el ancho del campo? 8+ = laterales/extremos tocan la línea de banda, cambios de orientación frecuentes. 4- = juego concentrado solo por un lado o por el centro
- sincronizacion (1-10): ¿Los jugadores se mueven como unidad o hay desconexiones? En pressing: ¿presionan todos juntos? En ataque: ¿los movimientos son coordinados? 8+ = automatismos claros. 4- = cada jugador actúa por su cuenta

RENDIMIENTO POR JUGADOR:
- "destacado": jugador que impactó el partido con acciones decisivas, lideró su zona, mostró rendimiento superior a la media del equipo
- "bueno": jugador que cumplió su función táctica correctamente, sin errores graves, contribuyó al colectivo
- "regular": jugador con participación intermitente, algunos aciertos y algunos errores, no impactó significativamente
- "bajo": jugador que cometió errores frecuentes, estuvo desconectado del juego, o fue superado por su par directo

RECOMENDACIONES PARA EL ENTRENADOR:
- Deben ser ESPECÍFICAS y ACCIONABLES — no "mejorar las transiciones" sino "trabajar pressing inmediato tras pérdida con ejercicio de 6v6+2 en espacio reducido"
- Conecta cada recomendación con algo OBSERVADO en el video: "El espacio entre centrales y mediocampistas cuando el rival supera el pressing sugiere trabajar distancias entre líneas en ejercicios de 11v11 posicional"
- Máximo 3 recomendaciones — priorizadas por impacto
- En equipos formativos: incluye al menos una recomendación POSITIVA (qué reforzar/mantener) además de lo que mejorar
- Sé honesto y específico para el nivel competitivo
- Responde en español`;

          const content: unknown[] = hasGemini
            ? [{ type: "text", text: prompt }]
            : [...imageBlocks, { type: "text", text: prompt }];

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
                model:      "claude-sonnet-4-20250514",
                max_tokens: 8000,
                temperature: 0,
                messages:   [{ role: "user", content }],
              }),
            });

            if (!claudeRes.ok) {
              const errBody = await claudeRes.text().catch(() => "");
              console.error("Claude API error:", claudeRes.status, errBody);
              send("error", { message: `Error de Claude API: ${claudeRes.status}` });
              controller.close();
              return;
            }

            const data = await claudeRes.json() as {
              content: Array<{ type: string; text?: string }>;
            };
            for (const block of data.content) {
              if (block.type === "text" && block.text) fullText += block.text;
            }
          } catch (e: unknown) {
            console.error("Claude fetch error:", e instanceof Error ? e.message : e);
            send("error", { message: "Error conectando con Claude API" });
            controller.close();
            return;
          }

          send("progress", { step: "Procesando respuesta...", percent: 85 });

          let report = null;
          if (fullText) {
            try {
              const m = fullText.match(/\{[\s\S]*\}/);
              if (m) report = JSON.parse(m[0]);
            } catch (e) {
              console.error("JSON parse error:", e, "Raw text:", fullText.substring(0, 200));
            }
          }

          if (!report) {
            send("error", { message: "No se pudo parsear la respuesta de Claude" });
            controller.close();
            return;
          }

          // ── Semantic validation + retry (max 1) ──────────────────────────
          const quality = checkTeamReportQuality(report);
          if (!quality.valid && quality.qualityScore < 60 && quality.feedbackForAgent) {
            send("progress", { step: "Validando calidad... reintentando", percent: 88 });
            try {
              const retryPrompt = `${prompt}\n\n--- CORRECCIÓN REQUERIDA ---\n${quality.feedbackForAgent}\n\nEl JSON previo tenía estos problemas. Regenera el JSON completo corregido:`;
              const retryContent = hasGemini
                ? [{ type: "text", text: retryPrompt }]
                : [...imageBlocks, { type: "text", text: retryPrompt }];

              const retryRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                  model: "claude-sonnet-4-20250514",
                  max_tokens: 8000,
                  temperature: 0,
                  messages: [{ role: "user", content: retryContent }],
                }),
              });

              if (retryRes.ok) {
                const retryData = await retryRes.json() as { content: Array<{ type: string; text?: string }> };
                let retryText = "";
                for (const block of retryData.content) {
                  if (block.type === "text" && block.text) retryText += block.text;
                }
                if (retryText) {
                  const rm = retryText.match(/\{[\s\S]*\}/);
                  if (rm) {
                    const retryReport = JSON.parse(rm[0]);
                    const retryQuality = checkTeamReportQuality(retryReport);
                    if (retryQuality.qualityScore > quality.qualityScore) {
                      report = retryReport;
                    }
                  }
                }
              }
            } catch (retryErr) {
              console.error("[team-intelligence] retry failed:", retryErr);
            }
          }

          send("progress", { step: "Finalizando informe táctico...", percent: 95 });
          send("complete", { report, videoId, timestamp: new Date().toISOString() });
        } catch (error: unknown) {
          send("error", { message: error instanceof Error ? error.message : "Error interno" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
      },
    });
  }
);
