/**
 * VITAS · Referencia del jugador en el vídeo (dorsal + color de equipación)
 *
 * Compartido cliente + servidor (invariante #7: UNA definición de qué es una
 * referencia válida). El usuario la TECLEA por análisis en el Lab / subida de
 * vídeo; finalize la valida con estos schemas y la persiste en `analyses`
 * (mig 068); gemini-analyze y el cron la pasan a video-observation, que solo
 * puede dar al jugador por "identificado" si recibió dorsal Y color.
 *
 * Frontera legal (.claude/rules/identidad.md): la identidad del menor se
 * establece SOLO por dorsal y color de equipación. Nunca por la cara ni por
 * rasgos físicos. Este módulo no contiene nada más que esos dos datos.
 *
 * Ausencia honesta (CLAUDE.md inv. 2): campo vacío ⇒ `null`, nunca un dorsal o
 * color «más probable». Sin referencia completa, solo se analiza un clip con un
 * único jugador en plano; en un clip con varios jugadores el sistema se abstiene.
 */

import { z } from "zod";

/** Dorsal: 1 a 3 dígitos (0-999). Es un identificador, no una cifra. */
export const JERSEY_NUMBER_PATTERN = /^\d{1,3}$/;

/**
 * Color de equipación: texto corto (≤ 30), solo letras, espacios, guion y barra
 * ("rojo", "azul marino", "blanco/rojo"). El valor se interpola en el prompt de
 * video-observation → sin dígitos, signos ni saltos de línea (anti-inyección).
 */
export const KIT_COLOR_MAX_LENGTH = 30;
export const KIT_COLOR_PATTERN = /^\p{L}[\p{L} \-/]*$/u;

/**
 * Colores con nombre que ofrece la UI. `value` es lo que se ENVÍA y se persiste:
 * va en español porque el prompt de video-observation está en español (Gemini
 * compara el color que ve con este nombre). `swatch` es solo presentacional (el
 * puntito del selector), no se envía a ningún sitio. Las etiquetas visibles se
 * traducen con `playerReference.colors.<key>` (7 idiomas).
 */
export const KIT_COLORS = [
  { key: "red", value: "rojo", swatch: "#dc2626" },
  { key: "blue", value: "azul", swatch: "#2563eb" },
  { key: "navy", value: "azul marino", swatch: "#1e3a8a" },
  { key: "skyBlue", value: "celeste", swatch: "#38bdf8" },
  { key: "white", value: "blanco", swatch: "#ffffff" },
  { key: "black", value: "negro", swatch: "#111827" },
  { key: "yellow", value: "amarillo", swatch: "#facc15" },
  { key: "green", value: "verde", swatch: "#16a34a" },
  { key: "orange", value: "naranja", swatch: "#f97316" },
  { key: "purple", value: "morado", swatch: "#7c3aed" },
  { key: "maroon", value: "granate", swatch: "#7f1d1d" },
  { key: "grey", value: "gris", swatch: "#9ca3af" },
  { key: "pink", value: "rosa", swatch: "#ec4899" },
] as const;

export type KitColorKey = (typeof KIT_COLORS)[number]["key"];

export interface PlayerReference {
  jerseyNumber: string | null;
  kitColor: string | null;
}

function trimOrNull(v: unknown): unknown {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return String(v);
  if (typeof v !== "string") return v;
  // Solo se colapsan espacios repetidos: un salto de línea/tabulador interior NO se
  // «arregla» a espacio (se rechaza en el schema: el valor va a un prompt).
  const s = v.trim().replace(/ {2,}/g, " ");
  return s.length > 0 ? s : null;
}

/** Schema del dorsal (finalize). Vacío ⇒ null. Usar con `.optional()`. */
export const jerseyNumberSchema = z.preprocess(
  trimOrNull,
  z.string().regex(JERSEY_NUMBER_PATTERN, "dorsal: 1 a 3 dígitos").nullable(),
);

/** Schema del color de equipación (finalize). Vacío ⇒ null; se guarda en minúsculas. */
export const kitColorSchema = z.preprocess(
  trimOrNull,
  z
    .string()
    .max(KIT_COLOR_MAX_LENGTH, `color: máximo ${KIT_COLOR_MAX_LENGTH} caracteres`)
    .regex(KIT_COLOR_PATTERN, "color: solo letras, espacios, guion o barra")
    .transform((s) => s.toLowerCase())
    .nullable(),
);

/**
 * Normaliza lo que teclea el usuario (vacío ⇒ null). Un valor inválido también
 * queda null (no se «corrige» a un dorsal/color plausible). No inventa nada.
 */
export function normalizePlayerReference(input: {
  jerseyNumber?: unknown;
  kitColor?: unknown;
}): PlayerReference {
  const j = jerseyNumberSchema.safeParse(input.jerseyNumber ?? null);
  const c = kitColorSchema.safeParse(input.kitColor ?? null);
  return {
    jerseyNumber: j.success ? j.data : null,
    kitColor: c.success ? c.data : null,
  };
}

/** ¿El dorsal tecleado es válido (o está vacío)? Para validar el input en la UI. */
export function isValidJerseyInput(v: string): boolean {
  const s = v.trim();
  return s === "" || JERSEY_NUMBER_PATTERN.test(s);
}

/** ¿Hay referencia COMPLETA (dorsal Y color)? Solo entonces Gemini puede identificar. */
export function hasCompleteReference(ref: PlayerReference | null | undefined): boolean {
  return !!ref && ref.jerseyNumber !== null && ref.kitColor !== null;
}

/**
 * Campos del body de /api/videos/finalize. `undefined` (cliente que no envía
 * referencia, p. ej. el webhook) ⇒ `{}` y el servidor no toca lo guardado; con
 * referencia ⇒ siempre las dos claves (null si vacías), para que un re-encolado
 * pueda también BORRAR una referencia anterior.
 */
export function playerReferenceBody(
  ref: { jerseyNumber?: string | null; kitColor?: string | null } | null | undefined,
): { jerseyNumber?: string | null; kitColor?: string | null } {
  if (!ref) return {};
  const n = normalizePlayerReference(ref);
  return { jerseyNumber: n.jerseyNumber, kitColor: n.kitColor };
}

/** Busca el color con nombre por su `value` enviado (o el texto que devolvió Gemini). */
export function findKitColor(text: string | null | undefined): (typeof KIT_COLORS)[number] | null {
  if (typeof text !== "string") return null;
  const s = text.trim().toLowerCase();
  return KIT_COLORS.find((c) => c.value === s) ?? null;
}
