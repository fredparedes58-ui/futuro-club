/**
 * VITAS · useLocalStorageMigration
 *
 * Runs the localStorage → Supabase migration automatically right after
 * the user logs in for the first time post Supabase activation. Shows a
 * non-blocking toast with the summary.
 *
 * Idempotent: the service tracks per-user+project completion in
 * localStorage, so re-renders / re-logins won't re-upload.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { LocalStorageMigrationService } from "@/services/real/localStorageMigrationService";
import { toast } from "sonner";

export function useLocalStorageMigration(): void {
  const { user, configured } = useAuth();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!configured || !user?.id) return;
    if (ranFor.current === user.id) return;
    if (LocalStorageMigrationService.hasMigrated(user.id)) return;
    ranFor.current = user.id;

    // Defer slightly so the UI is interactive while we upload
    const t = setTimeout(async () => {
      const result = await LocalStorageMigrationService.run(user.id);

      // Compute total uploaded for summary
      const totals = result.uploaded;
      const totalItems =
        totals.players +
        totals.behavioralProfiles +
        totals.attendance +
        totals.engagement +
        totals.questionnaires +
        totals.risks +
        totals.sessions;

      if (totalItems === 0 && result.errors.length === 0) {
        // Nothing to migrate — silent
        return;
      }

      if (totalItems > 0) {
        toast.success(
          `Datos locales sincronizados (${totalItems} elementos)`,
          {
            description: `${totals.players} jugadores · ${totals.behavioralProfiles} perfiles mentales · ${totals.attendance + totals.engagement + totals.questionnaires + totals.risks} bienestar`,
          },
        );
      }

      if (result.errors.length > 0 && !result.errors.every((e) => e.startsWith("already_"))) {
        console.warn("[migration] errors:", result.errors);
        toast.warning("Algunos datos no se pudieron sincronizar", {
          description: "Revisa la consola para detalles · puedes reintentar más tarde",
        });
      }
    }, 1500);

    return () => clearTimeout(t);
  }, [user?.id, configured]);
}
