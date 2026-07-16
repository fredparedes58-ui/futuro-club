/**
 * VITAS · POST /api/webhooks/modal-tracking  (Vision V4 · fase V4.2)
 *
 * Callback que Modal invoca al terminar un tracking async (run_track_and_callback).
 * Payload:
 *   { "job_id": "<uuid>", "status": "done"|"failed", "result"?: {...}, "error"?: "..." }
 *
 * Seguridad (review V4, fail-closed):
 *   - X-Vitas-Signature = HMAC-SHA256(MODAL_CALLBACK_SECRET, rawBody) — firma el
 *     CONTENIDO (patrón bunny-uploaded), no un token estático por job: una firma
 *     observada no puede re-adjuntarse a un payload forjado.
 *   - Modal firma con su propia copia del secret (Modal secret, fase V4.3).
 *   - Sin MODAL_CALLBACK_SECRET → 503 (nunca fail-open: este endpoint escribe
 *     resultados con service role).
 *
 * Escritura ATÓMICA: PATCH condicional `status=in.(queued,processing)` con
 * return=representation — un retry tardío no puede pisar un resultado final
 * (TOCTOU de la review), y el caso "ya finalizado vs no existe" se resuelve con
 * un SELECT solo en esa rama rara.
 *
 * Estados desconocidos (heartbeat/progress futuros) → 200 {ignored:true}, jamás
 * finalizan el job.
 *
 * Gotcha edge: con rawBody:true hay que leer ctx.rawBody — NUNCA req.json()
 * (doble consumo del stream; bug ya visto en rag/_ingest).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hmacSha256Hex, timingSafeEqual } from "../_lib/edgeCrypto";
import { supabaseConfigured, serviceHeaders, trackingJobUrl } from "../_lib/supabaseRest";

export const config = { runtime: "edge" };

interface CallbackPayload {
  job_id?: string;
  status?: string;
  result?: unknown;
  error?: string;
}

export default withHandler(
  { method: ["POST"], requireAuth: false, rawBody: true, maxRequests: 200 },
  async ({ rawBody, headers }) => {
    const secret = process.env.MODAL_CALLBACK_SECRET;
    if (!secret) {
      // Fail-closed: sin secret no hay autenticidad posible para una escritura
      // service-role. (track-async también 503-ea sin esta var → coherente.)
      return errorResponse({
        code: "callback_auth_unconfigured",
        message: "MODAL_CALLBACK_SECRET no configurado — callback rechazado.",
        status: 503,
      });
    }
    if (!supabaseConfigured()) {
      return errorResponse({ code: "no_supabase", message: "Supabase no configurado", status: 503 });
    }

    // ── Verificar firma del CONTENIDO (tiempo constante) ─────────────────
    const signature = (headers["x-vitas-signature"] ?? "").toLowerCase();
    const expected = (await hmacSha256Hex(secret, rawBody ?? "")).toLowerCase();
    if (!timingSafeEqual(signature, expected)) {
      return errorResponse({
        code: "invalid_signature",
        message: "Firma del callback inválida",
        status: 401,
      });
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

    // ── Clasificar el callback ────────────────────────────────────────────
    // Solo 'done' y 'failed' son terminales; cualquier otro estado (heartbeat,
    // progress de un Modal futuro) se acepta sin efecto.
    let patch: Record<string, unknown>;
    if (payload.status === "done") {
      if (payload.result === undefined || payload.result === null) {
        // done sin resultado = fallo real del contrato → terminal failed
        patch = {
          status: "failed",
          error: "Callback 'done' sin result",
          finished_at: new Date().toISOString(),
        };
      } else {
        patch = { status: "done", result: payload.result, finished_at: new Date().toISOString() };
      }
    } else if (payload.status === "failed") {
      patch = {
        status: "failed",
        error: (payload.error ?? "Modal reported failure").slice(0, 1000),
        finished_at: new Date().toISOString(),
      };
    } else {
      return successResponse({ jobId, ignored: true, reason: `status "${payload.status}" no terminal` });
    }

    // ── Escritura atómica condicional (solo si el job sigue vivo) ─────────
    const upd = await fetch(trackingJobUrl(jobId, "&status=in.(queued,processing)"), {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=representation" }),
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
    const updated = (await upd.json().catch(() => [])) as Array<{ id: string }>;
    if (updated.length > 0) {
      return successResponse({ jobId, status: patch.status });
    }

    // Rama rara: nada actualizado → o el job ya estaba finalizado (idempotente,
    // Modal reintenta) o no existe. Un SELECT barato lo distingue.
    const look = await fetch(trackingJobUrl(jobId, "&select=id,status&limit=1"), {
      headers: serviceHeaders(),
    });
    const rows = look.ok
      ? ((await look.json().catch(() => [])) as Array<{ id: string; status: string }>)
      : [];
    if (!rows.length) {
      return errorResponse({ code: "job_not_found", message: `Job ${jobId} no existe`, status: 404 });
    }
    return successResponse({ jobId, status: rows[0].status, idempotent: true });
  },
);
