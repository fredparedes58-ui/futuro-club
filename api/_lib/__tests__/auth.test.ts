/**
 * Tests for auth — JWT verification helper
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyAuth, type AuthResult } from "../auth";

// Helper: build a fake JWT with given payload
function fakeJWT(payload: Record<string, unknown>, signature = "fakesig"): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${signature}`;
}

function makeReq(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request("https://example.com/api/test", { headers });
}

describe("verifyAuth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear auth-related env vars to force decode-only (strategy 3)
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns error when no Authorization header", async () => {
    const result = await verifyAuth(makeReq());
    expect(result.userId).toBeNull();
    expect(result.error).toBe("No autenticado");
  });

  it("returns error for non-Bearer token", async () => {
    const req = new Request("https://example.com", {
      headers: { Authorization: "Basic abc123" },
    });
    const result = await verifyAuth(req);
    expect(result.userId).toBeNull();
  });

  it("returns error for malformed token (not 3 parts)", async () => {
    const result = await verifyAuth(makeReq("not.a.valid.jwt.token"));
    expect(result.userId).toBeNull();
  });

  // Strategy 3: No secrets configured — MUST reject all tokens (secure by default)
  describe("no secrets configured (secure default)", () => {
    it("rejects valid JWT when no JWT_SECRET and no Supabase API", async () => {
      const token = fakeJWT({
        sub: "user-abc-123",
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toContain("Servidor no puede verificar");
    });

    it("rejects expired token (still rejects — server cannot verify)", async () => {
      const token = fakeJWT({
        sub: "user-expired",
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) - 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it("rejects token without sub claim", async () => {
      const token = fakeJWT({
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it("rejects token with non-supabase issuer", async () => {
      const token = fakeJWT({
        sub: "user-bad-iss",
        iss: "https://evil.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it("rejects token without iss claim (no permissive fallback)", async () => {
      const token = fakeJWT({
        sub: "user-no-iss",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });
});
