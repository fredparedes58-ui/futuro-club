/**
 * VITAS — useSupabaseSync
 * Pull de jugadores Y videos desde Supabase al hacer login.
 * También escucha el evento 'online' para push de datos creados offline.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";

export function useSupabaseSync() {
  const { user, configured } = useAuth();
  const qc = useQueryClient();
  const syncedRef = useRef<string | null>(null);
  const prevUserRef = useRef<string | null>(null);

  // ── Pull on login ──────────────────────────────────────────────────
  useEffect(() => {
    if (!configured) return;

    if (!user) {
      // Only reset if we HAD a user before (actual logout)
      if (prevUserRef.current !== null) {
        syncedRef.current = null;
        prevUserRef.current = null;
      }
      return;
    }

    prevUserRef.current = user.id;
    if (syncedRef.current === user.id) return;
    syncedRef.current = user.id;

    Promise.all([
      SupabasePlayerService.pullAll(user.id),
      SupabaseVideoService.pullAll(user.id),
    ]).then(() => {
      qc.invalidateQueries({ queryKey: ["players-all"] });
      qc.invalidateQueries({ queryKey: ["rankings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    }).catch(console.warn);
  }, [user, configured, qc]);

  // ── Push on reconnect (offline → online) ──────────────────────────
  useEffect(() => {
    if (!configured) return;

    const handleOnline = () => {
      if (!user) return;
      Promise.all([
        SupabasePlayerService.pushAll(user.id),
        SupabaseVideoService.pushAll(user.id),
      ]).then(() => {
        qc.invalidateQueries({ queryKey: ["players-all"] });
        qc.invalidateQueries({ queryKey: ["videos"] });
      }).catch(console.warn);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user, configured, qc]);
}
