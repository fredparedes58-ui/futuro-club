/**
 * VITAS · Zone-based Expected Goals (xG)
 *
 * @deprecated Sprint 6: Use `computeXg()` from `xgModel.ts` for shot xG with
 * full ShotContext features, or `computeXgSimple()` for position-only xG.
 * The PHV-adjusted xG is available via `phvXgAdjuster.ts`.
 * This module is kept for VAEP enrichment (enrichActionWithXg) which uses
 * positionalThreat/concedeThreat — those are NOT replaced by xgModel.
 *
 * Modelo xG simple basado en la posición en el campo.
 * No requiere proveedor externo (StatsBomb/Wyscout) — suficiente para MVP
 * y para alimentar VAEPService cuando faltan probabilidades.
 *
 * Campo estándar: 105m × 68m. Atacando hacia x=105, portería rival en (105, 34).
 *
 * Fuentes de inspiración:
 *  - Statsbomb open data — distancia + ángulo
 *  - Caley (2015) — peso de zona
 *  - VAEP paper (Decroos 2019) — necesita scoreProb por estado
 *
 * Salida: probabilidad estimada de marcar gol desde esa posición/contexto (0-1).
 */

const FIELD_LENGTH = 105;
const FIELD_WIDTH  = 68;
const GOAL_X       = 105;
const GOAL_Y       = 34;
const GOAL_WIDTH   = 7.32; // m

/** Distancia euclidiana al centro de la portería rival */
function distanceToGoal(x: number, y: number): number {
  return Math.sqrt(Math.pow(GOAL_X - x, 2) + Math.pow(GOAL_Y - y, 2));
}

/** Ángulo del cono visible de la portería desde (x,y), en radianes */
function angleToGoal(x: number, y: number): number {
  const dx = GOAL_X - x;
  if (dx <= 0) return 0;
  const goalLeft  = GOAL_Y - GOAL_WIDTH / 2;
  const goalRight = GOAL_Y + GOAL_WIDTH / 2;
  const a1 = Math.atan2(goalLeft  - y, dx);
  const a2 = Math.atan2(goalRight - y, dx);
  return Math.abs(a2 - a1);
}

/**
 * xG de una posición · base shot probability si el jugador disparara desde ahí.
 * Calibrado contra distribución empírica StatsBomb open data.
 *  - Penalti (11m, central):  ~0.76
 *  - Borde área (16m, central): ~0.10
 *  - Frontal a 25m centro:     ~0.04
 *  - Banda 30m:                ~0.01
 */
export function shotXg(x: number, y: number): number {
  if (x >= FIELD_LENGTH || x < 0 || y < 0 || y > FIELD_WIDTH) return 0;
  const dist = distanceToGoal(x, y);
  const angle = angleToGoal(x, y);
  if (dist < 1) return 0.95;             // sobre la línea
  // Modelo logístico sigmoideo
  const z = -3.21 + (-0.085 * dist) + (1.45 * angle);
  const xg = 1 / (1 + Math.exp(-z));
  return Math.max(0, Math.min(0.95, Math.round(xg * 1000) / 1000));
}

/**
 * Probabilidad de marcar EN LOS PRÓXIMOS 10 SEGUNDOS desde una posición
 * (no es xG de disparo · es xT-style: amenaza posicional).
 *
 * Útil para scoreProbBefore/After de acciones tipo pase/regate
 * (mover el balón a una posición de mayor amenaza es valioso aunque no sea disparo).
 *
 * Aproximación: xT decae con distancia y aumenta en pasillos centrales.
 */
export function positionalThreat(x: number, y: number): number {
  if (x >= FIELD_LENGTH || x < 0 || y < 0 || y > FIELD_WIDTH) return 0;
  const dist = distanceToGoal(x, y);
  const centralBonus = 1 - Math.abs(y - GOAL_Y) / GOAL_Y; // 1 en eje · 0 en banda
  // Amenaza máx ~0.3 a 8m central · ~0.01 a 50m
  const base = Math.exp(-dist / 18) * 0.4;
  const bonus = centralBonus * 0.05;
  return Math.max(0, Math.min(0.5, Math.round((base + bonus) * 1000) / 1000));
}

/**
 * Probabilidad de CONCEDER gol desde una posición (xT defensivo).
 * Si la acción está en zona propia profunda y se pierde, hay riesgo alto.
 * Espejo de positionalThreat respecto al campo propio.
 */
export function concedeThreat(x: number, y: number): number {
  return positionalThreat(FIELD_LENGTH - x, y);
}

/**
 * Calcula scoreProbBefore/After + concedeProbBefore/After para una acción
 * con coordenadas de origen y destino.
 *
 * type "shot": scoreProbAfter = shotXg en endX,endY.
 * Para resto: scoreProbAfter = positionalThreat(endX, endY) si éxito,
 * positionalThreat(startX, startY) si fallida (no avanza).
 */
export function enrichActionWithXg(action: {
  type: "pass" | "dribble" | "shot" | "cross" | "tackle" | "interception" | "clearance" | "foul";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  result: "success" | "fail";
}): {
  scoreProbBefore: number;
  scoreProbAfter: number;
  concedeProbBefore: number;
  concedeProbAfter: number;
} {
  const before = positionalThreat(action.startX, action.startY);
  const concedeBefore = concedeThreat(action.startX, action.startY);

  let after: number;
  let concedeAfter: number;

  if (action.type === "shot") {
    after = action.result === "success" ? 1 : shotXg(action.endX, action.endY);
    concedeAfter = concedeBefore;
  } else if (action.result === "fail") {
    // pérdida · cae a 0 ofensivamente · sube concede
    after = 0;
    concedeAfter = Math.min(0.4, concedeBefore + 0.05);
  } else {
    // éxito · llega a la zona destino
    after = positionalThreat(action.endX, action.endY);
    concedeAfter = concedeThreat(action.endX, action.endY);
  }

  return {
    scoreProbBefore:    before,
    scoreProbAfter:     after,
    concedeProbBefore:  concedeBefore,
    concedeProbAfter:   concedeAfter,
  };
}
