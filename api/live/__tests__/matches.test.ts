/**
 * VITAS · POST /api/live/matches — videoUrl validada EN ESCRITURA (SSRF + coste)
 *
 * live/aggregate reenvía live_matches.video_url a video-observation (descarga
 * server-side + Gemini). Antes se guardaba cualquier URL. Ahora solo se guarda si
 * pasa la allowlist Bunny; si no, el partido se crea igual SIN vídeo (el tagging
 * manual no depende de él) y la respuesta lo declara en `videoUrlRejected`.
 *
 * También cubre el doble-read del cuerpo: withHandler ya consume el POST, y el
 * `req.json()` del handler devolvía null → 400 en TODA creación.
 *
 * Run: npx vitest run --config vitest.api.config.ts api/live/__tests__/matches.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../_lib/rateLimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: Date.now() + 60000 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("../../_lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ userId: "user-123", email: null, tenantId: null, error: null }),
}));

const inserted: Array<Record<string, unknown>> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "players") {
        return { select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { tenant_id: "tenant-1" } }) }) }) };
      }
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "match-1", ...row }, error: null }) }) };
        },
      };
    },
  }),
}));

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc-key";

import liveMatches from "../matches";

const CDN = "vz-abc123-456.b-cdn.net";
const GOOD = `https://${CDN}/0f1e2d3c-guid/play_720p.mp4`;

function create(body: Record<string, unknown>): Promise<Response> {
  return liveMatches(
    new Request("https://x.test/api/live/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-jwt" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  inserted.length = 0;
  process.env.BUNNY_CDN_HOSTNAME = CDN;
  delete process.env.VITE_BUNNY_CDN_HOSTNAME;
});

describe("POST /api/live/matches", () => {
  it("crea el partido leyendo el cuerpo que ya parseó withHandler (no 400 por doble lectura)", async () => {
    const res = await create({ teamName: "Sub-14 A", opponentName: "Rival" });
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].team_name).toBe("Sub-14 A");
    expect(inserted[0].video_url).toBeNull();
    expect((await res.json()).data.videoUrlRejected).toBeUndefined();
  });

  it("videoUrl de nuestro CDN Bunny se guarda", async () => {
    const res = await create({ teamName: "A", videoUrl: GOOD });
    expect(res.status).toBe(200);
    expect(inserted[0].video_url).toBe(GOOD);
    expect((await res.json()).data.videoUrlRejected).toBeUndefined();
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "https://evil.example.com/huge.mp4",
    "https://attacker-zone.b-cdn.net/huge.mp4",
    "blob:https://futuro-club.vercel.app/2b1c-local",
  ])("videoUrl fuera de la allowlist (%s) NO se guarda; el partido se crea sin vídeo", async (videoUrl) => {
    const res = await create({ teamName: "A", videoUrl });
    expect(res.status).toBe(200);
    expect(inserted[0].video_url).toBeNull();
    const json = await res.json();
    expect(json.data.match.id).toBe("match-1");
    expect(json.data.videoUrlRejected.code).toBe("VIDEO_URL_NOT_ALLOWED");
  });

  it("sin BUNNY_CDN_HOSTNAME falla cerrado: no guarda la URL y lo declara", async () => {
    delete process.env.BUNNY_CDN_HOSTNAME;
    const res = await create({ teamName: "A", videoUrl: GOOD });
    expect(res.status).toBe(200);
    expect(inserted[0].video_url).toBeNull();
    expect((await res.json()).data.videoUrlRejected.code).toBe("VIDEO_HOSTS_NOT_CONFIGURED");
  });

  it("cuerpo inválido sigue siendo 400", async () => {
    const res = await create({ teamName: "x".repeat(200) });
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });
});
