/**
 * VITAS - Video Intelligence Agent v5
 * POST /api/agents/video-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Acepta keyframes base64 (local) o URLs (Bunny CDN).
 * Retorna SSE → VideoIntelligenceOutput completo.
 */

export const config = { runtime: "edge" };

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
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("progress", { step: "Iniciando VITAS Intelligence...", percent: 5 });
        const body = await req.json();
        const { playerContext, keyframes, videoId, playerId, vsiMetrics, similarityMatches, geminiObservations, kpiReport, monthlyChallenges, physicalMetrics, geminiEventCounts, analysisFocus } = body;

        if (!playerContext) {
          send("error", { message: "Faltan datos requeridos (playerContext)" });
          controller.close();
          return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send("error", { message: "ANTHROPIC_API_KEY no configurada en el servidor" });
          controller.close();
          return;
        }

        send("progress", { step: "Preparando fotogramas...", percent: 15 });

        // Build image content blocks from keyframes (base64 or URL)
        const imageBlocks: unknown[] = [];
        if (Array.isArray(keyframes)) {
          for (const kf of keyframes.slice(0, 8)) {
            const url: string = typeof kf === "string" ? kf : kf?.url ?? "";
            if (url.startsWith("data:image/")) {
              // Base64 encoded frame from Canvas extraction
              const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
              if (match) {
                imageBlocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: match[1],
                    data: match[2],
                  },
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

        send("progress", { step: `Analizando ${imageBlocks.length} fotogramas con IA...`, percent: 30 });

        // Build the full prompt requesting VideoIntelligenceOutput format
        const ctx = playerContext;
        const hasGemini = !!geminiObservations;

        // Sección de datos del jugador (común a ambos modos)
        const playerDataBlock = `DATOS DEL JUGADOR:
- Nombre: ${ctx.name}
- Edad: ${ctx.age} años
- Posición: ${ctx.position}
- Pie: ${ctx.foot || "no especificado"}
- Estatura: ${ctx.height || "?"} cm | Peso: ${ctx.weight || "?"} kg
- VSI actual: ${ctx.currentVSI || "?"}
- PHV: ${ctx.phvCategory || "?"} (offset: ${ctx.phvOffset || 0})
- Nivel competitivo: ${ctx.competitiveLevel || "formativo"}
- Dorsal: ${ctx.jerseyNumber || "?"} | Color uniforme: ${ctx.teamColor || "?"}`;

        const similarityBlock = similarityMatches ? `
DATOS DE SIMILITUD ESTADÍSTICA (motor coseno con base de datos EA FC25):
- Mejor match: ${similarityMatches.bestMatch.name} (${similarityMatches.bestMatch.club}, ${similarityMatches.bestMatch.position}, OVR ${similarityMatches.bestMatch.overall}) — similitud ${similarityMatches.bestMatch.score}%
- Top 5: ${similarityMatches.top5.map((m: { name: string; club: string; overall: number; score: number }) => `${m.name} (${m.club}, OVR ${m.overall}, ${m.score}%)`).join(", ")}

IMPORTANTE: Estos matches reflejan ESTILO de juego (perfil de métricas similar), NO nivel absoluto. Un juvenil puede tener el mismo perfil que un profesional de élite pero estar en etapas tempranas de desarrollo. La proyeccion de carrera y el jugadorReferencia deben ser COHERENTES entre sí: si el match es un jugador de primera división, la proyección debe explicar el camino realista para llegar (o no) a ese nivel, considerando edad, nivel competitivo actual y lo que se observa en el video.` : "";

        // Modo Gemini: Claude recibe observaciones detalladas del video completo
        const geminiContextBlock = hasGemini ? `
OBSERVACIONES DE VIDEO (generadas por IA que analizó el video completo del jugador):

RESUMEN: ${geminiObservations.resumenGeneral}

TIMELINE DE ACCIONES:
${geminiObservations.timeline?.map((t: { timestamp: string; tipo: string; descripcion: string }) => `- [${t.timestamp}] (${t.tipo}) ${t.descripcion}`).join("\n") || "No disponible"}

DIMENSIONES OBSERVADAS:
${Object.entries(geminiObservations.dimensiones || {}).map(([dim, data]: [string, unknown]) => {
  const d = data as { observaciones: string[]; score_estimado: number };
  return `- ${dim} (${d.score_estimado}/10): ${d.observaciones?.join("; ") || "sin datos"}`;
}).join("\n")}

MOMENTOS DESTACADOS:
${geminiObservations.momentosDestacados?.map((m: { timestamp: string; tipo: string; descripcion: string }) => `- [${m.timestamp}] (${m.tipo}) ${m.descripcion}`).join("\n") || "No disponible"}

PATRONES DE JUEGO:
${geminiObservations.patronesJuego?.join(", ") || "No identificados"}

Estas observaciones provienen del análisis del VIDEO COMPLETO. Úsalas como base principal de tu evaluación.` : "";

        // Intro diferente según modo
        const introBlock = hasGemini
          ? `Eres VITAS, un scout de fútbol IA de élite. Un sistema de observación ha analizado el video completo del jugador y te proporciona sus observaciones detalladas. Tu trabajo es interpretar estas observaciones y generar el informe de inteligencia estructurado.`
          : `Eres VITAS, un scout de fútbol IA de élite. Analiza estos ${imageBlocks.length} fotogramas del jugador:`;

        const frameInstructionBlock = !hasGemini
          ? `\nObserva cuidadosamente cada fotograma. Busca al jugador con dorsal ${ctx.jerseyNumber || "?"} y uniforme ${ctx.teamColor || "?"}.`
          : "";

        // Bloque de KPIs pre-calculados
        const kpiBlock = kpiReport ? `
INDICADORES DE DESARROLLO (calculados con curvas científicas + datos de 60,000 jugadores FIFA):
- % del peak estimado (promedio): ${kpiReport.avgPctOfPeak}%
- VSI proyectado a los 18: ${kpiReport.projectedVSI.at18.estimate} (rango: ${kpiReport.projectedVSI.at18.low}-${kpiReport.projectedVSI.at18.high})
- VSI proyectado a los 21: ${kpiReport.projectedVSI.at21.estimate} (rango: ${kpiReport.projectedVSI.at21.low}-${kpiReport.projectedVSI.at21.high})
- Ventaja madurativa: ${kpiReport.maturationAdvantage > 0 ? "+" : ""}${kpiReport.maturationAdvantage} puntos
- Edad equivalente pro: ${kpiReport.ageEquivalentPro} años
- Confianza de la proyección: ${Math.round(kpiReport.confidence * 100)}%
${kpiReport.disclaimer ? `- Nota: ${kpiReport.disclaimer}` : ""}

USA estos datos para la sección "proyeccionCarrera". Los rangos de confianza son obligatorios.` : "";

        // Bloque de retos mensuales
        const challengesBlock = monthlyChallenges ? `
PLAN DE RETOS MENSUALES (${monthlyChallenges.horizonMonths} meses, grupo: ${monthlyChallenges.ageGroup}):
Áreas foco: ${monthlyChallenges.focusAreas.join(", ")}
${monthlyChallenges.challenges.map((c: { month: number; title: string; metric: string; description: string; kpiTarget: string }) =>
  `- Mes ${c.month}: [${c.metric}] ${c.title} — ${c.description} (KPI: ${c.kpiTarget})`
).join("\n")}

INTEGRA estos retos en la sección "retosDesarrollo" del JSON. Adapta el lenguaje al jugador.` : "";

        // Bloque de métricas cuantitativas
        const physicalBlock = physicalMetrics ? `
MÉTRICAS FÍSICAS (tracking por computadora, datos objetivos):
- Velocidad máxima: ${physicalMetrics.maxSpeedKmh?.toFixed(1)} km/h
- Velocidad promedio: ${physicalMetrics.avgSpeedKmh?.toFixed(1)} km/h
- Distancia recorrida: ${physicalMetrics.distanceM?.toFixed(0)} m
- Sprints (>21 km/h): ${physicalMetrics.sprints}
- Duelos (tracking): ${physicalMetrics.duelsWon}G / ${physicalMetrics.duelsLost}P
- Zonas: caminar ${physicalMetrics.intensityZones?.walk?.toFixed(0)}m | trote ${physicalMetrics.intensityZones?.jog?.toFixed(0)}m | carrera ${physicalMetrics.intensityZones?.run?.toFixed(0)}m | sprint ${physicalMetrics.intensityZones?.sprint?.toFixed(0)}m

Estos son datos medidos por computadora, NO estimaciones. Úsalos como referencia objetiva.` : "";

        const eventCountsBlock = geminiEventCounts ? `
EVENTOS CONTADOS (observación IA del video completo):
- Pases completados: ${geminiEventCounts.pasesCompletados ?? 0} | Fallados: ${geminiEventCounts.pasesFallados ?? 0} | Precisión: ${((geminiEventCounts.pasesCompletados ?? 0) + (geminiEventCounts.pasesFallados ?? 0)) > 0 ? Math.round(((geminiEventCounts.pasesCompletados ?? 0) / ((geminiEventCounts.pasesCompletados ?? 0) + (geminiEventCounts.pasesFallados ?? 0))) * 100) : 0}%
- Recuperaciones: ${geminiEventCounts.recuperaciones ?? 0}
- Duelos ganados: ${geminiEventCounts.duelosGanados ?? 0} | Perdidos: ${geminiEventCounts.duelosPerdidos ?? 0}
- Disparos al arco: ${geminiEventCounts.disparosAlArco ?? 0} | Fuera: ${geminiEventCounts.disparosFuera ?? 0}
- Centros: ${geminiEventCounts.centros ?? 0} | Faltas: ${geminiEventCounts.faltas ?? 0}

Estos conteos provienen de la observación del video completo. Intégralos en tu análisis.` : "";

        const prompt = `${introBlock}

${playerDataBlock}
${geminiContextBlock}${frameInstructionBlock}${similarityBlock}${kpiBlock}${challengesBlock}${physicalBlock}${eventCountsBlock}
${analysisFocus ? `
ENFOQUE DEL ANÁLISIS: El usuario pidió que te CONCENTRES especialmente en: ${Array.isArray(analysisFocus) ? analysisFocus.join(", ") : analysisFocus}.
Dedica más detalle a estas áreas en el resumen ejecutivo, observaciones por dimensión, patrones ADN, y plan de desarrollo. Los scores de las dimensiones deben reflejar con mayor precisión el rendimiento en estas áreas específicas. Las fortalezas y áreas de desarrollo deben priorizar estas acciones.` : ""}

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "playerId": "${playerId || ctx.name}",
  "videoId": "${videoId || "unknown"}",
  "generatedAt": "${new Date().toISOString()}",
  "estadoActual": {
    "resumenEjecutivo": "string max 400 chars",
    "nivelActual": "elite|alto|medio_alto|medio|desarrollo",
    "fortalezasPrimarias": ["max 4 strings"],
    "areasDesarrollo": ["max 3 strings"],
    "dimensiones": {
      "velocidadDecision": {"score": 0-10, "observacion": "string"},
      "tecnicaConBalon": {"score": 0-10, "observacion": "string"},
      "inteligenciaTactica": {"score": 0-10, "observacion": "string"},
      "capacidadFisica": {"score": 0-10, "observacion": "string"},
      "liderazgoPresencia": {"score": 0-10, "observacion": "string"},
      "eficaciaCompetitiva": {"score": 0-10, "observacion": "string"}
    },
    "ajusteVSIVideoScore": -15 to 15
  },
  "adnFutbolistico": {
    "estiloJuego": "string max 200",
    "arquetipoTactico": "string max 100",
    "patrones": [{"patron":"string","frecuencia":"alto|medio|bajo","descripcion":"string max 150"}],
    "mentalidad": "string max 200"
  },
  "jugadorReferencia": {
    "top5": [{"proPlayerId":"id","nombre":"string","posicion":"string","club":"string","score":0-100,"razonamiento":"string max 200"}],
    "bestMatch": {"proPlayerId":"id","nombre":"string","posicion":"string","club":"string","score":0-100,"narrativa":"string max 300"}
  },
  "proyeccionCarrera": {
    "escenarioOptimista": {"descripcion":"string max 300 — DEBE mencionar evidencias concretas del video","nivelProyecto":"string","clubTipo":"string","edadPeak":number},
    "escenarioRealista": {"descripcion":"string max 300 — DEBE mencionar evidencias concretas del video","nivelProyecto":"string","clubTipo":"string"},
    "factoresClave": ["max 4 strings — al menos 2 deben venir de lo observado en video"],
    "riesgos": ["max 3 strings — al menos 1 debe venir de lo observado en video"],
    "kpis": {
      "pctOfPeak": number,
      "vsiProyectado18": {"estimado":number,"bajo":number,"alto":number},
      "vsiProyectado21": {"estimado":number,"bajo":number,"alto":number},
      "ventajaMadurativa": number,
      "edadEquivalentePro": number,
      "confianzaProyeccion": number
    }
  },
  "retosDesarrollo": {
    "horizonte": "string (ej: '6 meses')",
    "grupoEdad": "string",
    "retos": [{"mes":number,"titulo":"string","metrica":"string","descripcion":"string max 150","kpiObjetivo":"string","ejercicioSugerido":"string"}]
  },
  "planDesarrollo": {
    "objetivo6meses": "string max 200",
    "objetivo18meses": "string max 200",
    "pilaresTrabajo": [{"pilar":"string","acciones":["max 3"],"prioridad":"crítica|alta|media"}],
    "recomendacionEntrenador": "string max 300"
  },
  "confianza": 0-1,
  "modeloUsado": "claude-sonnet-4-20250514"
}

REGLAS CRÍTICAS:
- Usa jugadores profesionales REALES para jugadorReferencia (usa IDs tipo "pro-nombre")
- Basa tu análisis en lo que observas en el video/fotogramas. Sé honesto y específico
- PROYECCIÓN DE CARRERA: La proyección DEBE cambiar según lo que se observa en cada video. NO repitas proyecciones genéricas. Cita acciones específicas del video que justifiquen la proyección (ej: "su capacidad de desmarque mostrada en el minuto 2:15 sugiere potencial para..."). Si el video muestra bajo rendimiento, la proyección debe reflejarlo
- DIFERENCIACIÓN POR VIDEO: Cada análisis debe ser ÚNICO basado en el rendimiento mostrado en ESTE video específico. Scores, proyecciones y observaciones deben variar si el rendimiento es diferente
- Responde en español.`;

        // Build content array: images only when no Gemini observations (fallback mode)
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
              max_tokens: 6000,
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

        send("progress", { step: "Finalizando informe...", percent: 95 });
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
