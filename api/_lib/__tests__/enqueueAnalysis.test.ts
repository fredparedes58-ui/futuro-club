/**
 * VITAS · Tests de enqueueAnalysis (guarda de RLS/FK + idempotencia)
 * Run: npm run test:api -- enqueueAnalysis
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueAnalysis } from "../enqueueAnalysis";

// Mock supabase que soporta las cadenas del helper:
//   from("analyses").select(...).eq(...).in(...).maybeSingle()
//   from("analyses").insert(...).select(...).single()
function mockSupabase(opts: { existing?: { id: string; status: string } | null; insertId?: string; insertError?: string }) {
  const insertSpy = vi.fn();
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            maybeSingle: async () => ({ data: opts.existing ?? null }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        insertSpy(row);
        return {
          select: () => ({
            single: async () =>
              opts.insertError
                ? { data: null, error: { message: opts.insertError } }
                : { data: { id: opts.insertId ?? "an-1" }, error: null },
          }),
        };
      },
    }),
  };
  return { client: client as never, insertSpy };
}

const base = {
  videoId: "vid-1",
  tenantId: "tenant-1",
  playerId: "p1",
  publicUrl: "https://x.test",
  cronSecret: "",
};

describe("enqueueAnalysis · guarda RLS/FK", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  it("sin playerId → skipped (no_player), NO inserta", async () => {
    const { client, insertSpy } = mockSupabase({});
    const r = await enqueueAnalysis({ ...base, playerId: null, supabase: client });
    expect(r.status).toBe("skipped");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("sin tenantId → skipped (no_tenant), NO inserta (protege RLS de menores)", async () => {
    const { client, insertSpy } = mockSupabase({});
    const r = await enqueueAnalysis({ ...base, tenantId: null, supabase: client });
    expect(r.status).toBe("skipped");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("análisis activo existente → exists, NO inserta (idempotencia)", async () => {
    const { client, insertSpy } = mockSupabase({ existing: { id: "an-old", status: "queued" } });
    const r = await enqueueAnalysis({ ...base, supabase: client });
    expect(r.status).toBe("exists");
    if (r.status === "exists") expect(r.analysisId).toBe("an-old");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("nuevo → queued, inserta con tenant_id/player_id NO null", async () => {
    const { client, insertSpy } = mockSupabase({ insertId: "an-new" });
    const r = await enqueueAnalysis({ ...base, playedPosition: "RW", supabase: client });
    expect(r.status).toBe("queued");
    if (r.status === "queued") expect(r.analysisId).toBe("an-new");
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.tenant_id).toBe("tenant-1");
    expect(row.player_id).toBe("p1");
    expect(row.video_id).toBe("vid-1");
    expect(row.status).toBe("queued");
    expect(row.played_position).toBe("RW");
  });

  it("error de insert → error", async () => {
    const { client } = mockSupabase({ insertError: "boom" });
    const r = await enqueueAnalysis({ ...base, supabase: client });
    expect(r.status).toBe("error");
  });

  it("con CRON_SECRET dispara el cron; sin él, no", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const { client } = mockSupabase({ insertId: "an-x" });
    const r1 = await enqueueAnalysis({ ...base, cronSecret: "s3cr3t", supabase: client });
    expect(r1.status === "queued" && r1.triggered).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    const { client: c2 } = mockSupabase({ insertId: "an-y" });
    const r2 = await enqueueAnalysis({ ...base, cronSecret: "", supabase: c2 });
    expect(r2.status === "queued" && r2.triggered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
