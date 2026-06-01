/**
 * VITAS · IDPVideoUploadDialog
 *
 * Wrapper específico de IDP sobre `AnalysisVideoUploadDialog` (genérico).
 * Pasa los textos y query keys del módulo IDP.
 */
import { AnalysisVideoUploadDialog } from "@/components/video/AnalysisVideoUploadDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName?: string;
  onAnalysisComplete?: (analysisId: string) => void;
}

export function IDPVideoUploadDialog({
  open,
  onClose,
  playerId,
  playerName,
  onAnalysisComplete,
}: Props) {
  return (
    <AnalysisVideoUploadDialog
      open={open}
      onClose={onClose}
      playerId={playerId}
      playerName={playerName}
      subtitle="Análisis automático · enriquece el plan IDP de"
      helperText="Sube un fragmento de partido (5-15 min idealmente). El sistema extrae VSI técnico, táctico, físico y mental observado, y los inyecta como baseline del próximo plan que generes."
      successDescription="El plan IDP se ha refrescado con los datos del video."
      invalidateKeys={[["idp"]]}
      onAnalysisComplete={onAnalysisComplete}
    />
  );
}
