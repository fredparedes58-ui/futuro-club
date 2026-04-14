/**
 * FeatureHint — Tooltip contextual que aparece UNA vez en primera visita.
 * Usa localStorage para recordar qué hints ya se mostraron.
 * Se auto-cierra tras 6 segundos o al hacer click.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X } from "lucide-react";

// ── Storage ─────────────────────────────────────────────────────────────────

const HINTS_KEY = "feature_hints_seen";

function getSeenHints(): Set<string> {
  try {
    const raw = localStorage.getItem(HINTS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markHintSeen(id: string): void {
  try {
    const seen = getSeenHints();
    seen.add(id);
    localStorage.setItem(HINTS_KEY, JSON.stringify([...seen]));
  } catch { /* silent */ }
}

// ── Componente ──────────────────────────────────────────────────────────────

interface FeatureHintProps {
  id: string;
  message: string;
  /** Delay en ms antes de mostrar el hint. Default: 1000 */
  delay?: number;
  /** Duración visible en ms antes de auto-hide. Default: 6000 */
  duration?: number;
  /** Posición relativa. Default: "bottom" */
  position?: "top" | "bottom";
}

export default function FeatureHint({
  id,
  message,
  delay = 1000,
  duration = 6000,
  position = "bottom",
}: FeatureHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = getSeenHints();
    if (seen.has(id)) return;

    const showTimer = setTimeout(() => setVisible(true), delay);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      markHintSeen(id);
    }, delay + duration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [id, delay, duration]);

  const handleDismiss = () => {
    setVisible(false);
    markHintSeen(id);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: position === "bottom" ? -4 : 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === "bottom" ? -4 : 4, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`absolute ${
            position === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          } left-1/2 -translate-x-1/2 z-50 w-max max-w-[260px]`}
        >
          <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 shadow-lg flex items-start gap-2">
            <Lightbulb size={12} className="shrink-0 mt-0.5 opacity-80" />
            <p className="text-[11px] font-display leading-snug">{message}</p>
            <button onClick={handleDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <X size={10} />
            </button>
          </div>
          {/* Arrow */}
          <div className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rotate-45 ${
            position === "bottom" ? "-top-1" : "-bottom-1"
          }`} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Helper: resetear hints (para testing / settings) ────────────────────────

export function resetAllHints(): void {
  try {
    localStorage.removeItem(HINTS_KEY);
  } catch { /* silent */ }
}

export { getSeenHints, markHintSeen };
