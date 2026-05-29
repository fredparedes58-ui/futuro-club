/**
 * VITAS · SyncContext
 * Exposes useSupabaseSync state globally so OfflineBanner and other
 * components can read sync status without duplicating logic.
 *
 * Also triggers the one-time localStorage → Supabase migration on first
 * login after Supabase activation (useLocalStorageMigration).
 */
import { createContext, useContext, type ReactNode } from "react";
import { useSupabaseSync, type SyncState } from "@/hooks/useSupabaseSync";
import { useLocalStorageMigration } from "@/hooks/useLocalStorageMigration";

const defaultState: SyncState = {
  syncing: false,
  pending: 0,
  online: true,
  lastSync: null,
  error: null,
};

const SyncContext = createContext<SyncState>(defaultState);

export function SyncProvider({ children }: { children: ReactNode }) {
  const syncState = useSupabaseSync();
  // One-time localStorage → Supabase migration (idempotent per device + user)
  useLocalStorageMigration();
  return (
    <SyncContext.Provider value={syncState}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncState(): SyncState {
  return useContext(SyncContext);
}
