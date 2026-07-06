/**
 * VITAS · IDPVideoUploadDialog
 *
 * Wrapper específico de IDP sobre `AnalysisVideoUploadDialog` (genérico).
 * Pasa los textos y query keys del módulo IDP.
 */
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <AnalysisVideoUploadDialog
      open={open}
      onClose={onClose}
      playerId={playerId}
      playerName={playerName}
      subtitle={t("idpVideoUploadDialog.subtitle")}
      helperText={t("idpVideoUploadDialog.helperText")}
      successDescription={t("idpVideoUploadDialog.successDescription")}
      invalidateKeys={[["idp"]]}
      onAnalysisComplete={onAnalysisComplete}
    />
  );
}
