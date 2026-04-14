/**
 * VITAS · SyncContext
 * Exposes useSupabaseSync state globally so OfflineBanner and other
 * components can read sync status without duplicating logic.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useSupabaseSync, type SyncState } from "@/hooks/useSupabaseSync";

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
  return (
    <SyncContext.Provider value={syncState}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncState(): SyncState {
  return useContext(SyncContext);
}
