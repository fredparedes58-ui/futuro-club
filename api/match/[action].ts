/**
 * VITAS · Match Router — job de partido completo por vídeo (Fase 1)
 *
 *   POST /api/match/start   · JWT de usuario
 *   GET  /api/match/status  · JWT · solo lectura
 *   GET  /api/match/list    · JWT · jobs del usuario
 *   POST /api/match/cancel  · JWT
 *   GET  /api/match/availability · JWT · solo lectura (¿ruta de vídeo activa o «en validación»?)
 *   POST /api/match/step    · HMAC (worker Modal)
 *
 * El análisis está APAGADO por defecto (MATCH_VIDEO_ENABLED !== "true"): start responde
 * 503 «en validación» y step detiene cualquier job en vuelo sin gastar.
 *
 * Runtime nodejs con maxDuration 300: `advance` hace una llamada a Gemini/Claude de
 * hasta 240 s. Contrato: src/lib/shared/matchJob/contract.ts.
 */
import { errorResponse } from "../_lib/apiResponse";
import start from "./_start";
import status from "./_status";
import list from "./_list";
import cancel from "./_cancel";
import availability from "./_availability";
import step from "./_step";

export const config = { runtime: "nodejs", maxDuration: 300 };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  start,
  status,
  list,
  cancel,
  availability,
  step,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Match route "${action}" not found`, 404);
  return fn(req);
}
