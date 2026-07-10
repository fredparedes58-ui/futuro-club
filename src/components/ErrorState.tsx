/**
 * VITAS · ErrorState
 *
 * Estado explícito de "algo falló al cargar" — distinto del EmptyState de
 * "todavía no hay datos". Cuando una query falla (isError) no debemos pintar
 * el vacío (que sugiere "no hay nada" cuando en realidad hubo un error de red
 * o servidor); mostramos este componente con un botón de reintento.
 */

import { motion } from "framer-motion";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface ErrorStateProps {
  /** Título opcional (default: i18n errorState.title). */
  title?: string;
  /** Descripción opcional (default: i18n errorState.description). */
  description?: string;
  /** Handler de reintento; si se omite, no se muestra el botón. */
  onRetry?: () => void;
  /** Texto del botón (default: i18n errorState.retry). */
  retryLabel?: string;
  /** Tamaño · default md */
  size?: "sm" | "md" | "lg";
}

export default function ErrorState({ title, description, onRetry, retryLabel, size = "md" }: ErrorStateProps) {
  const { t } = useTranslation();
  const iconSize = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  const padding = size === "sm" ? "p-5" : size === "lg" ? "p-10" : "p-8";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl ${padding} text-center space-y-3 border border-rose-500/20`}
    >
      <AlertTriangle size={iconSize} className="mx-auto text-rose-400/80" />

      <div className="space-y-1">
        <h3 className="text-sm font-display font-bold text-foreground">
          {title ?? t("errorState.title")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {description ?? t("errorState.description")}
        </p>
      </div>

      {onRetry && (
        <div className="flex justify-center pt-1">
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-secondary/30 border border-border text-xs font-display font-bold text-foreground hover:border-foreground/30 transition-colors"
          >
            <RotateCw size={12} />
            {retryLabel ?? t("errorState.retry")}
          </button>
        </div>
      )}
    </motion.div>
  );
}
