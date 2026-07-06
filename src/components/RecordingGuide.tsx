/**
 * VITAS · Recording Guide
 *
 * Modal con consejos visuales para grabar video de calidad.
 * Aparece ANTES de subir video (primera vez o si el usuario lo pide).
 * Ayuda al coach a entender qué ángulo, distancia y condiciones
 * producen un análisis más preciso.
 *
 * Persistencia: "vitas_recording_guide_seen" en localStorage.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Check, ChevronRight, ChevronLeft } from "lucide-react";

const SEEN_KEY = "vitas_recording_guide_seen";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si true, no muestra el checkbox "no volver a mostrar" */
  forced?: boolean;
}

interface Tip {
  key: string;
  icon: string;
  color: string;
}

const TIPS: Tip[] = [
  { key: "cameraAngle", icon: "📐", color: "#22c55e" },
  { key: "distanceFraming", icon: "📏", color: "#3b82f6" },
  { key: "stability", icon: "📱", color: "#f59e0b" },
  { key: "lighting", icon: "☀️", color: "#ef4444" },
  { key: "duration", icon: "⏱️", color: "#8b5cf6" },
];

export default function RecordingGuide({ open, onClose, forced }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* */ }
    }
    setIndex(0);
    onClose();
  };

  const tip = TIPS[index];
  const isLast = index === TIPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ y: 20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.95 }}
            className="glass rounded-3xl p-5 max-w-md w-full space-y-4 border border-border/50 relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-primary" />
                <h2 className="font-display font-bold text-sm text-foreground">
                  {t("recordingGuide.title")}
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tip content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Icon + title */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${tip.color}15`, border: `1px solid ${tip.color}30` }}
                  >
                    {tip.icon}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-foreground">{t(`recordingGuide.tips.${tip.key}.title`)}</h3>
                    <span
                      className="text-[10px] uppercase tracking-wider font-bold"
                      style={{ color: tip.color }}
                    >
                      {t("recordingGuide.stepCounter", { current: index + 1, total: TIPS.length })}
                    </span>
                  </div>
                </div>

                {/* Good */}
                <div className="flex gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <span className="text-green-400 text-sm mt-0.5 shrink-0">✅</span>
                  <p className="text-xs text-foreground/90 leading-relaxed">{t(`recordingGuide.tips.${tip.key}.good`)}</p>
                </div>

                {/* Bad */}
                <div className="flex gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span className="text-red-400 text-sm mt-0.5 shrink-0">❌</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(`recordingGuide.tips.${tip.key}.bad`)}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5">
              {TIPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-6" : "w-1.5 bg-secondary hover:bg-foreground/30"
                  }`}
                  style={i === index ? { backgroundColor: tip.color } : undefined}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIndex(i => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={12} /> {t("recordingGuide.previous")}
              </button>

              {isLast ? (
                <button
                  onClick={handleClose}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors"
                >
                  <Check size={12} /> {t("recordingGuide.understood")}
                </button>
              ) : (
                <button
                  onClick={() => setIndex(i => Math.min(TIPS.length - 1, i + 1))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-foreground font-bold hover:text-primary transition-colors"
                >
                  {t("recordingGuide.next")} <ChevronRight size={12} />
                </button>
              )}
            </div>

            {/* Don't show again */}
            {!forced && (
              <label className="flex items-center gap-2 justify-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={e => setDontShowAgain(e.target.checked)}
                  className="w-3 h-3 rounded border-border accent-primary"
                />
                <span className="text-[10px] text-muted-foreground">
                  {t("recordingGuide.dontShowAgain")}
                </span>
              </label>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Hook: returns whether the guide should auto-show before upload */
export function useRecordingGuideNeeded(): boolean {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    try {
      setNeeded(!localStorage.getItem(SEEN_KEY));
    } catch { /* */ }
  }, []);
  return needed;
}
