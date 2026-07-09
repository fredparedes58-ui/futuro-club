/**
 * VITAS · Edad cronológica decimal
 *
 * Los métodos de maduración (Mirwald, Khamis-Roche) exigen la edad cronológica
 * DECIMAL en la fecha de medición (p.ej. 13.7), no un entero redondeado — un
 * error de ±0.5 años puede cruzar el umbral de timing precoz/tardío. Este
 * helper deriva la edad exacta desde la fecha de nacimiento cuando existe, y
 * cae al entero `age` almacenado como respaldo.
 *
 * Edge-safe: importable desde api/ y src/.
 */

const DAYS_PER_YEAR = 365.2425; // año medio gregoriano

/**
 * Edad decimal (años) entre birthDate y la fecha `at` (por defecto, hoy).
 * Devuelve null si la fecha de nacimiento no es válida o es futura.
 */
export function decimalAgeYears(
  birthDate: string | null | undefined,
  at?: string | Date,
): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const ref = at ? new Date(at) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  const years = (ref.getTime() - birth.getTime()) / (DAYS_PER_YEAR * 24 * 60 * 60 * 1000);
  if (years < 0) return null; // fecha futura → dato inválido, no lo usamos
  return Number(years.toFixed(2));
}

/**
 * Edad cronológica preferida para cálculos de maduración: decimal desde
 * birthDate si está disponible, si no el entero `age` almacenado.
 */
export function resolveChronologicalAge(
  player: { birthDate?: string | null; age?: number | null },
  at?: string | Date,
): number | null {
  const fromBirth = decimalAgeYears(player.birthDate, at);
  if (fromBirth !== null) return fromBirth;
  return typeof player.age === "number" && Number.isFinite(player.age) ? player.age : null;
}
