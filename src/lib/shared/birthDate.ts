/**
 * VITAS · Fecha de nacimiento del JUGADOR → columna `players.birth_date`
 *
 * La fecha de nacimiento del jugador vive en el blob `players.data->>'birthDate'`
 * (la edita la ficha del jugador). La columna `players.birth_date` (migración 036)
 * es la que lee el control RGPD de consentimiento parental (trigger
 * `trg_check_parental_consent` + /admin/consent). Esta función es la ÚNICA
 * proyección blob → columna (invariante #7): la usan todos los escritores de
 * `players` (cliente y api/) y la replica, regla a regla, la migración 071.
 *
 * Regla (idéntica a 071):
 *   - solo `YYYY-MM-DD` exacto (lo que emite `<input type="date">`);
 *   - fecha de calendario real (nada de 2014-02-30);
 *   - estrictamente ANTERIOR a hoy (una fecha futura o de hoy no es un nacimiento);
 *   - no anterior a 1900-01-01 (cota de cordura de dato, no un umbral de métrica:
 *     un año mal tecleado como 0214 convertiría a un niño en «adulto» y lo sacaría
 *     del control de consentimiento).
 * Cualquier otra cosa ⇒ `null`. NUNCA se inventa ni se «arregla» una fecha.
 *
 * Edge-safe: sin dependencias, importable desde api/ y src/.
 */

const ISO_DATE_RE = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/; // idéntica en 071
/** Cota inferior de cordura (inclusive). Ver cabecera. */
export const BIRTH_DATE_MIN_ISO = "1900-01-01";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Fecha local de `now` como `YYYY-MM-DD` (hoy en el dispositivo). */
export function localIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month1to12) ? 30 : 31;
}

/**
 * Normaliza la fecha de nacimiento del jugador para la columna `birth_date`.
 * Devuelve `YYYY-MM-DD` si es una fecha real, pasada y plausible; si no, `null`.
 */
export function toIsoBirthDate(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== "string") return null;
  const s = raw; // sin trim: la migración 071 tampoco recorta (misma regla exacta)
  const m = ISO_DATE_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  // Comparación lexicográfica válida: ambos son YYYY-MM-DD con ceros a la izquierda.
  if (s < BIRTH_DATE_MIN_ISO) return null;
  if (s >= localIsoDate(now)) return null;
  return s;
}
