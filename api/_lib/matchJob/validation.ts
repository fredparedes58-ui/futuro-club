/**
 * VITAS · Match job — puntuación PURA de la observación de Gemini contra ground truth humano
 *
 * Lo usa el arnés del operador (scripts/validate-match-observation.mjs). El análisis de
 * partido completo queda APAGADO (MATCH_VIDEO_ENABLED) hasta que esto pase con clips
 * reales anotados a mano (fixtures/partido/<clip>/eventos.json).
 *
 * Reglas (fixtures/README.md, .claude/rules/identidad.md):
 *   - Las anotaciones son de una PERSONA y son EVALUACIÓN, nunca entrenamiento: ningún
 *     umbral ni prompt se ajusta mirando un clip concreto.
 *   - Emparejamiento uno a uno: una evidencia casa con un evento anotado si coinciden
 *     categoría y equipo y el instante anotado cae en [t_start − tol, t_end + tol]. Cada
 *     evento anotado cuenta una vez (greedy por menor distancia, desempate determinista).
 *   - Una evidencia con team "ambiguous" nunca casa con un evento de equipo (modo
 *     estricto, el que decide); el modo agnóstico se imprime solo como diagnóstico.
 *   - Precisión = aciertos / evidencias citadas; exhaustividad = aciertos / anotados.
 *     Sin evidencias en una categoría, su precisión es null (no 0 ni 1); sin anotados,
 *     su exhaustividad es null. Un null no aprueba ni suspende por sí solo.
 * Nada de esto se muestra al usuario como cifra de precisión (CLAUDE.md): es un gate de
 * activación para el operador.
 */
import { z } from "zod";
import { EVIDENCE_CATEGORIES, EVIDENCE_TEAMS } from "../../../src/lib/shared/matchJob/contract";

export const annotatedEventSchema = z
  .object({
    /** Segundo del CLIP (tiempo de vídeo del fichero evaluado). */
    t: z.number().finite().nonnegative(),
    team: z.enum(["home", "away"]),
    category: z.enum(EVIDENCE_CATEGORIES),
  })
  .strict();
export type AnnotatedEvent = z.infer<typeof annotatedEventSchema>;

/** fixtures/partido/<clip>/eventos.json: un array plano, al menos un evento. */
export const annotatedEventsFileSchema = z.array(annotatedEventSchema).min(1);

export interface PredictedEvidence {
  t_start: number;
  t_end: number;
  team: (typeof EVIDENCE_TEAMS)[number];
  category: (typeof EVIDENCE_CATEGORIES)[number];
}

export interface CategoryScore {
  category: string;
  annotated: number;
  predicted: number;
  matched: number;
  precision: number | null;
  recall: number | null;
}

