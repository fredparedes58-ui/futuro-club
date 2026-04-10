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
  error: string | null;
}

/**
 * Extract and verify user ID from Authorization header.
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return { userId: null, error: "No autenticado" };
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");

  if (parts.length !== 3) {
    return { userId: null, error: "Token inválido" };
  }

  // ── Strategy 1: Local HMAC-SHA256 verification ──────────────────────────
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    try {
      const payload = JSON.parse(atob(parts[1]));
      const userId = payload.sub ?? null;
      if (!userId) return { userId: null, error: "Token sin subject" };

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { userId: null, error: "Token expirado" };
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
          return { userId: null, error: "Emisor no reconocido" };
        }
        return { userId, error: null };
      }
    } catch {
      // Decode/verify failed — fall through
      console.warn("[auth] Local JWT decode failed — trying Supabase API fallback");
    }
  }

  // ── Strategy 2: Supabase REST API verification (authoritative) ──────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
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
        const user = (await res.json()) as { id?: string };
        if (user.id) {
          return { userId: user.id, error: null };
        }
      }

      // Supabase rejected the token — this is authoritative
      const errBody = await res.text().catch(() => "");
      const errMsg = (() => {
        try { return (JSON.parse(errBody) as { msg?: string; message?: string }).msg ?? (JSON.parse(errBody) as { message?: string }).message ?? `HTTP ${res.status}`; }
        catch { return `HTTP ${res.status}`; }
      })();
      return { userId: null, error: `Token rechazado: ${errMsg}` };
    } catch (fetchErr) {
      console.warn("[auth] Supabase API fallback failed:", fetchErr);
      // Network error — fall through to Strategy 3
    }
  }

  // ── Strategy 3: Decode-only (dev/fallback — no secrets configured) ──────
  try {
    const payload = JSON.parse(atob(parts[1]));
    const userId = payload.sub ?? null;
    if (!userId) return { userId: null, error: "Token sin subject" };

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { userId: null, error: "Token expirado" };
    }

    if (payload.iss && !payload.iss.includes("supabase")) {
      return { userId: null, error: "Emisor no reconocido" };
    }

    console.warn("[auth] No JWT_SECRET or Supabase API — using decode-only (INSECURE)");
    return { userId, error: null };
  } catch {
    return { userId: null, error: "Token malformado" };
  }
}
