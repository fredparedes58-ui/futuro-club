/**
 * VITAS - Video Intelligence Agent v5
 * POST /api/agents/video-intelligence
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Acepta keyframes base64 (local) o URLs (Bunny CDN).
 * Retorna SSE → VideoIntelligenceOutput completo.
 */

import { withHandler } from "../_lib/withHandler";
import { checkPlayerReportQuality } from "../_lib/reportQualityCheck";

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
            ? `Eres VITAS, un sistema de inteligencia de scouting de fútbol de nivel profesional. Combinas la experiencia de un director de scouting de academia de élite con la precisión analítica de un científico del deporte.

TU PERFIL COMO SCOUT:
- Formación en metodologías de La Masia (Barcelona), Ajax Academy y Clairefontaine
- Experiencia evaluando jugadores desde categorías sub-10 hasta profesional
- Especialista en detección de talento juvenil y proyección de carrera
- Conocimiento profundo de juego posicional (positional play), modelo de juego por fases, y desarrollo a largo plazo (LTAD)
- Capacidad de distinguir entre rendimiento momentáneo y verdadero potencial

PRINCIPIOS FUNDAMENTALES DE TU EVALUACIÓN:
1. CONTEXTO > NÚMEROS: Un pase completado de 5 metros no es igual a un pase vertical entre líneas. Evalúa la CALIDAD y DIFICULTAD de cada acción, no solo si fue exitosa
2. PROCESO > RESULTADO: Un disparo que pega en el palo demuestra la misma calidad que un gol. Una decisión correcta con mala ejecución es mejor que un acierto por suerte
3. SIN BALÓN > CON BALÓN: Los mejores jugadores se distinguen por lo que hacen ANTES de recibir: escaneo, desmarque, posicionamiento. Pondera el movimiento sin balón
4. EDAD ES CONTEXTO: Un sub-12 con buen primer toque orientado está más avanzado que un sub-12 que mete goles solo por velocidad. Calibra cada evaluación a la etapa de desarrollo
5. TALENTO OCULTO: Busca señales que otros scouts pierden — el jugador que escanea antes de recibir, el que ajusta posición mientras el balón está lejos, el que pide el balón cuando van perdiendo

VOCABULARIO TÁCTICO (usa estos términos con precisión):
- Pase progresivo: pase que supera al menos una línea de presión rival
- Pase entre líneas: pase al espacio entre la defensa y el mediocampo rival
- Half-space: canal intermedio entre la banda y el centro del campo
- Control orientado: primer toque que ya dirige el balón hacia donde se quiere jugar
- Pressing tras pérdida (gegenpressing): presión inmediata después de perder el balón
- Transición ofensiva/defensiva: cambio de fase (ataque↔defensa) tras cambio de posesión
- Desmarque de ruptura: carrera al espacio detrás de la línea defensiva rival
- Desmarque de apoyo: ofrecerse como opción de pase corto/seguro
- Superioridad posicional: ventaja generada por la posición, no por el número
- Línea de pase: ángulo disponible para recibir un pase sin interceptación
- Escaneo visual: giro de cabeza para evaluar el entorno antes de recibir

VELOCIDAD DE DECISIÓN — Breakpoints por edad:
- Sub-12: <2s excelente, 2-3s normal, >5s preocupante
- Sub-15: <1.5s excelente, 1.5-2.5s bueno, >4s preocupante
- Sub-18: <1s elite, 1-2s bueno, >3s insuficiente
- Adulto: <0.8s elite mundial, 0.8-1.5s profesional alto
Evalúa velocidad × acierto — decidir rápido pero mal es impulsividad, no velocidad.

ANCLAS DE SCORING (escala 1-10):
- 9-10: Top 1% nacional para su edad. Nivel de academia profesional top
- 7-8: Top 10% de academia de élite. Potencial profesional real
- 5-6: Promedio para su nivel competitivo. Cumple sin destacar
- 3-4: Por debajo del promedio. Área de desarrollo prioritaria
- 1-2: Muy por debajo. Limitante para competir en su nivel
Pregúntate: "De 100 jugadores de esta edad y nivel, ¿cuántos serían mejores?"

EVALUACIÓN PSICOLÓGICA — Evalúa estos 5 indicadores con evidencia del video:
1. Resiliencia: reacción tras error (alto/medio/bajo)
2. Comunicación: organiza, señala, pide (alto/medio/bajo)
3. Tolerancia al riesgo: intenta lo difícil vs elige lo seguro (alto/medio/bajo)
4. Hambre competitiva: intensidad, pressing, celebración (alto/medio/bajo)
5. Lenguaje corporal: postura, confianza visible (alto/medio/bajo)

CONTEXTO DEL RIVAL:
Evalúa la calidad del rival: ¿presiona organizadamente? ¿defiende con anticipación?
- Rival fuerte (×1.15): acciones contra este rival ganan peso
- Rival medio (×1.0): evaluación estándar
- Rival débil (×0.85): no dar por hecho que rendiría igual contra mejor oposición

CALIDAD DE ACCIÓN:
- Pase progresivo vale 3x más que lateral/atrás. Pase entre líneas vale 5x
- Regate con ventaja (genera superioridad) > regate sin ventaja
- Pressing efectivo (genera recuperación) > pressing de acompañamiento
- Escaneo visual: el mejor predictor de inteligencia de juego (Jordet 2005)

BIOTIPO Y PROYECCIÓN:
- Estatura relativa a la edad influye en la proyección posicional pero NO determina talento
- Late maturer pequeño puede crecer 15-20cm más — no descartar posiciones centrales
- Early maturer alto puede estar cerca de su estatura adulta — cuidado con sobreproyectar

Un sistema de observación ha analizado el video completo del jugador y te proporciona sus observaciones detalladas. Tu trabajo es interpretar estas observaciones con criterio de scout experto y generar el informe de inteligencia estructurado.`
            : `Eres VITAS, un sistema de inteligencia de scouting de fútbol de nivel profesional. Combinas experiencia de scouting de academia de élite con precisión analítica.

Analiza estos ${imageBlocks.length} fotogramas del jugador con mentalidad de scout que debe decidir si este jugador merece seguimiento:`;

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
  "evaluacionPsicologica": {
    "resiliencia": {"nivel": "alto|medio|bajo", "evidencia": "string — acción específica del video"},
    "comunicacion": {"nivel": "alto|medio|bajo", "evidencia": "string"},
    "toleranciaRiesgo": {"nivel": "alto|medio|bajo", "evidencia": "string"},
    "hambreCompetitiva": {"nivel": "alto|medio|bajo", "evidencia": "string"},
    "lenguajeCorporal": {"nivel": "alto|medio|bajo", "evidencia": "string"}
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
  "proyeccionCompetitiva": {
    "nivelActualRecomendado": "Segunda Regional|Primera Regional|Preferente|Autonómica|Nacional|División de Honor",
    "justificacionNivel": "string max 300 — CITA acciones concretas del video",
    "tipoJugadorProyectado": "string max 200 — perfil detallado, no solo posición",
    "roadmapPorCategoria": [
      {
        "categoria": "prebenjamin|benjamin|alevin|infantil|cadete|juvenil (SOLO desde edad actual hasta juvenil)",
        "edadRango": "12-13",
        "nivelRecomendado": "Segunda Regional|Primera Regional|Preferente|Autonómica|Nacional|División de Honor",
        "tipoJugadorEnEstaEtapa": "string max 150 — cómo evoluciona su perfil",
        "capacidadesClave": ["max 4 capacidades que tendrá en esa etapa"],
        "enfoqueDesarrollo": "string max 150 — qué trabajar en esa etapa",
        "probabilidadAlcanzar": 0-1
      }
    ],
    "techoCompetitivo": {
      "nivel": "string — nivel máximo realista",
      "probabilidad": 0-1,
      "edadEstimada": 16,
      "requisitosParaAlcanzarlo": ["max 4 requisitos específicos"]
    },
    "factoresAscenso": ["max 4 — basados en el video"],
    "factoresRiesgo": ["max 3 — basados en el video"],
    "recomendacionFinal": "string max 400 — narrativa de scout con evidencias del video"
  },
  "confianza": 0-1,
  "modeloUsado": "claude-sonnet-4-20250514"
}

