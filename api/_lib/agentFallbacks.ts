/**
 * VITAS · Deterministic Agent Fallbacks
 * Pure TypeScript implementations of agent logic for when LLMs are unavailable.
 * Each function returns the SAME schema as the Claude-powered agent.
 * Confidence is always lower to indicate approximate results.
 */

type FallbackReason = "no_api_key" | "claude_error" | "parse_error";

// ─── PHV Calculator (Mirwald Formula) ───────────────────────────────────────

interface PHVInput {
  playerId: string;
  chronologicalAge: number;
  height?: number;
  weight?: number;
  sitingHeight?: number;
  legLength?: number;
  currentVSI?: number;
}

// ⚠️ SIN CALLER EN PRODUCCIÓN (solo tests). Implementa ÚNICAMENTE la fórmula
// Mirwald MASCULINA e ignora el sexo (PHVInput ni siquiera lo lleva). NO cablear
// como fallback del agente PHV sin añadir antes un gate de sexo: produciría un PHV
// mal-sexado sobre un menor (invariante #5). El path VIVO y correcto, con gate M/F,
// es api/agents/_phv-calculator.ts.
export function phvFallback(body: PHVInput, reason: FallbackReason) {
  const age = body.chronologicalAge;
  const height = body.height ?? 155;
  const weight = body.weight ?? 45;
  const sittingHeight = body.sitingHeight ?? height * 0.52;
  const legLength = body.legLength ?? height * 0.48;
  const hasRealData = !!(body.sitingHeight && body.legLength);
  const vsi = body.currentVSI ?? 70;

  // Mirwald formula (male)
  const offset =
    -9.236 +
    0.0002708 * legLength * sittingHeight -
    0.001663 * age * legLength +
    0.007216 * age * sittingHeight +
    0.02292 * ((weight / height) * 100);

  // Categorization
  const category: "early" | "ontme" | "late" =
    offset < -1.0 ? "early" : offset > 1.0 ? "late" : "ontme";

  const phvStatus: "pre_phv" | "during_phv" | "post_phv" =
    category === "early" ? "pre_phv" : category === "late" ? "post_phv" : "during_phv";

  // Development window
  let developmentWindow: "critical" | "active" | "stable" = "stable";
  if (phvStatus === "during_phv") developmentWindow = "critical";
  else if ((offset >= -2.0 && offset < -1.0) || (offset > 1.0 && offset <= 2.0))
    developmentWindow = "active";

  // VSI adjustment
  const factor = category === "early" ? 1.12 : category === "late" ? 0.92 : 1.0;
  const adjustedVSI = Math.min(100, Math.max(0, Math.round(vsi * factor * 100) / 100));

  // Confidence is lower than Claude's (0.5/0.62 vs 0.74/0.92)
  const confidence = hasRealData ? 0.62 : 0.5;

  // OJO: phvCategory está invertido vs pares — "early" = pre-PHV = madurador
  // TARDÍO (talento oculto); "late" = post-PHV = PRECOZ (ventaja física temporal).
  const recommendations: Record<string, string> = {
    early: "Madurador tardío (aún pre-PHV): su físico no refleja todavía su talento. Priorizar técnica y paciencia; su rendimiento suele emerger tras el estirón.",
    ontme: "Maduración en fase con su edad. Mantener plan de desarrollo equilibrado.",
    late: "Madurador precoz (post-PHV): ventaja física posiblemente temporal. Que el VSI no la sobrevalore; reforzar técnica-táctica sobre el físico.",
  };

  return {
    playerId: body.playerId,
    chronologicalAge: age,
    offset: Math.round(offset * 100) / 100,
    category,
    phvStatus,
    developmentWindow,
    adjustedVSI,
    recommendation: recommendations[category],
    confidence,
    tokensUsed: 0,
    agentName: "PHVCalculatorAgent",
    _fallback: true,
    _fallbackReason: reason,
  };
}

// ─── Role Profile (Rule-based) ──────────────────────────────────────────────

interface RoleProfileInput {
  player: {
    id?: string;
    name: string;
    age?: number;
    foot?: string;
    position?: string;
    minutesPlayed?: number;
    competitiveLevel?: string;
    metrics?: Record<string, number>;
    phvCategory?: string;
    phvOffset?: number;
  };
}

