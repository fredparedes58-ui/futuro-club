/**
 * VITAS · Match job — despacho Vercel → Modal (`match_start` del worker vitas-match-worker)
 *
 * POST MODAL_MATCH_START_URL · Authorization: Bearer <MODAL_API_KEY> · {jobId, epoch}.
 * Se PARSEA la respuesta con el contrato: solo `{status:"spawned", call_id}` es éxito.
 * `{status:"error"}`, un 2xx sin call_id, HTML, timeout… = FALLO (se cuenta el intento y
 * NO se registra gasto). Arregla el patrón zombi de api/coaching/_track-async.ts, que
 * daba por lanzado cualquier 2xx.
 * El worker toma la URL de step de SU secret (VITAS_MATCH_STEP_URL), nunca de aquí.
 */
import { matchDispatchReplySchema } from "../../../src/lib/shared/matchJob/contract";

const DISPATCH_TIMEOUT_MS = 20_000;

export type SpawnResult = { ok: true; callId: string } | { ok: false; reason: string };

export async function spawnMatchWorker(opts: { jobId: string; epoch: number; timeoutMs?: number }): Promise<SpawnResult> {
  const endpoint = process.env.MODAL_MATCH_START_URL;
  const apiKey = process.env.MODAL_API_KEY;
  if (!endpoint || !apiKey) return { ok: false, reason: "modal_not_configured" };
  let target: URL;
  try {
    target = new URL(endpoint);
  } catch {
    return { ok: false, reason: "modal_url_invalid" };
  }
  if (target.protocol !== "https:") return { ok: false, reason: "modal_url_not_https" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetch(target.href, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ jobId: opts.jobId, epoch: opts.epoch }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: "reply_not_json" };
    }
    const parsed = matchDispatchReplySchema.safeParse(json);
    if (!parsed.success) return { ok: false, reason: "reply_without_call_id" };
    if (parsed.data.status === "error") return { ok: false, reason: `worker_error:${parsed.data.reason.slice(0, 120)}` };
    return { ok: true, callId: parsed.data.call_id };
  } catch (err) {
    return { ok: false, reason: ctrl.signal.aborted ? "timeout" : err instanceof Error ? `network:${err.name}` : "network" };
  } finally {
    clearTimeout(timer);
  }
}
