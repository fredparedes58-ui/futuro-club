/**
 * VITAS · IDPVideoUploadDialog
 *
 * Modal que envuelve el `VideoUploader` existente para subir + analizar un
 * video directamente desde el contexto del IDP, sin salir de /idp/:playerId.
 *
 * Cuando el análisis se completa:
 *   1. Invalida `analyses-v2` (TanStack Query) → useIDPArchitectInput refresca
 *   2. Invalida `behavioral-profile` (por si el pipeline generó BPE nuevo)
 *   3. Muestra toast de éxito
 *   4. Cierra el modal
 *
 * El padre puede pasar `onAnalysisComplete` si quiere regenerar el plan
 * inmediatamente con los datos nuevos.
 */
import { useEffect } from "react";
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
  /** Called when analysis completes successfully. Use to trigger plan regenerate. */
  onAnalysisComplete?: (analysisId: string) => void;
}

export function IDPVideoUploadDialog({
  open,
  onClose,
  playerId,
  playerName,
  onAnalysisComplete,
}: Props) {
  const qc = useQueryClient();

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
    // Refresh all data sources that may include this new analysis
    qc.invalidateQueries({ queryKey: ["analyses-v2", playerId] });
    qc.invalidateQueries({ queryKey: ["behavioral-profile", playerId] });
    qc.invalidateQueries({ queryKey: ["injury-risk", playerId] });
    qc.invalidateQueries({ queryKey: ["idp"] });

    toast.success("Análisis completado", {
      description: "El plan IDP se ha refrescado con los datos del video.",
      duration: 5000,
    });

    onAnalysisComplete?.(analysisId);
    // Don't auto-close — let user see the success state in VideoUploader
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
                    Subir vídeo para el Plan IDP
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Análisis automático con IA · enriquece el plan de{" "}
                    <span className="text-cyan-300">{playerName ?? "este jugador"}</span>
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

            {/* Info banner */}
            <div className="px-4 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200/90">
                <Sparkles className="size-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  Sube un fragmento de partido (5-15 min idealmente). El sistema
                  extrae automáticamente VSI técnico, táctico, físico y mental
                  observado, y los inyecta como baseline del próximo plan que generes.
                </div>
              </div>
            </div>

            {/* Uploader */}
            <div className="p-4">
              <VideoUploader
                playerId={playerId}
                playerName={playerName}
                onComplete={handleComplete}
              />
            </div>

            {/* Footer hint */}
            <div className="px-4 pb-4 text-[10px] text-slate-500 text-center">
              El análisis tarda ~2-5 minutos. Puedes cerrar esta ventana y volver
              cuando termine — el plan se actualizará automáticamente.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
