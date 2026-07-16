/**
 * VITAS · POST /api/webhooks/modal-tracking  (Vision V4 · fase V4.2)
 *
 * Callback que Modal invoca al terminar un tracking async (run_track_and_callback).
 * Payload esperado:
 *   { "job_id": "<uuid>", "status": "done"|"failed", "result"?: {...}, "error"?: "..." }
 *
 * Seguridad: header X-Vitas-Signature = HMAC-SHA256(MODAL_CALLBACK_SECRET, job_id),
 * emitido por track-async al hacer el spawn y reenviado por Modal tal cual.
 * Verificación en tiempo constante (patrón bunny-uploaded). Sin secret → modo dev
 * (se acepta, con warning).
 *
 * Gotcha edge: con rawBody:true hay que leer ctx.rawBody — NUNCA req.json()
 * (doble consumo del stream → "Invalid JSON"; bug ya visto en rag/_ingest).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hmacSha256Hex, timingSafeEqual } from "../_lib/edgeCrypto";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CALLBACK_SECRET = process.env.MODAL_CALLBACK_SECRET ?? "";

interface CallbackPayload {
  job_id?: string;
  status?: string;
  result?: unknown;
  error?: string;
}

function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export default withHandler(
  { method: ["POST"], requireAuth: false, rawBody: true, maxRequests: 200 },
  async ({ rawBody, headers }) => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse({ code: "no_supabase", message: "Supabase no configurado", status: 503 });
    }

    // ── Parse (rawBody, ver gotcha en cabecera) ──────────────────────────
    let payload: CallbackPayload;
    try {
      payload = JSON.parse(rawBody ?? "") as CallbackPayload;
    } catch {
      return errorResponse({ code: "invalid_json", message: "Body no es JSON válido", status: 400 });
    }
    const jobId = payload.job_id;
    if (!jobId || typeof jobId !== "string") {
      return errorResponse({ code: "missing_fields", message: "job_id requerido", status: 400 });
    }

    // ── Verificar firma (HMAC del job_id, tiempo constante) ──────────────
    if (CALLBACK_SECRET) {
      const signature = headers?.["x-vitas-signature"] ?? "";
      const expected = await hmacSha256Hex(CALLBACK_SECRET, jobId);
      if (!signature || !timingSafeEqual(signature.toLowerCase(), expected.toLowerCase())) {
        return errorResponse({
          code: "invalid_signature",
          message: "Firma del callback inválida",
          status: 401,
        });
      }
    } else {
      console.warn("[modal-tracking] MODAL_CALLBACK_SECRET no configurado · firma no verificada (dev)");
    }

    // ── Confirmar que el job existe ───────────────────────────────────────
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/tracking_jobs?id=eq.${jobId}&select=id,status&limit=1`,
      { headers: sbHeaders() },
    );
    if (!lookup.ok) {
      const t = await lookup.text().catch(() => "");
      return errorResponse({
        code: "lookup_failed",
        message: `Supabase: ${lookup.status} ${t.slice(0, 200)}`,
        status: 500,
      });
    }
    const rows = (await lookup.json()) as Array<{ id: string; status: string }>;
    if (!rows.length) {
      return errorResponse({ code: "job_not_found", message: `Job ${jobId} no existe`, status: 404 });
    }
    // Idempotencia: si ya está finalizado, aceptar sin re-escribir (Modal puede reintentar).
    if (rows[0].status === "done" || rows[0].status === "failed") {
      return successResponse({ jobId, status: rows[0].status, idempotent: true });
    }

    // ── Escribir resultado ────────────────────────────────────────────────
    const ok = payload.status === "done" && payload.result !== undefined;
    const patch = ok
      ? { status: "done", result: payload.result, finished_at: new Date().toISOString() }
      : {
          status: "failed",
          error: (payload.error ?? "Modal reported failure").slice(0, 1000),
          finished_at: new Date().toISOString(),
        };

    const upd = await fetch(`${SUPABASE_URL}/rest/v1/tracking_jobs?id=eq.${jobId}`, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify(patch),
    });
    if (!upd.ok) {
      const t = await upd.text().catch(() => "");
      return errorResponse({
        code: "update_failed",
        message: `Supabase: ${upd.status} ${t.slice(0, 200)}`,
        status: 500,
      });
    }

    return successResponse({ jobId, status: patch.status });
  },
);
