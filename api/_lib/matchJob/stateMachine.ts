/**
 * VITAS · Match job — máquina de estados (solo transiciones legales)
 *
 * La TABLA vive en el contrato (MATCH_JOB_TRANSITIONS); aquí solo se hace cumplir.
 * Cualquier otra transición LANZA. El re-despacho (epoch++) es ortogonal a la tabla:
 * `redispatchTarget` dice a qué estado vuelve un job cuyo worker se da por muerto.
 */
import {
  MATCH_JOB_TRANSITIONS,
  REDISPATCHABLE_MATCH_JOB_STATUSES,
  TERMINAL_MATCH_JOB_STATUSES,
  type MatchJobStatus,
} from "../../../src/lib/shared/matchJob/contract";

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: MatchJobStatus,
    readonly to: MatchJobStatus,
  ) {
    super(`transición ilegal ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(from: MatchJobStatus, to: MatchJobStatus): boolean {
  return MATCH_JOB_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MatchJobStatus, to: MatchJobStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(status: MatchJobStatus): boolean {
  return (TERMINAL_MATCH_JOB_STATUSES as readonly MatchJobStatus[]).includes(status);
}

/** Estados no terminales (los que cuentan para concurrencia y reservas). */
export const ACTIVE_MATCH_JOB_STATUSES: readonly MatchJobStatus[] = (
  Object.keys(MATCH_JOB_TRANSITIONS) as MatchJobStatus[]
).filter((s) => !isTerminal(s));

/**
 * Estado tras re-despachar un epoch caducado (contrato, comentario de MATCH_JOB_TRANSITIONS):
 *   - preparing | uploading → dispatched (se rehace el transcode);
 *   - gemini_processing | observing → dispatched SOLO si el fichero Gemini caducó o se
 *     perdió (los tramos hechos se conservan y no se refacturan); si sigue ACTIVE, igual;
 *   - dispatched | aggregating | reporting → igual.
 * null ⇒ no re-despachable (awaiting_encode o terminal).
 */
export function redispatchTarget(status: MatchJobStatus, geminiFileUsable: boolean): MatchJobStatus | null {
  if (!(REDISPATCHABLE_MATCH_JOB_STATUSES as readonly MatchJobStatus[]).includes(status)) return null;
  if (status === "preparing" || status === "uploading") return "dispatched";
  if (status === "gemini_processing" || status === "observing") return geminiFileUsable ? status : "dispatched";
  return status;
}

/** Fencing: toda op por job lleva el epoch; si no es el vigente, la respuesta es `superseded`. */
export function isStaleEpoch(requestEpoch: number, jobEpoch: number): boolean {
  return requestEpoch !== jobEpoch;
}