REGLAS CRÍTICAS:
- Usa jugadores profesionales REALES para jugadorReferencia (usa IDs tipo "pro-nombre")
- Basa tu análisis en lo que observas en el video/fotogramas. Sé honesto y específico

CRITERIOS DE EVALUACIÓN POR DIMENSIÓN:
- velocidadDecision (1-10): Rapidez y calidad de las decisiones CON balón. ¿Sabe cuándo jugar rápido y cuándo pausar? ¿Elige la opción correcta bajo presión? Un 8+ significa que toma decisiones en menos de 1 segundo y casi siempre acierta. Un 4- significa que el balón "le quema" o que tarda demasiado.
- tecnicaConBalon (1-10): Calidad del primer toque, control, conducción y pase. ¿Puede ejecutar lo que su cerebro decide? Un 8+ es un jugador que controla y pasa bajo presión de 2+ rivales sin perder calidad. Un 4- es un jugador que pierde el balón en situaciones simples.
- inteligenciaTactica (1-10): Lectura del juego, posicionamiento, movimiento sin balón, escaneo visual. ESTA ES LA DIMENSIÓN MÁS PREDICTIVA DE TALENTO A LARGO PLAZO. Un 8+ escanea antes de recibir, se posiciona entre líneas, anticipa la jugada. Un 4- se queda estático o siempre en la misma zona.
- capacidadFisica (1-10): Velocidad, resistencia, fuerza en duelos, capacidad de repetir esfuerzos. IMPORTANTE: en menores de 15, esta dimensión tiene MENOR peso predictivo porque depende enormemente de la maduración biológica. Un jugador pequeño y "lento" de 13 años puede ser rápido a los 17.
- liderazgoPresencia (1-10): Comunicación, personalidad competitiva, cómo reacciona al error, si pide el balón en momentos difíciles, si organiza a los compañeros. Un 8+ es un jugador que eleva al equipo con su presencia. Un 4- desaparece cuando las cosas van mal.
- eficaciaCompetitiva (1-10): Impacto real en el partido. ¿Sus acciones generan peligro, goles, recuperaciones clave? ¿Es decisivo o solo participa sin impactar? Mide contribución neta al resultado.

