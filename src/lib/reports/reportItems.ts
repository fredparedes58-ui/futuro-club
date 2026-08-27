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
