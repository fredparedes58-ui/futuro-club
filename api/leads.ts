/**
 * VITAS · Captura de leads — POST /api/leads
 *
 * Formulario público de "acceso anticipado" de la landing (auto-alojada en la web
 * de Krujens). Endpoint PÚBLICO (sin auth), pensado para ser llamado desde otro
 * origen (krujens.eu) → CORS abierto propio (Access-Control-Allow-Origin: *), en
 * vez de la allowlist de apiResponse (que solo permite futuro-club.vercel.app).
 *
 * Captura por DOS vías best-effort e independientes:
 *   1) Guarda en Supabase (tabla `leads`, migración 063) vía service_role.
 *   2) Avisa por email a Contact@krujens.eu (Resend).
 * Devuelve 200 si al menos UNA vía funcionó; 502 si ninguna (el formulario del
 * cliente cae entonces a un mailto y el lead no se pierde).
 *
 * Defensa: rate-limit por IP (10/min) + honeypot (`website`) anti-bots. La IP se
 * guarda hasheada (SHA-256), nunca en claro (RGPD).
 */

import { z } from "zod";
import { checkRateLimit, getClientIP } from "./_lib/rateLimit";
import { sendEmail } from "./_lib/email";

export const config = { runtime: "edge" };

const CONTACT = "Contact@krujens.eu";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  club: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  source: z.string().trim().max(80).optional().default("landing"),
  // Honeypot: campo oculto que un humano deja vacío; si viene relleno = bot.
  website: z.string().max(0).optional(),
});
type Lead = z.infer<typeof leadSchema>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

async function sha256Hex(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

async function storeLead(lead: Lead, ua: string, ipHash: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/leads`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        name: lead.name,
        club: lead.club || null,
        email: lead.email,
        phone: lead.phone || null,
        message: lead.message || null,
        source: lead.source || "landing",
        user_agent: ua || null,
        ip_hash: ipHash || null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function emailLead(lead: Lead): Promise<boolean> {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#1A1436">
    <h2 style="color:#6D3BEE;margin:0 0 12px">Nuevo lead · VITAS</h2>
    <p style="margin:4px 0"><b>Nombre:</b> ${esc(lead.name)}</p>
    <p style="margin:4px 0"><b>Club / Rol:</b> ${esc(lead.club) || "—"}</p>
    <p style="margin:4px 0"><b>Email:</b> ${esc(lead.email)}</p>
    <p style="margin:4px 0"><b>Teléfono:</b> ${esc(lead.phone) || "—"}</p>
    <p style="margin:12px 0 4px"><b>Mensaje:</b><br>${esc(lead.message) || "—"}</p>
    <p style="color:#918AB6;font-size:12px;margin-top:16px">Origen: ${esc(lead.source)}</p>
  </div>`;
  return sendEmail({
    to: CONTACT,
    subject: `Nuevo lead VITAS — ${lead.club || lead.name}`,
    html,
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const ip = getClientIP(req);
  const rl = await checkRateLimit(ip, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) {
    return json({ ok: false, error: "Demasiadas solicitudes. Inténtalo en un minuto." }, 429);
  }

  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    return json({ ok: false, error: "Datos inválidos", detail }, 400);
  }
  const lead = parsed.data;

  // Honeypot relleno → bot. Responde 200 (que el bot crea que fue bien) pero NO captura.
  if (lead.website && lead.website.length > 0) {
    return json({ ok: true, stored: false, emailed: false });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = ip ? await sha256Hex(`vitas:${ip}`) : "";

  const [stored, emailed] = await Promise.all([storeLead(lead, ua, ipHash), emailLead(lead)]);

  if (!stored && !emailed) {
    // Ninguna vía disponible (sin Supabase y sin Resend): que el cliente use el mailto.
    return json({ ok: false, error: "No se pudo registrar ahora mismo." }, 502);
  }

  return json({ ok: true, stored, emailed });
}
