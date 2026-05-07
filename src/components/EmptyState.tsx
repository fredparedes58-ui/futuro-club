/**
 * VITAS · EmptyState (Sprint Onboarding · día 3)
 *
 * Componente consistente para "no hay datos todavía". Cero pantallas
 * en blanco · siempre con next-action sugerida.
 *
 * Diseño:
 *   - Icono grande monocromo
 *   - Título corto + descripción 1-2 líneas
 *   - 1 CTA primary + opcional 1 CTA secondary
 *   - Hint educativo opcional al pie
 */

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateAction {
  label: string;
  Icon?: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface EmptyStateProps {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string | ReactNode;
  primary?: EmptyStateAction;
  secondary?: EmptyStateAction;
  hint?: string;
  /** Tamaño · default md */
  size?: "sm" | "md" | "lg";
}

export default function EmptyState({
  Icon, title, description, primary, secondary, hint, size = "md",
}: EmptyStateProps) {
  const iconSize = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  const padding = size === "sm" ? "p-5" : size === "lg" ? "p-10" : "p-8";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl ${padding} text-center space-y-3`}
    >
      <Icon size={iconSize} className="mx-auto text-primary/60" />

      <div className="space-y-1">
        <h3 className="text-sm font-display font-bold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>

      {(primary || secondary) && (
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
          {primary && (
            <button
              onClick={primary.onClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors"
            >
              {primary.Icon ? <primary.Icon size={12} /> : <Sparkles size={12} />}
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-secondary/30 border border-border text-xs font-display font-bold text-foreground hover:border-foreground/30 transition-colors"
            >
              {secondary.Icon ? <secondary.Icon size={12} /> : null}
              {secondary.label}
            </button>
          )}
        </div>
      )}

      {hint && (
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-2 border-t border-border/30 mt-3">
          {hint}
        </p>
      )}
    </motion.div>
  );
}
