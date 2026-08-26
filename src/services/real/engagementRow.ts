/**
 * VITAS · Engagement row mapper (mapper ÚNICO del contrato de columnas)
 *
 * Traduce entre el `EngagementSnapshot` de la app (camelCase) y la fila real de
 * la tabla Supabase `engagement_snapshots`. Es el ÚNICO sitio que conoce los
 * nombres de columna de esa tabla — ningún servicio debe volver a escribir
 * `player_id`/`composite`/… sueltos (invariante: una sola implementación por
 * concepto).
 *
 * IMPORTANTE — el contrato real de columnas (supabase/migrations/046):
 *   player_id · session_id · date · physical · social · emotional · composite ·
 *   trend · weekly_avg
 *
 * El código previo escribía `physical_engagement`/`social_engagement`/
 * `emotional_engagement`/`engagement_score`, que NO existen en la tabla → todo
 * upsert a Supabase era rechazado (columna inexistente) y solo persistía en
 * localStorage. Este mapper corrige ese contrato.
 */

import type { EngagementSnapshot } from "./wellbeingService";

/** Forma de fila de `engagement_snapshots` tal como la espera PostgREST. */
export interface EngagementRow {
  id?: string;
  player_id: string;
  session_id: string | null;
  date: string;
  physical: number;
  social: number;
  emotional: number;
  composite: number;
}

/** Un id de Supabase es UUID (36 chars). Un id de cliente (`eng_…`) no lo es y
 *  debe omitirse en el insert para que la BD genere el UUID. */
function uuidOrUndefined(id: string | undefined): string | undefined {
  return id && id.length === 36 ? id : undefined;
}

/** `session_id` es UUID nullable: un id no-UUID (p. ej. `session-0` de un mock)
 *  se guarda como null en vez de romper el insert. */
function uuidOrNull(value: string | undefined): string | null {
  return value && value.length === 36 ? value : null;
}

/** App → fila BD. El `id` solo se incluye si ya es un UUID (upsert real). */
export function toEngagementRow(snapshot: EngagementSnapshot): EngagementRow {
  return {
    id: uuidOrUndefined(snapshot.id),
    player_id: snapshot.playerId,
    session_id: uuidOrNull(snapshot.sessionId),
    date: snapshot.date,
    physical: snapshot.physicalEngagement,
    social: snapshot.socialEngagement,
    emotional: snapshot.emotionalEngagement,
    composite: snapshot.engagementScore,
  };
}

/** Fila BD → App. Tolera nulos de la BD (defaults 0) sin inventar señal. */
export function fromEngagementRow(row: Record<string, unknown>): EngagementSnapshot {
  return {
    id: String(row.id),
    playerId: String(row.player_id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    date: String(row.date),
    physicalEngagement: Number(row.physical ?? 0),
    socialEngagement: Number(row.social ?? 0),
    emotionalEngagement: Number(row.emotional ?? 0),
    engagementScore: Number(row.composite ?? 0),
  };
}
