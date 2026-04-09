/**
 * TeamService — Tests
 * Gestión de miembros e invitaciones de equipo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

const membersData = [{ id: "m1", orgOwnerId: "org1", memberId: "u1", role: "scout", joinedAt: "2024-01-01" }];
const invitationsData = [{ id: "inv1", email: "test@test.com", role: "scout", status: "pending" }];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "team_members") {
        return {
          select: mockSelect.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                data: membersData,
                error: null,
              }),
            }),
          }),
          delete: mockDelete.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ error: null }),
            }),
          }),
        };
      }
      if (table === "team_invitations") {
        return {
          select: mockSelect.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                data: invitationsData,
                error: null,
              }),
            }),
          }),
          update: mockUpdate.mockReturnValue({
            eq: vi.fn().mockReturnValue({ error: null }),
          }),
        };
      }
      return { select: vi.fn(), insert: mockInsert };
    }),
  },
  SUPABASE_CONFIGURED: true,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { TeamService } from "@/services/real/teamService";

describe("TeamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMembers() consulta team_members por orgOwnerId", async () => {
    const members = await TeamService.getMembers("org1");
    expect(Array.isArray(members)).toBe(true);
  });

  it("getInvitations() consulta team_invitations", async () => {
    const invitations = await TeamService.getInvitations("org1");
    expect(Array.isArray(invitations)).toBe(true);
  });

  it("invite() llama a /api/team/invite", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    await TeamService.invite("org1", "new@test.com", "scout");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/team/invite",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("acceptInvitation() llama a /api/team/accept", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, role: "scout", orgOwnerId: "org1" }),
    });
    const result = await TeamService.acceptInvitation("token123", "u1");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/team/accept",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.role).toBe("scout");
  });

  it("removeMember() elimina de Supabase", async () => {
    await TeamService.removeMember("org1", "m1");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("cancelInvitation() actualiza status a expired", async () => {
    await TeamService.cancelInvitation("inv1");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("invite() lanza error si fetch falla", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });
    await expect(TeamService.invite("org1", "bad@test.com", "scout")).rejects.toThrow();
  });
});
