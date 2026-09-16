/**
 * VITAS · Lead-gate del demo — GET /api/demo/status?token=<accessToken>
 *
 * El navegador del visitante consulta aquí su estado ('pending' | 'approved' |
 * 'rejected' | 'revoked'). El gate del demo lo llama AL CARGAR y periódicamente,
 * por eso una revocación surte efecto real (deja de renderizar la app). Público +
 * CORS abierto (se llama desde vitas-demo.krujens.eu). Token no adivinable → sin
 * fuga de información; un token desconocido responde 'pending'.
 */

import { getByAccessToken } from "../_lib/demoAccess";

export const config = { runtime: "edge" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token || token.length < 16) return json({ ok: true, status: "pending" });

  const row = await getByAccessToken(token);
  // Token desconocido → 'pending' (no revela si existe o no).
  return json({ ok: true, status: row?.status ?? "pending" });
}