export function roleProfileFallback(body: RoleProfileInput, reason: FallbackReason) {
  const p = body.player;
  const m = p.metrics ?? { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 };
  const speed = m.speed ?? 60;
  const technique = m.technique ?? 60;
  const vision = m.vision ?? 60;
  const stamina = m.stamina ?? 60;
  const shooting = m.shooting ?? 60;
  const defending = m.defending ?? 60;

  // Identity rules from prompt
  let dominantIdentity: "ofensivo" | "defensivo" | "tecnico" | "fisico" | "mixto";
  const sorted = [
    { k: "speed", v: speed }, { k: "technique", v: technique },
    { k: "vision", v: vision }, { k: "stamina", v: stamina },
    { k: "shooting", v: shooting }, { k: "defending", v: defending },
  ].sort((a, b) => b.v - a.v);

  const top2 = new Set([sorted[0].k, sorted[1].k]);
  const top4Diff = sorted[0].v - sorted[3].v;

  if (top4Diff < 10) dominantIdentity = "mixto";
  else if (top2.has("speed") && top2.has("stamina")) dominantIdentity = "fisico";
  else if (top2.has("technique") && top2.has("vision")) dominantIdentity = "tecnico";
  else if (top2.has("shooting") && top2.has("speed")) dominantIdentity = "ofensivo";
  else if (top2.has("defending") && top2.has("stamina")) dominantIdentity = "defensivo";
  else dominantIdentity = "mixto";

  // Identity distribution (must sum to 1.0)
  const rawDist = {
    ofensivo: (shooting + speed) / 2,
    defensivo: (defending + stamina) / 2,
    tecnico: (technique + vision) / 2,
    fisico: (speed + stamina) / 2,
    mixto: 0,
  };
  const total = rawDist.ofensivo + rawDist.defensivo + rawDist.tecnico + rawDist.fisico;
  const identityDistribution = {
    ofensivo: Math.round((rawDist.ofensivo / total) * 100) / 100,
    defensivo: Math.round((rawDist.defensivo / total) * 100) / 100,
    tecnico: Math.round((rawDist.tecnico / total) * 100) / 100,
    fisico: Math.round((rawDist.fisico / total) * 100) / 100,
    mixto: 0,
  };
  // Fix rounding to sum exactly 1.0
  const sum = identityDistribution.ofensivo + identityDistribution.defensivo +
    identityDistribution.tecnico + identityDistribution.fisico;
  identityDistribution.mixto = Math.round((1.0 - sum) * 100) / 100;

  // Capabilities
  const tactical = Math.round((vision + defending) / 2);
  const technical = Math.round((technique + vision) / 2);
  const physical = Math.round((speed + stamina) / 2);
  const phvFactor = p.phvCategory === "early" ? 0.03 : p.phvCategory === "late" ? 0.01 : 0.02;

  const capabilities = {
    tactical: { current: tactical, p6m: Math.round(tactical * (1 + phvFactor)), p18m: Math.round(tactical * (1 + phvFactor * 2.5)) },
    technical: { current: technical, p6m: Math.round(technical * (1 + phvFactor)), p18m: Math.round(technical * (1 + phvFactor * 2.5)) },
    physical: { current: physical, p6m: Math.round(physical * (1 + phvFactor)), p18m: Math.round(physical * (1 + phvFactor * 2.5)) },
  };

  // Confidence based on minutes
  const mins = p.minutesPlayed ?? 0;
  const confidence = mins > 500 ? 0.42 : mins > 200 ? 0.35 : 0.28;

  // Position mapping · respeta lateralidad declarada y pie hábil
  const positionStr = (p.position ?? "").toLowerCase();
  const foot = (p as { foot?: string }).foot;
  const isLeft  = positionStr.includes("izquierd") || foot === "left";
  const isRight = positionStr.includes("derech") || (!isLeft && (foot === "right" || foot === undefined));
  const side: "L" | "R" = isLeft ? "L" : "R";

  let posCode = "RCM";
  if (positionStr.includes("portero")) posCode = "GK";
  else if (positionStr.includes("central") || positionStr.includes("defensa")) posCode = side === "L" ? "LCB" : "RCB";
  else if (positionStr.includes("lateral")) posCode = side === "L" ? "LB" : "RB";
  else if (positionStr.includes("carrilero")) posCode = side === "L" ? "LWB" : "RWB";
  else if (positionStr.includes("pivote") || positionStr.includes("mediocentro defensiv")) posCode = "DM";
  else if (positionStr.includes("interior") || positionStr.includes("mediocent") || positionStr.includes("centrocampista")) posCode = side === "L" ? "LCM" : "RCM";
  else if (positionStr.includes("mediapunta") || positionStr.includes("enganche")) posCode = "CAM";
  else if (positionStr.includes("extremo") || positionStr.includes("banda")) posCode = side === "L" ? "LW" : "RW";
  else if (positionStr.includes("delantero") || positionStr.includes("punta")) posCode = "ST";
  // Suprimir warning sobre isRight no usado
  void isRight;

  // Strengths = top 3 metrics
  const strengths = sorted.slice(0, 3).map(s => `${s.k}: ${s.v}`);
  // Gaps = bottom 2
  const gaps = sorted.slice(-2).map(s => `${s.k} necesita mejora (${s.v})`);

  return {
    playerId: p.id,
    dominantIdentity,
    identityDistribution,
    topPositions: [
      { code: posCode, fit: 75, confidence: confidence },
    ],
    topArchetypes: [
      { code: dominantIdentity === "tecnico" ? "organizador" : dominantIdentity === "ofensivo" ? "finalizador" : "recuperador", fit: 70, stability: "en_desarrollo" as const },
    ],
    capabilities,
    strengths,
    risks: ["Resultado aproximado — análisis IA no disponible"],
    gaps,
    overallConfidence: confidence,
    summary: `Perfil generado por reglas determinísticas para ${p.name}. Identidad dominante: ${dominantIdentity}. Se recomienda ejecutar análisis con IA para mayor precisión.`,
    tokensUsed: 0,
    agentName: "RoleProfileAgent",
    _fallback: true,
    _fallbackReason: reason,
  };
}

