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

  // Strategy 3 (decode-only) tests
  describe("decode-only fallback (no secrets)", () => {
    it("extracts userId from valid JWT payload", async () => {
      const token = fakeJWT({
        sub: "user-abc-123",
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBe("user-abc-123");
      expect(result.error).toBeNull();
    });

    it("returns error for expired token", async () => {
      const token = fakeJWT({
        sub: "user-expired",
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) - 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBe("Token expirado");
    });

    it("returns error when no sub claim", async () => {
      const token = fakeJWT({
        iss: "https://supabase.io",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBe("Token sin subject");
    });

    it("returns error for non-supabase issuer", async () => {
      const token = fakeJWT({
        sub: "user-bad-iss",
        iss: "https://evil.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBeNull();
      expect(result.error).toBe("Emisor no reconocido");
    });

    it("accepts token without iss claim (permissive decode)", async () => {
      const token = fakeJWT({
        sub: "user-no-iss",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const result = await verifyAuth(makeReq(token));
      expect(result.userId).toBe("user-no-iss");
    });
  });
});
