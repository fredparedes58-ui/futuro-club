/**
 * VITAS · JWT Auth Helper for Edge Functions
 * Verifies Supabase JWT tokens using the JWT secret.
 * Falls back to decoding without verification if secret not available.
 */

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

/**
 * Extract and verify user ID from Authorization header.
 * Uses Supabase's HMAC-SHA256 JWT verification when JWT_SECRET is available.
 * Returns userId if valid, null + error message if not.
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

  try {
    // Decode payload
    const payload = JSON.parse(atob(parts[1]));
    const userId = payload.sub ?? null;

    if (!userId) {
      return { userId: null, error: "Token sin subject" };
    }

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { userId: null, error: "Token expirado" };
    }

    // Verify signature if JWT_SECRET is available
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (jwtSecret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtSecret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );

      const signInput = `${parts[0]}.${parts[1]}`;
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signInput));

      // Base64url encode the computed signature
      const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      if (computed !== parts[2]) {
        return { userId: null, error: "Firma JWT inválida" };
      }
    }

    // Verify issuer is Supabase
    if (payload.iss && !payload.iss.includes("supabase")) {
      return { userId: null, error: "Emisor no reconocido" };
    }

    return { userId, error: null };
  } catch {
    return { userId: null, error: "Token malformado" };
  }
}
