/**
 * VITAS · JWT Auth Helper for Edge Functions
 *
 * Strategy (ordered):
 *   1. HMAC-SHA256 local verification (fastest) — requires SUPABASE_JWT_SECRET
 *   2. Supabase REST API fallback (GET /auth/v1/user) — requires SUPABASE_URL + SERVICE_ROLE_KEY
 *   3. Decode-only (least secure, dev only) — if neither secret is available
 */

export interface AuthResult {
  userId: string | null;
  /** User email (from JWT `email` claim or Supabase user record). Used for admin allowlist. */
  email: string | null;
  /**
   * Tenant (academia) del usuario. Ancla de autorización a nivel de objeto para
   * los recursos scopeados por tenant (mismo predicado que `public.tenant_id()`
   * en las RLS: migraciones 003/004/055). Null si el JWT no trae el claim.
   *
   * Se lee del claim de nivel raíz `tenant_id` (canónico, lo que ve `public.tenant_id()`)
   * y, como fallback, de `app_metadata.tenant_id` (solo lo escribe el service_role).
   * NUNCA de `user_metadata` — el propio usuario puede modificarlo (escalada de tenant).
   */
  tenantId: string | null;
  error: string | null;
}

/**
 * Extrae el tenant_id de un objeto de claims/usuario de forma segura.
 * Prioridad: claim raíz `tenant_id` → `app_metadata.tenant_id`.
 * `app_metadata` solo lo puede escribir el service_role (no el usuario), a
 * diferencia de `user_metadata`, que el usuario edita libremente y por tanto
 * NO es una fuente de autoridad.
 */
function extractTenantId(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const rec = claims as Record<string, unknown>;
  const top = rec["tenant_id"];
  if (typeof top === "string" && top.length > 0) return top;
  const app = rec["app_metadata"];
  if (app && typeof app === "object") {
    const t = (app as Record<string, unknown>)["tenant_id"];
    if (typeof t === "string" && t.length > 0) return t;
  }
  return null;
}

/**
 * Extract and verify user ID from Authorization header.
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return { userId: null, email: null, tenantId: null, error: "No autenticado" };
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { userId: null, email: null, tenantId: null, error: "Token inválido" };
  }

  // ── Strategy 1: Local HMAC-SHA256 verification ──────────────────────────
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    try {
      const payload = JSON.parse(atob(parts[1]));
      const userId = payload.sub ?? null;
      const email = (payload.email as string | undefined) ?? null;
      const tenantId = extractTenantId(payload);
      if (!userId) return { userId: null, email: null, tenantId: null, error: "Token sin subject" };

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { userId: null, email: null, tenantId: null, error: "Token expirado" };
      }

      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtSecret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );

      const signInput = `${parts[0]}.${parts[1]}`;
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signInput));

      const computed = btoa(Array.from(new Uint8Array(sigBuffer)).map(b => String.fromCharCode(b)).join(""))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      if (computed !== parts[2]) {
        // Signature mismatch — fall through to Strategy 2 instead of hard-failing
        // (JWT_SECRET might be wrong; Supabase API is authoritative)
        console.warn("[auth] HMAC mismatch — trying Supabase API fallback");
      } else {
        if (payload.iss && !payload.iss.includes("supabase")) {
          return { userId: null, email: null, tenantId: null, error: "Emisor no reconocido" };
        }
        return { userId, email, tenantId, error: null };
      }
    } catch {
      // Decode/verify failed — fall through
      console.warn("[auth] Local JWT decode failed — trying Supabase API fallback");
    }
  }

  // ── Strategy 2: Supabase REST API verification (authoritative) ──────────
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: serviceKey,
        },
      });

      if (res.ok) {
        const user = (await res.json()) as {
          id?: string;
          email?: string;
          app_metadata?: Record<string, unknown>;
        };
        if (user.id) {
          // El registro GoTrue no expone claims de nivel raíz — el tenant vive en
          // app_metadata (solo lo escribe el service_role), así que lo leemos de ahí.
          return { userId: user.id, email: user.email ?? null, tenantId: extractTenantId(user), error: null };
        }
      }

      // Supabase rejected the token — this is authoritative
      const errBody = await res.text().catch(() => "");
      const errMsg = (() => {
        try { return (JSON.parse(errBody) as { msg?: string; message?: string }).msg ?? (JSON.parse(errBody) as { message?: string }).message ?? `HTTP ${res.status}`; }
        catch { return `HTTP ${res.status}`; }
      })();
      return { userId: null, email: null, tenantId: null, error: `Token rechazado: ${errMsg}` };
    } catch (fetchErr) {
      console.warn("[auth] Supabase API fallback failed:", fetchErr);
      // Network error — fall through to Strategy 3
    }
  }

  // ── Strategy 3: No verification method available — reject ──────────────
  // In production, SUPABASE_JWT_SECRET or SUPABASE_URL must be configured.
  // We never accept tokens without signature verification.
  console.error("[auth] CRITICAL: No JWT_SECRET and no Supabase API available — cannot verify tokens");
  return { userId: null, email: null, tenantId: null, error: "Servidor no puede verificar autenticación. Contacte al administrador." };
}
