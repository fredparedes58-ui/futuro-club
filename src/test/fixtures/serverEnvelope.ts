/**
 * The error envelope the REAL server sends: a mirror of `errorResponse` in
 * api/_lib/apiResponse.ts (`{ ok:false, success:false, error, errorDetail:{ ...details, message, code } }`).
 *
 * It is a mirror, not an import, because api/_lib/apiResponse.ts reads `process`
 * and the app tsconfig (which type-checks src/test) has no Node types. The mirror
 * cannot drift silently: api/_lib/__tests__/serverEnvelopeFixture.test.ts asserts
 * it produces exactly the same status and body as the real `errorResponse`.
 *
 * No imports on purpose (the api test suite has no "@/" alias).
 */

export interface ServerErrorOpts {
  message: string;
  status: number;
  code?: string;
  details?: Record<string, unknown>;
}

/** Body + status of a server error, exactly as `errorResponse` builds them. */
export function serverErrorResponse(opts: ServerErrorOpts): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      success: false,
      error: opts.message,
      errorDetail: { ...(opts.details ?? {}), message: opts.message, code: opts.code },
    }),
    { status: opts.status, headers: { "Content-Type": "application/json" } },
  );
}

/** The replies the match endpoints and withHandler actually send (api/match/_status.ts, api/_lib/withHandler.ts). */
export const REAL_SERVER_ERRORS = {
  jobNotFound: { message: "Análisis no encontrado", status: 404, code: "job_not_found" },
  unauthorized: { message: "No autenticado", status: 401, code: "UNAUTHORIZED" },
  forbidden: { message: "Acceso denegado", status: 403, code: "FORBIDDEN" },
  invalidInput: { message: "jobId inválido", status: 400, code: "invalid_input" },
  rateLimited: { message: "Rate limit exceeded", status: 429, code: "RATE_LIMITED" },
  internal: { message: "boom", status: 500, code: "INTERNAL_ERROR" },
} as const satisfies Record<string, ServerErrorOpts>;
