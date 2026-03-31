/**
 * VITAS — useSupabaseSync
 *
 * Se ejecuta una vez al hacer login.
 * Pull de jugadores desde Supabase → merge con localStorage → invalida queries.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";

export function useSupabaseSync() {
  const { user, configured } = useAuth();
  const qc = useQueryClient();
  const syncedRef = useRef<string | null>(null); // evita doble sync

  useEffect(() => {
    if (!configured || !user) return;
    if (syncedRef.current === user.id) return; // ya sincronizado para este user
    syncedRef.current = user.id;

    SupabasePlayerService.pullAll(user.id)
      .then(() => {
        // Invalida todas las queries relacionadas con jugadores
        qc.invalidateQueries({ queryKey: ["players-all"] });
        qc.invalidateQueries({ queryKey: ["rankings"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .catch(console.warn);
  }, [user, configured, qc]);
}