// ─── Scout Insight (Rule-based) ─────────────────────────────────────────────

interface ScoutInput {
  player: {
    id?: string;
    name: string;
    age?: number;
    position?: string;
    vsi?: number;
    vsiTrend?: string;
    phvCategory?: string;
    recentMetrics?: Record<string, number>;
  };
  context?: string;
}

export function scoutInsightFallback(body: ScoutInput, reason: FallbackReason) {
  const p = body.player;
  const vsi = p.vsi ?? 60;
  const trend = p.vsiTrend ?? "stable";
  const phv = p.phvCategory ?? "ontme";
  const metrics = p.recentMetrics ?? {};
  const speed = metrics.speed ?? 60;
  const maxMetric = Math.max(...Object.values(metrics).filter(v => typeof v === "number"), 0);

  // Determine type by rules
  let type: "breakout" | "phv_alert" | "drill_record" | "regression" | "comparison" | "general" = "general";
  let urgency: "high" | "medium" | "low" = "low";
  let headline = `Resumen de ${p.name}`;
  let body_text = `VSI actual: ${vsi}. Tendencia: ${trend}.`;

  if (vsi > 75 && trend === "up") {
    type = "breakout";
    urgency = "high";
    headline = `${p.name} muestra progresión destacada`;
    body_text = `VSI de ${vsi} con tendencia ascendente. Jugador en fase de despegue, monitorizar de cerca para optimizar su desarrollo.`;
  } else if (phv === "early" && speed > 75) {
    // "early" = pre-PHV = madurador TARDÍO vs pares (no "temprana").
    type = "phv_alert";
    urgency = "high";
    headline = `Alerta PHV: ${p.name} en ventana crítica`;
    body_text = `Madurador tardío (aún pre-PHV) con velocidad ${speed}: rendimiento notable sin ventaja madurativa — señal de talento. Priorizar técnica sobre carga física.`;
  } else if (maxMetric > 85) {
    type = "drill_record";
    urgency = "medium";
    const topMetricName = Object.entries(metrics).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "métrica";
    headline = `${p.name} destaca en ${topMetricName}`;
    body_text = `Valor de ${maxMetric} en ${topMetricName}. Potenciar esta fortaleza con ejercicios específicos.`;
  } else if (trend === "down") {
    type = "regression";
    urgency = "high";
    headline = `${p.name}: descenso en rendimiento`;
    body_text = `VSI de ${vsi} con tendencia descendente. Revisar carga de entrenamiento y factores externos.`;
  } else if (Object.values(metrics).every(v => typeof v === "number" && v >= 55 && v <= 75)) {
    type = "comparison";
    urgency = "low";
    headline = `${p.name}: perfil equilibrado`;
    body_text = `Métricas homogéneas entre 55-75. Buscar especialización en una dimensión clave.`;
  }

  // Override with explicit context
  if (body.context && ["breakout", "comparison", "phv_alert", "drill_record", "regression", "milestone", "general"].includes(body.context)) {
    type = body.context as typeof type;
  }

  return {
    playerId: p.id ?? "unknown",
    type,
    headline,
    body: body_text,
    metric: Object.entries(metrics).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "vsi",
    metricValue: String(maxMetric > 0 ? maxMetric : vsi),
    urgency,
    tags: [type, p.position ?? "jugador"].filter(Boolean).slice(0, 4),
    timestamp: new Date().toISOString(),
    recommendedDrills: [],
    actionItems: [
      "Revisar métricas en la próxima sesión",
      "Comparar con jugadores de la misma edad y posición",
    ],
    tokensUsed: 0,
    agentName: "ScoutInsightAgent",
    ragEnriched: false,
    _fallback: true,
    _fallbackReason: reason,
  };
}
