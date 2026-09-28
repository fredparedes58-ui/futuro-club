/**
 * VITAS · Tests de enqueueAnalysis (guarda de RLS/FK + idempotencia)
 * Run: npm run test:api -- enqueueAnalysis
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueAnalysis } from "../enqueueAnalysis";

// Mock supabase que soporta las cadenas del helper:
//   from("analyses").select(...).eq(video).eq(player).in(...).maybeSingle()
//   from("analyses").insert(...).select(...).single()
//   from("analyses").update(...).eq(id).eq(status).select(...)   (referencia en fila queued)
// `missingColumns`: simula una migración NO aplicada (PostgREST PGRST204 «schema cache»).
function mockSupabase(opts: {
  existing?: { id: string; status: string } | null;
  insertId?: string;
  insertError?: string;
  missingColumns?: string[];
  updateRows?: number;
  /** Referencia ya guardada en la fila existente (lectura por id). */
  storedReference?: { jersey_number: string | null; kit_color: string | null } | null;
}) {
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const updateFilters: Array<[string, unknown]> = [];
  const schemaError = (row: Record<string, unknown>) => {
    const missing = (opts.missingColumns ?? []).find((c) => c in row);
    return missing
      ? { code: "PGRST204", message: `Could not find the '${missing}' column of 'analyses' in the schema cache` }
      : null;
  };
  const client = {
    from: () => ({
      select: () => {
        // .eq encadenable (video_id + player_id) → .in → .maybeSingle
        // .eq(id) → .maybeSingle  (lectura de la referencia guardada)
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => ({
            maybeSingle: async () => ({ data: opts.existing ?? null }),
          }),
          maybeSingle: async () => ({ data: opts.storedReference ?? null, error: null }),
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        insertSpy(row);
        return {
          select: () => ({
            single: async () => {
              const se = schemaError(row);
              if (se) return { data: null, error: se };
              return opts.insertError
                ? { data: null, error: { message: opts.insertError } }
                : { data: { id: opts.insertId ?? "an-1" }, error: null };
            },
          }),
        };
      },
      update: (values: Record<string, unknown>) => {
        updateSpy(values);
        const chain: Record<string, unknown> = {
          eq: (col: string, v: unknown) => {
            updateFilters.push([col, v]);
            return chain;
          },
          select: async () => {
            const se = schemaError(values);
            if (se) return { data: null, error: se };
            const n = opts.updateRows ?? 1;
            return { data: Array.from({ length: n }, () => ({ id: opts.existing?.id })), error: null };
          },
        };
        return chain;
      },
    }),
  };
  return { client: client as never, insertSpy, updateSpy, updateFilters };
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

describe("enqueueAnalysis · referencia del jugador (dorsal + color, mig 068)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  const REF = { jerseyNumber: "10", kitColor: "rojo" };

  it("nuevo con referencia → la guarda en la fila (jersey_number + kit_color)", async () => {
    const { client, insertSpy } = mockSupabase({ insertId: "an-ref" });
    const r = await enqueueAnalysis({ ...base, playerReference: REF, supabase: client });
    expect(r.status).toBe("queued");
    if (r.status === "queued") expect(r.referenceApplied).toBe(true);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.jersey_number).toBe("10");
    expect(row.kit_color).toBe("rojo");
  });

  it("sin referencia (webhook de Bunny) → la fila no lleva columnas de referencia ni se inventan", async () => {
    const { client, insertSpy } = mockSupabase({ insertId: "an-noref" });
    const r = await enqueueAnalysis({ ...base, supabase: client });
    expect(r.status).toBe("queued");
    if (r.status === "queued") expect(r.referenceApplied).toBeUndefined();
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect("jersey_number" in row).toBe(false);
    expect("kit_color" in row).toBe(false);
  });

  it("re-encolado con referencia nueva sobre una fila QUEUED → actualiza esa fila (idempotencia intacta)", async () => {
    const { client, insertSpy, updateSpy, updateFilters } = mockSupabase({ existing: { id: "an-old", status: "queued" } });
    const r = await enqueueAnalysis({ ...base, playerReference: REF, supabase: client });
    expect(r.status).toBe("exists");
    if (r.status === "exists") {
      expect(r.analysisId).toBe("an-old");
      expect(r.referenceApplied).toBe(true);
    }
    expect(insertSpy).not.toHaveBeenCalled(); // sigue sin duplicar
    expect(updateSpy).toHaveBeenCalledWith({ jersey_number: "10", kit_color: "rojo" });
    // Solo mientras sigue en cola: si el cron ya la reclamó, no se reescribe.
    expect(updateFilters).toContainEqual(["id", "an-old"]);
    expect(updateFilters).toContainEqual(["status", "queued"]);
  });

  it("re-encolado con referencia VACÍA sobre fila queued → también la borra (último dato del usuario)", async () => {
    const { client, updateSpy } = mockSupabase({ existing: { id: "an-old", status: "queued" } });
    await enqueueAnalysis({ ...base, playerReference: { jerseyNumber: null, kitColor: null }, supabase: client });
    expect(updateSpy).toHaveBeenCalledWith({ jersey_number: null, kit_color: null });
  });

  it("fila ya en proceso/completada → NO se reescribe la referencia (Gemini ya usó la anterior)", async () => {
    for (const status of ["processing", "processing_reports", "completed"]) {
      const { client, updateSpy } = mockSupabase({ existing: { id: "an-busy", status } });
      const r = await enqueueAnalysis({ ...base, playerReference: REF, supabase: client });
      expect(r.status).toBe("exists");
      if (r.status === "exists") expect(r.referenceApplied).toBe(false);
      expect(updateSpy).not.toHaveBeenCalled();
    }
  });

  it("fila ya en proceso que YA lleva la misma referencia (la encoló el webhook) → referenceApplied true", async () => {
    const { client, updateSpy } = mockSupabase({
      existing: { id: "an-busy", status: "processing" },
      storedReference: { jersey_number: "10", kit_color: "rojo" },
    });
    const r = await enqueueAnalysis({ ...base, playerReference: REF, supabase: client });
    if (r.status === "exists") expect(r.referenceApplied).toBe(true);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("carrera: el cron reclamó la fila entre la lectura y el update (0 filas) → referenceApplied false", async () => {
    const { client } = mockSupabase({ existing: { id: "an-old", status: "queued" }, updateRows: 0 });
    const r = await enqueueAnalysis({ ...base, playerReference: REF, supabase: client });
    if (r.status === "exists") expect(r.referenceApplied).toBe(false);
  });

  it("mig 068 sin aplicar → encola SIN referencia (no rompe) y lo declara (referenceApplied false)", async () => {
    const { client, insertSpy } = mockSupabase({ insertId: "an-x", missingColumns: ["jersey_number", "kit_color"] });
    const r = await enqueueAnalysis({ ...base, locale: "en", playerReference: REF, supabase: client });
    expect(r.status).toBe("queued");
    if (r.status === "queued") expect(r.referenceApplied).toBe(false);
    const last = insertSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last.locale).toBe("en"); // el idioma (mig 064) NO se pierde por la 068
    expect("jersey_number" in last).toBe(false);
  });

  it("mig 064 y 068 sin aplicar → encola con la fila base", async () => {
    const { client, insertSpy } = mockSupabase({ insertId: "an-y", missingColumns: ["jersey_number", "kit_color", "locale"] });
    const r = await enqueueAnalysis({ ...base, locale: "en", playerReference: REF, supabase: client });
    expect(r.status).toBe("queued");
    const last = insertSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect("locale" in last).toBe(false);
    expect(last.player_id).toBe("p1");
  });
});
