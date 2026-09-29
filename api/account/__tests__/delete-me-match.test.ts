/**
 * RGPD · borrado de cuenta: los jobs de partido (+ su proxy en Gemini) se purgan ANTES
 * que los vídeos, y los vídeos de partido/equipo (player_id NULL, que no caen en la
 * cascada de players) se borran por usuario O tenant, capturando antes su bunny_video_id.
 */
import { describe, expect, it, vi } from "vitest";

const purge = vi.fn(async () => ({ match_analyses_deleted: 2, gemini_files_deleted: 2, gemini_delete_errors: 0 }));
vi.mock("../../_lib/matchJob/retention", () => ({ purgeMatchAnalysesForOwner: (...a: unknown[]) => purge(...(a as [])) }));
const bunny = vi.fn(async (ids: unknown[]) => ({ deleted: ids.length, failed: 0, configured: true }));
vi.mock("../../_lib/bunnyCleanup", () => ({ deleteBunnyVideos: (ids: unknown[]) => bunny(ids) }));

const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";

function fakeSupabase(log: string[]) {
  const chain = (table: string, op: string) => {
    const q = {
      eq: async (col: string, val: unknown) => {
        log.push(`${op} ${table} eq ${col}=${val}`);
        return { count: 1, data: null };
      },
      or: async (f: string) => {
        log.push(`${op} ${table} or ${f}`);
        if (op === "select" && table === "videos") return { data: [{ id: "v-team", bunny_video_id: "b-team" }, { id: "v-player", bunny_video_id: "b-player" }] };
        return { count: 3, data: null };
      },
    };
    return q;
  };
  return {
    from: (table: string) => ({
      select: () => chain(table, "select"),
      delete: () => chain(table, "delete"),
    }),
    auth: { admin: { deleteUser: async (id: string) => log.push(`auth delete ${id}`) } },
  };
}

describe("deleteUserDataCompletely · match jobs and team videos", () => {
  it("purges match jobs first, deletes videos by user OR tenant and removes their Bunny files", async () => {
    process.env.SUPABASE_URL = "https://sb.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    const { deleteUserDataCompletely } = await import("../delete-me");
    const log: string[] = [];
    const orig = purge.getMockImplementation();
    purge.mockImplementationOnce(async (...args: unknown[]) => {
      log.push(`purge match ${args.join(",")}`);
      return orig ? orig() : { match_analyses_deleted: 0, gemini_files_deleted: 0, gemini_delete_errors: 0 };
    });
    const summary = await deleteUserDataCompletely(fakeSupabase(log), USER, TENANT);
    const owner = `user_id.eq.${USER},tenant_id.eq.${TENANT}`;
    expect(log[0]).toBe(`select videos or ${owner}`);
    expect(log[1]).toBe(`purge match ${USER},${TENANT}`);
    expect(log).toContain(`delete videos or ${owner}`);
    expect(log.indexOf(`purge match ${USER},${TENANT}`)).toBeLessThan(log.indexOf(`delete videos or ${owner}`));
    expect(bunny).toHaveBeenCalledWith(["b-team", "b-player"]);
    expect(summary).toMatchObject({ match_analyses_deleted: 2, gemini_files_deleted: 2, videos_deleted: 3 });
    expect(log[log.length - 1]).toBe(`auth delete ${USER}`);
  });
  it("without tenant it falls back to the user id only (never opens other tenants)", async () => {
    const { deleteUserDataCompletely } = await import("../delete-me");
    const log: string[] = [];
    await deleteUserDataCompletely(fakeSupabase(log), USER, null);
    expect(log).toContain(`delete videos or user_id.eq.${USER}`);
  });
});
