/**
 * useGdprExport — GDPR data export hook
 *
 * Downloads all user data from Supabase as JSON file.
 * Combines server-side Supabase data with client-side localStorage data.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/apiAuth";
import { BackupService } from "@/services/real/backupService";

export interface GdprExportState {
  isExporting: boolean;
  error: string | null;
  lastExport: string | null;
}

export function useGdprExport() {
  const { user } = useAuth();
  const [state, setState] = useState<GdprExportState>({
    isExporting: false,
    error: null,
    lastExport: null,
  });

  const exportData = useCallback(async () => {
    if (!user) return;

    setState({ isExporting: true, error: null, lastExport: null });

    try {
      // 1. Get server-side data (Supabase)
      let serverData: Record<string, unknown> | null = null;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/account/export", { headers });
        if (res.ok) {
          serverData = await res.json() as Record<string, unknown>;
        }
      } catch {
        // Server export failed — continue with localStorage only
      }

      // 2. Get client-side data (localStorage)
      const localData = JSON.parse(BackupService.export());

      // 3. Combine
      const fullExport = {
        exportedAt: new Date().toISOString(),
        userId: user.id,
        email: user.email,
        format: "VITAS_GDPR_FULL_EXPORT_v1",
        serverData: serverData ?? { unavailable: true },
        localData: localData.data ?? {},
      };

      // 4. Download as file
      const json = JSON.stringify(fullExport, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vitas-datos-completos-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const now = new Date().toISOString();
      setState({ isExporting: false, error: null, lastExport: now });
    } catch (err) {
      setState({
        isExporting: false,
        error: err instanceof Error ? err.message : "Error desconocido",
        lastExport: null,
      });
    }
  }, [user]);

  return { ...state, exportData };
}
