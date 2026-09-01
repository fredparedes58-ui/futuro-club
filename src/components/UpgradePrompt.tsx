/**
 * UpgradePrompt — Reusable modal/banner for blocked features
 *
 * Shows which feature is blocked, what plan is needed, and a CTA
 * to contact admin for upgrade (no Stripe).
 *
 * Fase 3: SaaS without Stripe.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Zap, Lock, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_LABELS, type Plan } from "@/services/real/subscriptionService";

interface UpgradePromptProps {
  /** Feature that is blocked (e.g., "Analisis IA", "VAEP", "Team Mode") */
  feature: string;
  /** Minimum plan required to access this feature */
  requiredPlan: Plan;
  /** Current usage info (optional, e.g., "3/3 analisis usados") */
  currentUsage?: string;
  /** Whether to show as modal overlay or inline banner */
  variant?: "modal" | "banner" | "overlay";
  /** Called when user dismisses the prompt */
  onClose?: () => void;
  /** Whether the prompt is visible */
  open?: boolean;
}

const PLAN_GRADIENT: Record<Plan, string> = {
  free: "from-muted-foreground to-muted-foreground",
  pro: "from-primary to-blue-500",
  club: "from-electric to-purple-500",
};

export default function UpgradePrompt({
  feature,
  requiredPlan,
  currentUsage,
  variant = "banner",
  onClose,
  open = true,
}: UpgradePromptProps) {
  if (!open) return null;

  const planLabel = PLAN_LABELS[requiredPlan];

  // ── Overlay variant (for blurred content) ─────────────────────
  if (variant === "overlay") {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
        <div className="text-center space-y-3 px-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto">
            <Lock size={18} className="text-primary" />
          </div>
          <p className="font-display font-bold text-sm text-foreground">{feature}</p>
          <p className="text-xs text-muted-foreground">
            Disponible en plan <span className="font-bold text-primary">{planLabel}</span>
          </p>
          <a
            href="mailto:Contact@krujens.eu?subject=VITAS%20Upgrade%20Request"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs hover:bg-primary/90 transition-colors"
          >
            <Mail size={11} />
            Solicitar upgrade
          </a>
        </div>
      </div>
    );
  }

  // ── Modal variant ─────────────────────────────────────────────
  if (variant === "modal") {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass rounded-2xl p-6 max-w-sm w-full space-y-4 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {onClose && (
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"
                >
                  <X size={14} />
                </button>
              )}

              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-electric/20 border border-primary/30 flex items-center justify-center mx-auto">
                <Zap size={22} className="text-primary" />
              </div>

              <div className="text-center">
                <h3 className="font-display font-bold text-lg text-foreground mb-1">
                  {feature}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Esta funcionalidad requiere plan{" "}
                  <span className={`font-bold bg-gradient-to-r ${PLAN_GRADIENT[requiredPlan]} bg-clip-text text-transparent`}>
                    {planLabel}
                  </span>
                </p>
                {currentUsage && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Uso actual: {currentUsage}
                  </p>
                )}
              </div>

              <a
                href="mailto:Contact@krujens.eu?subject=VITAS%20Upgrade%20Request"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-blue-500 text-white font-display font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Mail size={14} />
                Contactar para upgrade
              </a>

              {onClose && (
                <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
                  Ahora no
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Banner variant (default) ──────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-3 border border-primary/20 bg-primary/5"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Lock size={14} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-display font-semibold text-foreground">
            {feature} · Plan {planLabel}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {currentUsage ?? `Upgrade a ${planLabel} para desbloquear`}
          </p>
        </div>
        <a
          href="mailto:Contact@krujens.eu?subject=VITAS%20Upgrade%20Request"
          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-[10px] hover:bg-primary/90 transition-colors"
        >
          Upgrade
        </a>
        {onClose && (
          <button onClick={onClose} className="shrink-0 p-1 text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
