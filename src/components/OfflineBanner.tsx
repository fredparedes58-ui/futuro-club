/**
 * VITAS · Offline Banner
 * Shows a persistent banner when the user loses network connectivity.
 * Displays pending sync count and syncing status via SyncContext.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, CloudOff, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSyncState } from "@/context/SyncContext";

export default function OfflineBanner() {
  const { t } = useTranslation();
  const { online, syncing, pending } = useSyncState();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
    }
    if (online && wasOffline && !syncing) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [online, wasOffline, syncing]);

  return (
    <AnimatePresence>
      {/* ── Offline state ──────────────────────────────────── */}
      {!online && (
        <motion.div
          key="offline"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-display shadow-lg"
        >
          <WifiOff size={14} />
          <span>{t("offline.banner")}</span>
          {pending > 0 && (
            <span className="bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-bold">
              {pending} {pending === 1 ? "cambio pendiente" : "cambios pendientes"}
            </span>
          )}
          <CloudOff size={12} className="opacity-60" />
        </motion.div>
      )}

      {/* ── Syncing after reconnect ────────────────────────── */}
      {online && wasOffline && syncing && (
        <motion.div
          key="syncing"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-display shadow-lg"
        >
          <Loader2 size={14} className="animate-spin" />
          <span>Sincronizando{pending > 0 ? ` ${pending} cambios` : ""}...</span>
        </motion.div>
      )}

      {/* ── Reconnected confirmation ───────────────────────── */}
      {showReconnected && !syncing && (
        <motion.div
          key="reconnected"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-display shadow-lg"
        >
          <Check size={14} />
          <span>{t("offline.reconnected")}</span>
          <RefreshCw size={12} className="opacity-60" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
