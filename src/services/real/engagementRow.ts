/**
 * VITAS · Engagement row mapper (single source of truth for the DB contract)
 *
 * `engagement_snapshots` se escribe/lee desde DOS servicios (wellbeingService y
 * localStorageMigrationService) y se lee desde el endpoint de dropout-risk. Cuando
 * cada uno mapea sus propias columnas, divergen: los writers escribían
 * `physical_engagement`/`engagement_score` (columnas INEXISTENTES) mientras la
 * migración 046 define `physical`/`composite` → el upsert fallaba en silencio y el
 * engagement no se persistía nunca. Este módulo centraliza el mapeo dominio↔fila
 * para que exista UNA sola implementación (invariante #7) y un test la fije contra
 * la migración.
 *
 * Contrato de columnas — DEBE coincidir con
 * supabase/migrations/046_wellbeing_burnout.sql (tabla engagement_snapshots).
 * Un rename aquí sin su migración correspondiente es exactamente el bug que este
 * módulo existe para impedir.
 *
 * El tipo de entrada es estructural a propósito: existen dos interfaces
 * `EngagementSnapshot` divergentes en el repo (la local de wellbeingService con
 * `id` y sin trend/weeklyAvg, y la de sessionTypes con trend/weeklyAvg y sin `id`).
 * Ambas son asignables a `EngagementSnapshotLike`, así que el mapper no se acopla a
 * ninguna.
 */

/** Columnas reales de engagement_snapshots (migración 046). */
export const ENGAGEMENT_DB_COLUMNS = [
  "id",
  "player_id",
  "session_id",
  "date",
  "physical",
  "social",
  "emotional",
  "composite",
  "trend",
  "weekly_avg",
] as const;

export type EngagementTrend = "rising" | "stable" | "declining";

/** Forma mínima que cualquier `EngagementSnapshot` del repo satisface. */
export interface EngagementSnapshotLike {
  id?: string;
  playerId: string;
  sessionId?: string;
  date: string;
  physicalEngagement: number;
  socialEngagement: number;
  emotionalEngagement: number;
  engagementScore: number;
  engagementTrend?: EngagementTrend;
  weeklyAvg?: number;
}

export interface EngagementRow {
  id?: string;
  player_id: string;
  session_id: string | null;
  date: string;
  physical: number;
  social: number;
  emotional: number;
  composite: number;
  trend: string;
  weekly_avg: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0;

/**
 * Dominio → fila de BD. Solo emite claves que existen en la migración.
 * `id`/`session_id` son columnas UUID: se escriben solo si son UUID válidos, de lo
 * contrario `id` se omite (DB genera con gen_random_uuid()) y `session_id` va a null
 * (columna nullable). Escribir un no-UUID en una columna UUID rompería el upsert.
 */
export function engagementSnapshotToRow(s: EngagementSnapshotLike): EngagementRow {
  return {
    id: isUuid(s.id) ? s.id : undefined,
    player_id: s.playerId,
    session_id: isUuid(s.sessionId) ? s.sessionId : null,
    date: s.date,
    physical: num(s.physicalEngagement),
    social: num(s.socialEngagement),
    emotional: num(s.emotionalEngagement),
    composite: num(s.engagementScore),
    trend: s.engagementTrend ?? "stable",
    weekly_avg: num(s.weeklyAvg),
  };
}

/**
 * Fila de BD → dominio. Lee solo columnas de la migración. Un `composite`/`physical`
 * ausente cae a 0 (NOTA: 0 puede significar "no medido" por el DEFAULT 0 de la
 * columna; la puerta de honestidad de quien consuma —p. ej. el endpoint de
 * dropout-risk con su guarda composite > 0— es responsable de no tratar ese 0 como
 * señal real).
 */
export function rowToEngagementSnapshot(
  r: Record<string, unknown>,
): Required<EngagementSnapshotLike> {
  const trend: EngagementTrend =
    r.trend === "rising" || r.trend === "declining" ? r.trend : "stable";
  return {
    id: r.id != null ? String(r.id) : "",
    playerId: r.player_id != null ? String(r.player_id) : "",
    sessionId: r.session_id != null ? String(r.session_id) : "",
    date: r.date != null ? String(r.date) : "",
    physicalEngagement: num(r.physical),
    socialEngagement: num(r.social),
    emotionalEngagement: num(r.emotional),
    engagementScore: num(r.composite),
    engagementTrend: trend,
    weeklyAvg: num(r.weekly_avg),
  };
}
