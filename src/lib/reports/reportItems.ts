/**
 * VITAS · Coerción segura de campos de informe generados por LLM.
 *
 * El contenido de los reportes (`reports.content`) es salida de un LLM y NO está
 * validado contra esquema en tiempo de render. Dos formas de fallo reales tumbaban
 * la vista de "informe completo" (error boundary "Algo salió mal"):
 *   A) `.map()` sobre un campo que se espera array pero llega como string — un
 *      guard por `.length > 0` lo deja pasar y `.map` lanza "X.map is not a function".
 *   B) `.title` sobre un elemento `null` dentro del array — `typeof null === "object"`
 *      se cuela por los checks `typeof x === "string"` y `null.title` lanza.
 *
 * Estas dos funciones son la única forma de leer esos campos. No inventan datos:
 * ante algo no-array devuelven [] y ante un item sin título devuelven "".
 */

/** Devuelve el valor si es array; si no (string, null, objeto…), []. */
export function asItemArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Título mostrable de un item que puede ser string, `{ title }`, null u otra cosa. */
export function itemTitle(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const t = (v as { title?: unknown }).title;
    if (typeof t === "string") return t;
  }
  return "";
}

/**
 * Desenvuelve el content del reporte `dna-profile`.
 *
 * A diferencia del resto de agentes (clave `report` → content PLANO), el agente
 * `_dna-profile.ts` emite bajo la clave `dna`, así que el pipeline persiste el
 * content DOBLEMENTE ENVUELTO: `{ ok, success, data: { playerId, …, dna: {…} } }`.
 * Leer `content.primary_style` directamente da siempre `undefined` (por eso el
 * panel legacy mostraba defaults). Esta función tolera las 3 formas —envuelto,
 * `{ dna }`, u objeto ADN directo— y devuelve el objeto con los campos REALES del
 * agente (primary_style, natural_role, pressure_behavior…). No inventa datos: si
 * no hay envoltorio reconocible devuelve el propio objeto (o `{}` si no es objeto).
 */
export function unwrapDnaContent(content: unknown): Record<string, unknown> {
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const root = content as Record<string, unknown>;
  const dataLevel =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const dna =
    dataLevel.dna && typeof dataLevel.dna === "object" && !Array.isArray(dataLevel.dna)
      ? (dataLevel.dna as Record<string, unknown>)
      : dataLevel;
  return dna;
}
