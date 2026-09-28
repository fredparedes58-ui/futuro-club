/**
 * VITAS · Regresión: upload/image con rawBody:true leía un cuerpo ya consumido
 * (req.arrayBuffer() tras el req.text() de withHandler) → la subida fallaba siempre.
 *
 * Run: npm run test:api -- upload/__tests__/image
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, limit: 30, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: null, tenantId: null, error: null }),
}));

import uploadImage from "../_image";

describe("upload/image · cuerpo binario", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.BUNNY_STORAGE_ZONE = "zone";
    process.env.BUNNY_STORAGE_API_KEY = "key";
    process.env.BUNNY_STORAGE_CDN_URL = "https://cdn.test";
    fetchMock = vi.fn(async () => new Response("", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BUNNY_STORAGE_ZONE;
    delete process.env.BUNNY_STORAGE_API_KEY;
    delete process.env.BUNNY_STORAGE_CDN_URL;
  });

  it("sube los bytes intactos a Bunny Storage", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // cabecera JPEG, no UTF-8
    const res = await uploadImage(new Request("https://x.test/api/upload/image?path=players/p1/a.jpg", {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: "Bearer user-jwt" },
      body: bytes,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.size).toBe(bytes.byteLength);
    expect(json.data.url).toBe("https://cdn.test/players/p1/a.jpg");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes);
  });
});
