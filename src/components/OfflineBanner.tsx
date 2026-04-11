/**
 * VITAS · Offline Banner
 * Shows a persistent banner when the user loses network connectivity.
 * Displays sync queue status and auto-hides when back online.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (wasOffline) {
        // Brief "reconnected" message
        setTimeout(() => setWasOffline(false), 3000);
      }
    };
    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [wasOffline]);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-display shadow-lg"
        >
          <WifiOff size={14} />
          <span>{t("offline.banner")}</span>
          <CloudOff size={12} className="opacity-60" />
        </motion.div>
      )}
      {!isOffline && wasOffline && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-display shadow-lg"
        >
          <RefreshCw size={14} className="animate-spin" />
          <span>{t("offline.reconnected")}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
