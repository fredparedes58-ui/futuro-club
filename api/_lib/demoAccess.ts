/**
 * VITAS · Lead-gate del demo — helpers compartidos (Edge)
 *
 * Persistencia en Supabase (tabla demo_access, migración 066) vía service_role, y
 * firma HMAC de los enlaces de decisión (aprobar/rechazar/revocar) para que SOLO
 * quien recibe el email del operador pueda decidir. El secreto de firma vive en
 * env (DEMO_APPROVE_SECRET) — NUNCA en el código ni en el cliente.
 */

export type DemoStatus = "pending" | "approved" | "rejected" | "revoked";

export interface DemoAccessRow {
  id: string;
  status: DemoStatus;
  name: string;
  club: string | null;
  role: string | null;
  email: string;
  phone: string | null;
  created_at: string;
}

function sbBase(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function sbHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** Inserta una solicitud y devuelve su id + un detalle diagnóstico. */
export async function insertRequest(row: Record<string, unknown>): Promise<{ id: string | null; detail: string }> {
  const sb = sbBase();
  if (!sb) return { id: null, detail: "no-env: falta SUPABASE_URL/VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" };
  try {
    const res = await fetch(`${sb.url}/rest/v1/demo_access`, {
      method: "POST",
      headers: sbHeaders(sb.key, { Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      return { id: null, detail: `supabase ${res.status}: ${body}` };
    }
    const data = (await res.json()) as Array<{ id: string }>;
    return { id: data?.[0]?.id ?? null, detail: "ok" };
  } catch (e) {
    return { id: null, detail: "fetch-error: " + (e instanceof Error ? e.message : String(e)) };
  }
}

/** Lee una solicitud por su access_token (el que tiene el navegador del visitante). */
export async function getByAccessToken(token: string): Promise<DemoAccessRow | null> {
  const sb = sbBase();
  if (!sb || !token) return null;
  try {
    const q = `${sb.url}/rest/v1/demo_access?access_token=eq.${encodeURIComponent(token)}&select=id,status,name,club,role,email,phone,created_at&limit=1`;
    const res = await fetch(q, { headers: sbHeaders(sb.key) });
    if (!res.ok) return null;
    const data = (await res.json()) as DemoAccessRow[];
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Lee una solicitud por id (para la página de decisión). */
export async function getById(id: string): Promise<DemoAccessRow | null> {
  const sb = sbBase();
  if (!sb || !id) return null;
  try {
    const q = `${sb.url}/rest/v1/demo_access?id=eq.${encodeURIComponent(id)}&select=id,status,name,club,role,email,phone,created_at&limit=1`;
    const res = await fetch(q, { headers: sbHeaders(sb.key) });
    if (!res.ok) return null;
    const data = (await res.json()) as DemoAccessRow[];
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Cambia el estado de una solicitud. */
export async function setStatus(id: string, status: DemoStatus): Promise<boolean> {
  const sb = sbBase();
  if (!sb) return false;
  try {
    const res = await fetch(`${sb.url}/rest/v1/demo_access?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: sbHeaders(sb.key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ status, decided_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Cuenta total de solicitudes (para el cupo opcional DEMO_MAX_UNLOCKS). */
export async function countRequests(): Promise<number | null> {
  const sb = sbBase();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/rest/v1/demo_access?select=id`, {
      method: "HEAD",
      headers: sbHeaders(sb.key, { Prefer: "count=exact", Range: "0-0" }),
    });
    const cr = res.headers.get("content-range"); // "0-0/123" o "*/123"
    if (!cr) return null;
    const total = cr.split("/").pop();
    const n = total ? parseInt(total, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ── Firma HMAC de los enlaces de decisión ─────────────────────────────────────

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Firma (id, action) con DEMO_APPROVE_SECRET. Devuelve "" si no hay secreto. */
export async function signDecision(id: string, action: string): Promise<string> {
  const secret = process.env.DEMO_APPROVE_SECRET;
  if (!secret) return "";
  return hmacHex(secret, `${id}:${action}`);
}

/** Verifica la firma de un enlace de decisión (comparación en tiempo constante). */
export async function verifyDecision(id: string, action: string, sig: string): Promise<boolean> {
  const secret = process.env.DEMO_APPROVE_SECRET;
  if (!secret || !sig) return false;
  const expected = await hmacHex(secret, `${id}:${action}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Token de acceso opaco no adivinable (para que el navegador consulte su estado). */
export function makeAccessToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}
