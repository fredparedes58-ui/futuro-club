/**
 * VITAS · AnalysisVideoUploadDialog
 *
 * Modal genérico que envuelve `VideoUploader` para subir + analizar un video
 * sin salir del contexto actual (IDP, Tactical, etc).
 *
 * Cuando el análisis se completa, invalida las queries que pasa el caller
 * vía `invalidateKeys` y emite `onAnalysisComplete`.
 *
 * Reusable entre módulos: IDP usa este con keys `["analyses-v2", playerId]`,
 * Tactical usa este con keys `["tactical-heatmap", matchId]`, etc.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { X, Video, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VideoUploader } from "@/components/video/VideoUploader";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName?: string;
  /** Header subtitle shown under the title. Default: "Análisis automático con IA". */
  subtitle?: string;
  /** Optional informational message shown above the uploader. */
  helperText?: string;
  /** Toast description on success. */
  successDescription?: string;
  /**
   * Query keys to invalidate when analysis completes. Each key is passed
   * verbatim to TanStack Query's `invalidateQueries`.
   */
  invalidateKeys?: ReadonlyArray<ReadonlyArray<string>>;
  /** Called with the analysis ID once analysis finishes. */
  onAnalysisComplete?: (analysisId: string) => void;
}

export function AnalysisVideoUploadDialog({
  open,
  onClose,
  playerId,
  playerName,
  subtitle,
  helperText,
  successDescription,
  invalidateKeys,
  onAnalysisComplete,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const resolvedSubtitle =
    subtitle ?? t("analysisVideoUploadDialog.defaultSubtitle");
  const resolvedSuccessDescription =
    successDescription ?? t("analysisVideoUploadDialog.defaultSuccessDescription");

  // Lock body scroll while modal open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // ESC key closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleComplete(analysisId: string) {
    // Always invalidate the universal analyses query
    qc.invalidateQueries({ queryKey: ["analyses-v2", playerId] });
    qc.invalidateQueries({ queryKey: ["behavioral-profile", playerId] });
    qc.invalidateQueries({ queryKey: ["injury-risk", playerId] });

    // Plus any caller-supplied keys
    for (const key of invalidateKeys ?? []) {
      qc.invalidateQueries({ queryKey: [...key] });
    }

    toast.success(t("analysisVideoUploadDialog.toastSuccessTitle"), {
      description: resolvedSuccessDescription,
      duration: 5000,
    });

    onAnalysisComplete?.(analysisId);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur p-4 border-b border-white/5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 shrink-0">
                  <Video className="size-4 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    {t("analysisVideoUploadDialog.title")}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {resolvedSubtitle} ·{" "}
                    <span className="text-cyan-300">{playerName ?? t("analysisVideoUploadDialog.thisPlayer")}</span>
                  </p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="shrink-0"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Optional helper text */}
            {helperText && (
              <div className="px-4 pt-4">
                <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200/90">
                  <Sparkles className="size-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>{helperText}</div>
                </div>
              </div>
            )}

            {/* Uploader */}
            <div className="p-4">
              <VideoUploader
                playerId={playerId}
                playerName={playerName}
                onComplete={handleComplete}
              />
            </div>

            <div className="px-4 pb-4 text-[10px] text-slate-500 text-center">
              {t("analysisVideoUploadDialog.durationHint")}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
