/**
 * VITAS · API Request Validator
 *
 * Helper compartido para validar request bodies con Zod en endpoints Vercel.
 * Retorna un error 400 estructurado si la validación falla.
 */

import { z } from "zod";

export interface ValidationError {
  success: false;
  error: string;
  details: Array<{ path: string; message: string }>;
}

/**
 * Valida un body contra un schema Zod.
 * Retorna { success: true, data } si válido, o { success: false, error, details } si no.
 */
export function validateBody<T extends z.ZodSchema>(
  body: unknown,
  schema: T
): { success: true; data: z.infer<T> } | ValidationError {
  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      success: false,
      error: "Datos de entrada inválidos",
      details: result.error.errors.map(e => ({
        path: e.path.join("."),
        message: e.message,
      })),
    };
  }

  return { success: true, data: result.data };
}
