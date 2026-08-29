/**
 * VITAS · Tests del reaper de análisis colgados (#56)
 * Run: npm run test:api -- reap-stuck-analyses
 */
import { describe, it, expect } from "vitest";
import { reapStuckAnalyses } from "../process-analyses-queue";

// Mock del cliente supabase que soporta la cadena:
//   from("analyses").update(u).in(col, statuses).or(filter).select("id")
function mockSupabase(reapedRows: Array<{ id: string }> | null) {
  const captured: { update?: Record<string, unknown>; statuses?: string[]; orFilter?: string } = {};
  const client = {
    from: () => ({
      update: (u: Record<string, unknown>) => {
        captured.update = u;
        return {
          in: (_col: string, statuses: string[]) => {
            captured.statuses = statuses;
            return {
              or: (filter: string) => {
                captured.orFilter = filter;
                return {
                  select: async (_c: string) => ({ data: reapedRows }),
                };
              },
            };
          },
        };
      },
    }),
  };
  return { client: client as never, captured };
}

describe("reapStuckAnalyses (#56)", () => {
  it("marca 'failed' los colgados, filtra por estados de proceso, devuelve el conteo", async () => {
    const { client, captured } = mockSupabase([{ id: "a1" }, { id: "a2" }]);
    const n = await reapStuckAnalyses(client, 1);
    expect(n).toBe(2);
    expect(captured.update?.status).toBe("failed");
    expect(captured.update?.status_message).toContain("colgado");
    // SOLO estados en proceso (no toca queued/completed/failed)
    expect(captured.statuses).toEqual(["processing", "processing_reports"]);
    // El filtro .or cubre started_at<corte Y las filas con started_at NULL (fallback created_at)
    expect(captured.orFilter).toContain("started_at.lt.");
    expect(captured.orFilter).toContain("started_at.is.null");
    expect(captured.orFilter).toContain("created_at.lt.");
    // El corte de antigüedad es coherente con staleHours (1h atrás, aprox)
    const before = captured.orFilter!.match(/started_at\.lt\.([^,]+)/)![1];
    const cutoff = new Date(before).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(3600_000 - 5000);
  });

  it("0 colgados → devuelve 0 sin fabricar nada", async () => {
    const { client } = mockSupabase([]);
    expect(await reapStuckAnalyses(client, 2)).toBe(0);
  });

  it("data null (error de red) → 0, no lanza", async () => {
    const { client } = mockSupabase(null);
    expect(await reapStuckAnalyses(client, 1)).toBe(0);
  });
});
