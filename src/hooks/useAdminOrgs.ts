/**
 * useAdminOrgs — Admin hook for organization + user management
 *
 * Queries: list-orgs, list-users
 * Mutations: manage-plan, reset-quota
 *
 * Fase 3: all admin actions use ADMIN_SECRET for serviceOnly auth.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET ?? "";

function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_SECRET}`,
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrgEntry {
  userId: string;
  email: string;
  orgName: string;
  role: string;
  profileType: string | null;
  plan: string;
  status: string;
  analysesUsed: number;
  memberCount: number;
}

export interface UserEntry {
  userId: string;
  email: string;
  createdAt: string;
  lastSignIn: string | null;
  role: string;
  orgName: string | null;
  profileType: string | null;
  plan: string;
  status: string;
  analysesUsed: number;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function useAdminOrgs() {
  return useQuery({
    queryKey: ["admin", "orgs"],
    queryFn: async (): Promise<{ orgs: OrgEntry[]; month: string; total: number }> => {
      const res = await fetch("/api/admin/list-orgs", {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 30_000,
  });
}

export function useAdminUsers(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["admin", "users", limit, offset],
    queryFn: async (): Promise<{ users: UserEntry[]; total: number }> => {
      const res = await fetch(`/api/admin/list-users?limit=${limit}&offset=${offset}`, {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? json;
    },
    staleTime: 30_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useManagePlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { userId: string; plan: string; reason?: string }) => {
      const res = await fetch("/api/admin/manage-plan", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? `${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useResetQuota() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { userId: string; month?: string }) => {
      const res = await fetch("/api/admin/reset-quota", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? `${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