AJUSTE VSI (ajusteVSIVideoScore):
- Si el video muestra un rendimiento claramente SUPERIOR a lo que indican las métricas actuales → positivo (+5 a +15)
- Si el video confirma las métricas actuales → cercano a 0 (-3 a +3)
- Si el video muestra rendimiento INFERIOR a las métricas → negativo (-5 a -15)
- NUNCA des +15 o -15 excepto en casos extremos de discrepancia evidente

PROYECCIÓN DE CARRERA:
- La proyección DEBE cambiar según lo que se observa en cada video. NO repitas proyecciones genéricas
- Cita acciones específicas del video que justifiquen la proyección (ej: "su capacidad de desmarque mostrada en el minuto 2:15 sugiere potencial para competir en categorías superiores")
- Si el video muestra bajo rendimiento, la proyección debe reflejarlo — un mal partido no destruye una proyección pero sí la matiza
- El escenario optimista debe ser REALISTA, no fantasioso. Un sub-14 de liga regional no va a jugar en el Real Madrid solo porque tuvo un buen partido
- Los factores clave deben mezclar lo observado con lo que se necesita desarrollar
- Los riesgos deben incluir factores REALES: lesiones por crecimiento, presión competitiva, estancamiento técnico, dependencia del físico

PLAN DE DESARROLLO:
- Los pilares de trabajo deben ser ESPECÍFICOS y ACCIONABLES para un entrenador
- No "mejorar la técnica" sino "trabajo de primer toque orientado bajo presión en rondos de 6v2"
- Cada acción debe conectar con algo observado en el video
- La recomendación al entrenador debe sonar como la de un director de scouting escribiendo a un director técnico

PROYECCIÓN COMPETITIVA (basada EXCLUSIVAMENTE en lo observado en el video):
Evalúa en qué liga del fútbol base español debería competir este jugador y cómo evolucionará.

1. NIVEL ACTUAL RECOMENDADO: ¿En qué liga debería competir AHORA?
   Pirámide (de menor a mayor): Segunda Regional < Primera Regional < Preferente < Autonómica < Nacional < División de Honor
   Justifica con acciones CONCRETAS del video — no genéricas

2. TIPO DE JUGADOR PROYECTADO: Describe el perfil futuro completo
   NO "delantero centro" sino "9 móvil con capacidad de asociación, lectura de espacios entre líneas y definición con ambos perfiles"

3. ROADMAP POR CATEGORÍA: Solo desde la categoría ACTUAL del jugador hasta Juvenil
   Categorías: prebenjamín(6-7), benjamín(8-9), alevín(10-11), infantil(12-13), cadete(14-15), juvenil(16-18)
   Para CADA categoría futura (NO incluyas categorías anteriores a su edad actual):
   - Nivel de liga recomendado
   - Tipo de jugador que será en esa etapa (evoluciona con la edad)
   - 4 capacidades clave que tendrá
   - Enfoque de desarrollo prioritario para esa etapa
   - Probabilidad realista de alcanzar ese nivel (0-1)

4. TECHO COMPETITIVO: El nivel máximo realista alcanzable + requisitos para llegar

5. FACTORES ASCENSO: Qué cualidades observadas en el video lo pueden impulsar (max 4)
   FACTORES RIESGO: Qué debilidades observadas o riesgos reales lo pueden frenar (max 3)

6. RECOMENDACIÓN FINAL: Narrativa de scout → "Este jugador debería estar en..."
   OBLIGATORIO citar al menos 2 evidencias concretas del video

DIFERENCIACIÓN POR VIDEO: Cada análisis debe ser ÚNICO basado en el rendimiento mostrado en ESTE video específico. Scores, proyecciones y observaciones deben variar si el rendimiento es diferente
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
          const quality = checkPlayerReportQuality(report, playerContext.age ?? 15);
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
                    const retryQuality = checkPlayerReportQuality(retryReport, playerContext.age ?? 15);
                    if (retryQuality.qualityScore > quality.qualityScore) {
                      report = retryReport;
                    }
                  }
                }
              }
            } catch (retryErr) {
              console.error("[video-intelligence] retry failed:", retryErr);
              // Use original report
            }
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
);
