/**
 * VITAS · Intervention Protocol (Sprint 22)
 *
 * Generates personalized intervention protocol based on dropout risk.
 * Different actions for coach, parents, and club per primary factor.
 */

import type { DropoutRiskOutput } from "./dropoutRiskScorer";

// ─── Types ────────────────────────────────────────────────────────────────

export interface InterventionAction {
  audience: "coach" | "parent" | "club";
  action: string;
  priority: "immediate" | "this_week" | "this_month" | "monitor";
}

export interface InterventionProtocol {
  playerId: string;
  riskLevel: string;
  primaryFactor: string;
  urgency: "immediate" | "this_week" | "this_month" | "monitor";
  actions: InterventionAction[];
  followUpDate: string; // ISO date
  escalationNeeded: boolean;
}

// ─── Factor-based actions ────────────────────────────────────────────────

const FACTOR_ACTIONS: Record<string, InterventionAction[]> = {
  engagementDecline: [
    { audience: "coach", action: "Hablar individualmente con el jugador — preguntar cómo se siente con el entrenamiento", priority: "this_week" },
    { audience: "coach", action: "Incluir en ejercicios donde tenga más protagonismo (posesión, rondo pequeño)", priority: "this_week" },
    { audience: "parent", action: "Consultar si algo ha cambiado fuera del entrenamiento (colegio, amigos, familia)", priority: "this_week" },
    { audience: "club", action: "Revisar si la carga o el horario de entrenamiento está afectando al jugador", priority: "this_month" },
  ],
  motivationType: [
    { audience: "coach", action: "Establecer metas individuales pequeñas y alcanzables para las próximas 2 semanas", priority: "this_week" },
    { audience: "coach", action: "Aumentar refuerzo positivo — celebrar mejoras específicas en cada sesión", priority: "immediate" },
    { audience: "parent", action: "Evitar presión por resultados — enfocarse en preguntar si disfrutó el entrenamiento", priority: "this_week" },
    { audience: "club", action: "Considerar cambio de grupo o rol si la motivación no mejora en 4 semanas", priority: "this_month" },
  ],
  overtrainingRisk: [
    { audience: "coach", action: "Reducir carga de entrenamiento 20-30% esta semana", priority: "immediate" },
    { audience: "coach", action: "Incluir sesión de recuperación activa (técnica sin presión física)", priority: "immediate" },
    { audience: "parent", action: "Asegurar 8-9 horas de sueño y nutrición adecuada", priority: "this_week" },
    { audience: "club", action: "Revisar planificación semanal — posible sobreentrenamiento sistémico", priority: "this_week" },
  ],
  vsiStagnation: [
    { audience: "coach", action: "Proporcionar retroalimentación específica sobre áreas de mejora con ejemplos concretos", priority: "this_week" },
    { audience: "coach", action: "Variar ejercicios para estimular desarrollo desde diferentes ángulos", priority: "this_week" },
    { audience: "parent", action: "Recordar que el desarrollo no es lineal — las mesetas son normales", priority: "this_month" },
  ],
  attendanceDecline: [
    { audience: "coach", action: "Contactar al jugador/familia si hay 2+ ausencias seguidas sin justificación", priority: "immediate" },
    { audience: "parent", action: "Verificar si hay conflictos de horario o transporte", priority: "this_week" },
    { audience: "club", action: "Ofrecer alternativas de horario si es posible", priority: "this_month" },
  ],
  injuryRecurrence: [
    { audience: "coach", action: "Adaptar ejercicios para evitar movimientos de riesgo para su historial de lesiones", priority: "immediate" },
    { audience: "parent", action: "Consultar con médico deportivo si el dolor persiste", priority: "this_week" },
    { audience: "club", action: "Activar protocolo de readaptación post-lesión", priority: "immediate" },
  ],
  growthSpurtStress: [
    { audience: "coach", action: "Reducir ejercicios de salto e impacto. Enfocarse en técnica y coordinación", priority: "immediate" },
    { audience: "parent", action: "El estirón afecta temporalmente la coordinación — es normal y transitorio", priority: "this_week" },
    { audience: "club", action: "Monitorizar dolores articulares post-sesión (Osgood-Schlatter, Sever)", priority: "this_week" },
  ],
  lowResilience: [
    { audience: "coach", action: "Crear un entorno seguro para el error — normalizar fallos como parte del aprendizaje", priority: "this_week" },
    { audience: "coach", action: "Usar ejercicios de 'post-error recovery' — celebrar la respuesta al error, no solo el acierto", priority: "this_week" },
    { audience: "parent", action: "Reforzar el esfuerzo más que el resultado en las conversaciones post-entrenamiento", priority: "this_month" },
  ],
};

// ─── Main Function ───────────────────────────────────────────────────────

export function generateIntervention(
  dropoutRisk: DropoutRiskOutput,
): InterventionProtocol {
  const { playerId, riskLevel, primaryFactor } = dropoutRisk;

  // Urgency based on risk level
  const urgency: InterventionProtocol["urgency"] =
    riskLevel === "critical" ? "immediate" :
    riskLevel === "high" ? "this_week" :
    riskLevel === "moderate" ? "this_month" :
    "monitor";

  // Get actions for primary factor + any secondary critical factors
  const actions: InterventionAction[] = [
    ...(FACTOR_ACTIONS[primaryFactor] ?? FACTOR_ACTIONS.engagementDecline),
  ];

  // Add actions for any other factor with high score
  const factors = dropoutRisk.factors;
  for (const [key, value] of Object.entries(factors)) {
    if (!value || key === primaryFactor) continue;
    if (value.score > 60 && FACTOR_ACTIONS[key]) {
      // Add top action from this factor
      const extra = FACTOR_ACTIONS[key][0];
      if (extra && !actions.some(a => a.action === extra.action)) {
        actions.push(extra);
      }
    }
  }

  // Adjust priorities based on urgency
  if (urgency === "immediate") {
    actions.forEach(a => {
      if (a.priority === "this_month") a.priority = "this_week";
    });
  }

  // Follow-up date
  const followUp = new Date();
  followUp.setDate(followUp.getDate() + (urgency === "immediate" ? 3 : urgency === "this_week" ? 7 : 14));

  return {
    playerId,
    riskLevel,
    primaryFactor,
    urgency,
    actions,
    followUpDate: followUp.toISOString().split("T")[0],
    escalationNeeded: riskLevel === "critical",
  };
}
