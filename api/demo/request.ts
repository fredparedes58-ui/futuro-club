/**
 * VITAS · Lead-gate del demo — POST /api/demo/request
 *
 * El visitante del demo (adulto: directivo/scout) deja sus datos y CONSIENTE (RGPD).
 * Se crea una solicitud 'pending' y se envía un email al OPERADOR con enlaces firmados
 * para APROBAR / RECHAZAR / REVOCAR. El navegador recibe un access_token opaco con el
 * que consulta su estado (GET /api/demo/status). Público + CORS abierto (se llama desde
 * vitas-demo.krujens.eu, otro origen). IP guardada hasheada (SHA-256), nunca en claro.
 *
 * Requiere en el proyecto principal (futuro-club): SUPABASE_* + RESEND_* + el secreto
 * de firma DEMO_APPROVE_SECRET. Opcionales: DEMO_APPROVER_EMAIL (destino, por defecto
 * Contact@krujens.eu), DEMO_DECIDE_BASE (base de los enlaces), DEMO_MAX_UNLOCKS (cupo).
 */

import { z } from "zod";
import { checkRateLimit, getClientIP } from "../_lib/rateLimit";
import { sendEmail } from "../_lib/email";
import { insertRequest, makeAccessToken, signDecision, sha256Hex, esc, countRequests } from "../_lib/demoAccess";

export const config = { runtime: "edge" };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  club: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional().default(""),
  consent: z.literal(true), // el consentimiento RGPD es obligatorio
  demo_slug: z.string().trim().max(200).optional().default(""),
  website: z.string().max(0).optional(), // honeypot anti-bots
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`demo:${ip}`, { windowMs: 60_000, max: 8 });
  if (!rl.allowed) return json({ ok: false, error: "Demasiadas solicitudes. Inténtalo en un minuto." }, 429);

  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return json({ ok: false, error: "Datos inválidos", detail }, 400);
  }
  const d = parsed.data;

  // Honeypot relleno → bot: responde 'pending' con un token muerto (nunca se aprobará).
  if (d.website && d.website.length > 0) {
    return json({ ok: true, status: "pending", accessToken: makeAccessToken() });
  }

  // Cupo opcional (anti-abuso; la barrera real es la aprobación manual).
  const cap = parseInt(process.env.DEMO_MAX_UNLOCKS ?? "", 10);
  if (Number.isFinite(cap) && cap > 0) {
    const total = await countRequests();
    if (total != null && total >= cap) {
      return json({ ok: false, status: "limit", error: "El cupo de la demo está completo por ahora." }, 403);
    }
  }

  const accessToken = makeAccessToken();
  const ipHash = ip ? await sha256Hex(`vitas:${ip}`) : "";
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const ua = req.headers.get("user-agent") ?? "";
  const now = new Date().toISOString();

  const id = await insertRequest({
    name: d.name,
    club: d.club || null,
    role: d.role || null,
    email: d.email,
    phone: d.phone || null,
    consent: true,
    consent_at: now,
    demo_slug: d.demo_slug || origin || null,
    origin: origin || null,
    user_agent: ua || null,
    ip_hash: ipHash || null,
    status: "pending",
    access_token: accessToken,
  });

  if (!id) {
    // Sin persistencia no hay flujo de aprobación posible.
    return json({ ok: false, error: "No se pudo registrar la solicitud ahora mismo." }, 502);
  }

  // Email al operador con enlaces firmados (solo quien tiene el email puede decidir).
  const base = process.env.DEMO_DECIDE_BASE ?? "https://vitas.krujens.eu";
  const link = async (action: string) => `${base}/api/demo/decide?id=${id}&action=${action}&sig=${await signDecision(id, action)}`;
  const [approveUrl, rejectUrl, revokeUrl] = await Promise.all([link("approve"), link("reject"), link("revoke")]);
  const approver = process.env.DEMO_APPROVER_EMAIL ?? "Contact@krujens.eu";
  const secretSet = !!process.env.DEMO_APPROVE_SECRET;

  const btn = (url: string, label: string, color: string) =>
    `<a href="${url}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;border-radius:8px;background:${color};color:#fff;text-decoration:none;font-weight:600;font-family:system-ui,sans-serif">${label}</a>`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#0b1226">
    <div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#0059B3;text-transform:uppercase">VITAS · Solicitud de acceso al demo</div>
    <h2 style="margin:6px 0 12px">${esc(d.name)}${d.club ? " · " + esc(d.club) : ""}</h2>
    <p style="margin:4px 0"><b>Rol / Cargo:</b> ${esc(d.role) || "—"}</p>
    <p style="margin:4px 0"><b>Email:</b> ${esc(d.email)}</p>
    <p style="margin:4px 0"><b>Teléfono:</b> ${esc(d.phone) || "—"}</p>
    <p style="margin:4px 0;color:#6c7794;font-size:12px">Origen: ${esc(origin) || "—"} · ${esc(now)}</p>
    <div style="margin:18px 0 6px">
      ${btn(approveUrl, "✓ Aprobar acceso", "#12B886")}
      ${btn(rejectUrl, "✕ Rechazar", "#E5484D")}
    </div>
    <div style="margin:6px 0">${btn(revokeUrl, "⟲ Revocar (quitar acceso más tarde)", "#6c7794")}</div>
    ${secretSet ? "" : '<p style="color:#E5484D;font-size:12px;margin-top:14px"><b>⚠ Falta configurar DEMO_APPROVE_SECRET</b> en Vercel — los enlaces de arriba no funcionarán hasta que lo definas.</p>'}
    <p style="color:#6c7794;font-size:11px;margin-top:16px">El solicitante consintió el tratamiento de sus datos (RGPD). Puedes revocar el acceso en cualquier momento con el enlace gris.</p>
  </div>`;

  await sendEmail({ to: approver, subject: `Acceso demo VITAS — ${d.club || d.name}`, html });

  return json({ ok: true, status: "pending", accessToken });
}