export interface ScoreResult {
  byCategory: CategoryScore[];
  overall: CategoryScore;
  /** Diagnóstico: mismo cálculo ignorando el equipo (no decide el gate). */
  overallTeamAgnostic: CategoryScore;
  matches: { evidenceIdx: number; eventIdx: number; distanceSec: number }[];
  /** Eventos anotados fuera de las ventanas evaluadas (no cuentan). */
  eventsOutsideWindows: number;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** 0 si el instante cae dentro de [t_start, t_end]; si no, distancia al borde más cercano. */
function distance(e: PredictedEvidence, t: number): number {
  if (t < e.t_start) return e.t_start - t;
  if (t > e.t_end) return t - e.t_end;
  return 0;
}

function greedyMatch(
  evidence: readonly PredictedEvidence[],
  events: readonly AnnotatedEvent[],
  toleranceSec: number,
  strictTeam: boolean,
): { evidenceIdx: number; eventIdx: number; distanceSec: number }[] {
  const pairs: { evidenceIdx: number; eventIdx: number; distanceSec: number }[] = [];
  evidence.forEach((e, i) => {
    events.forEach((a, j) => {
      if (e.category !== a.category) return;
      if (strictTeam && e.team !== a.team) return;
      const d = distance(e, a.t);
      if (d <= toleranceSec) pairs.push({ evidenceIdx: i, eventIdx: j, distanceSec: d });
    });
  });
  pairs.sort((x, y) => x.distanceSec - y.distanceSec || x.eventIdx - y.eventIdx || x.evidenceIdx - y.evidenceIdx);
  const usedE = new Set<number>();
  const usedA = new Set<number>();
  const out: typeof pairs = [];
  for (const p of pairs) {
    if (usedE.has(p.evidenceIdx) || usedA.has(p.eventIdx)) continue;
    usedE.add(p.evidenceIdx);
    usedA.add(p.eventIdx);
    out.push(p);
  }
  return out;
}

function score(
  category: string,
  evidence: readonly PredictedEvidence[],
  events: readonly AnnotatedEvent[],
  matched: number,
): CategoryScore {
  return {
    category,
    annotated: events.length,
    predicted: evidence.length,
    matched,
    precision: ratio(matched, evidence.length),
    recall: ratio(matched, events.length),
  };
}

/**
 * Puntúa las evidencias (ya normalizadas: tiempo de vídeo absoluto, guarda de identidad
 * aplicada) contra los eventos anotados dentro de las ventanas evaluadas.
 */
export function scoreObservation(opts: {
  evidence: readonly PredictedEvidence[];
  events: readonly AnnotatedEvent[];
  toleranceSec: number;
  /** Tramos realmente evaluados; los eventos fuera de ellos no cuentan. */
  windows: readonly { start_sec: number; end_sec: number }[];
}): ScoreResult {
  const inWindow = (t: number) => opts.windows.some((w) => t >= w.start_sec && t <= w.end_sec);
  const events = opts.events.filter((e) => inWindow(e.t));
  const evidence = [...opts.evidence];
  const strict = greedyMatch(evidence, events, opts.toleranceSec, true);
  const agnostic = greedyMatch(evidence, events, opts.toleranceSec, false);

  const byCategory = EVIDENCE_CATEGORIES.map((c) => {
    const ev = evidence.filter((e) => e.category === c);
    const an = events.filter((a) => a.category === c);
    const m = strict.filter((p) => evidence[p.evidenceIdx].category === c).length;
    return score(c, ev, an, m);
  }).filter((s) => s.annotated > 0 || s.predicted > 0);

  return {
    byCategory,
    overall: score("overall", evidence, events, strict.length),
    overallTeamAgnostic: score("overall_team_agnostic", evidence, events, agnostic.length),
    matches: strict,
    eventsOutsideWindows: opts.events.length - events.length,
  };
}

export interface ThresholdFailure {
  category: string;
  metric: "precision" | "recall";
  value: number;
  threshold: number;
}

/**
 * Gate de activación: cada categoría (y el total) con precisión o exhaustividad por
 * debajo del umbral de config SUSPENDE. Sin ningún evento anotado en las ventanas no hay
 * nada que evaluar → suspende (no es un aprobado).
 */
export function evaluateThresholds(
  result: ScoreResult,
  thresholds: { minPrecision: number; minRecall: number },
): { pass: boolean; failures: ThresholdFailure[]; reason: string | null } {
  if (result.overall.annotated === 0) {
    return { pass: false, failures: [], reason: "ningún evento anotado dentro de los tramos evaluados" };
  }
  const failures: ThresholdFailure[] = [];
  for (const s of [...result.byCategory, result.overall]) {
    if (s.precision !== null && s.precision < thresholds.minPrecision) {
      failures.push({ category: s.category, metric: "precision", value: s.precision, threshold: thresholds.minPrecision });
    }
    if (s.recall !== null && s.recall < thresholds.minRecall) {
      failures.push({ category: s.category, metric: "recall", value: s.recall, threshold: thresholds.minRecall });
    }
  }
  return { pass: failures.length === 0, failures, reason: failures.length ? "umbrales no alcanzados" : null };
}

/**
 * Diagnóstico de plantilla: fracción de evidencias cuyo t_start es múltiplo exacto de
 * `stepSec` (el spike del 2026-09-29 devolvió eventos en pasos de ~10 s). No decide el
 * gate; un valor alto es una señal de fabricación que el operador debe mirar.
 */
export function regularStepShare(evidence: readonly PredictedEvidence[], stepSec: number): number | null {
  if (evidence.length === 0 || !(stepSec > 0)) return null;
  return evidence.filter((e) => e.t_start % stepSec === 0).length / evidence.length;
}
