/**
 * VITAS · POST /api/match/step — protocolo del worker Modal (NUNCA un navegador)
 *
 * Seguridad (fail-closed):
 *   - X-Vitas-Signature = hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody)),
 *     X-Vitas-Timestamp con |now − ts| ≤ 300 s. Sin secreto → 503; firma/ts/cuerpo
 *     inválidos → 401. rawBody: se firma el cuerpo EXACTO recibido.
 *   - Sin allowServiceToken ni auth de usuario: solo la firma autentica.
 * Fencing: toda op por job lleva {jobId, epoch}; si epoch ≠ dispatch_epoch la respuesta
 * es {superseded:true} y el worker sale (un proxy_ready obsoleto: se borra ESE fichero).
 * Un replay dentro de la ventana es inocuo: toda op es idempotente (epoch + lease + CAS).
 * Cada respuesta se valida con STEP_REPLY_SCHEMAS del contrato antes de enviarse.
 */
import { withHandler } from "../_lib/withHandler";
import { errorResponse, successResponse } from "../_lib/apiResponse";
import { supabaseConfigured } from "../_lib/supabaseRest";
import { deleteFile } from "../_lib/gemini/files";
import {
  STEP_REPLY_SCHEMAS,
  STEP_SIGNATURE_HEADER,
  STEP_TIMESTAMP_HEADER,
  stepRequestSchema,
  type StepOp,
} from "../../src/lib/shared/matchJob/contract";
import { verifyStepSignature } from "../_lib/matchJob/hmac";
import { advanceJob } from "../_lib/matchJob/advance";
import { isMatchVideoEnabled } from "../_lib/matchJob/availability";
import { runTick } from "../_lib/matchJob/driver";
import {
  stepBegin,
  stepFail,
  stepHeartbeat,
  stepProxyReady,
  stepUploadSession,
  stepWhenDisabled,
  type StepOutcome,
} from "../_lib/matchJob/steps";
import { isStaleEpoch, isTerminal } from "../_lib/matchJob/stateMachine";
import * as repo from "../_lib/matchJob/repo";

function send(op: StepOp, data: unknown): Response {
  const checked = STEP_REPLY_SCHEMAS[op].safeParse(data);
  if (!checked.success) {
    console.error(`[match/step] respuesta ${op} fuera del contrato:`, checked.error.issues.slice(0, 3));
    return errorResponse({ message: "respuesta interna fuera del contrato", status: 500, code: "internal_error" });
  }
  return successResponse(checked.data);
}

function outcome(op: StepOp, o: StepOutcome): Response {
  return o.ok ? send(op, o.data) : errorResponse({ message: o.message, status: o.status, code: o.code });
}

export default withHandler(
  { method: "POST", requireAuth: false, rawBody: true, maxRequests: 600 },
  async ({ rawBody, headers }) => {
    const secret = process.env.MODAL_CALLBACK_SECRET;
    if (!secret) {
      return errorResponse({ message: "MODAL_CALLBACK_SECRET no configurado — step rechazado.", status: 503, code: "step_auth_unconfigured" });
    }
    const raw = rawBody ?? "";
    const sig = await verifyStepSignature({
      secret,
      timestamp: headers[STEP_TIMESTAMP_HEADER.toLowerCase()],
      signature: headers[STEP_SIGNATURE_HEADER.toLowerCase()],
      rawBody: raw,
    });
    if (!sig.ok) return errorResponse({ message: "Firma del step inválida", status: 401, code: "invalid_signature" });
    if (!supabaseConfigured()) return errorResponse({ message: "Supabase no configurado", status: 503, code: "no_supabase" });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return errorResponse({ message: "Body no es JSON válido", status: 400, code: "invalid_json" });
    }
    const parsed = stepRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse({ message: "Op no válida", status: 400, code: "invalid_step" });
    const req = parsed.data;

    if (req.op === "tick") return send("tick", await runTick());

    const job = await repo.getJob(req.jobId);
    if (!job) return errorResponse({ message: "Job no encontrado", status: 404, code: "job_not_found" });

    if (isStaleEpoch(req.epoch, job.dispatch_epoch)) {
      // Epoch obsoleto: el worker sale. Su fichero (si lo subió) no es el del job → se borra.
      if (req.op === "proxy_ready" && req.file.name !== job.gemini_file_name && process.env.GEMINI_API_KEY) {
        await deleteFile(req.file.name);
      }
      return send(req.op, { superseded: true });
    }

    // Heartbeat en cada op del epoch vigente (fenced: si otro despacho ganó entretanto → superseded).
    let current = job;
    if (!isTerminal(job.status)) {
      const beat = await repo.patchJob(job.id, { heartbeat_at: new Date().toISOString() }, { epoch: req.epoch });
      if (!beat) return send(req.op, { superseded: true });
      current = beat;
    }

    // Kill switch: con el análisis apagado ninguna op por job gasta (fail sigue normal).
    if (!isMatchVideoEnabled() && req.op !== "fail") {
      return outcome(req.op, await stepWhenDisabled(current, req));
    }

    switch (req.op) {
      case "begin":
        return outcome("begin", await stepBegin(current, req.epoch));
      case "heartbeat":
        return outcome("heartbeat", stepHeartbeat(current));
      case "upload_session":
        return outcome("upload_session", await stepUploadSession(current, req));
      case "proxy_ready":
        return outcome("proxy_ready", await stepProxyReady(current, req));
      case "fail":
        return outcome("fail", await stepFail(current, req));
      case "advance": {
        const r = await advanceJob(current);
        return send("advance", r.kind === "superseded" ? { superseded: true } : { state: r.state, retryAfterSec: r.retryAfterSec });
      }
    }
  },
);
