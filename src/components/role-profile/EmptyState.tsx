import { FileX, AlertTriangle, Wifi, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  type: "no-data" | "low-confidence" | "missing-tracking" | "missing-drill" | "phv-unavailable" | "partial-data" | "agent-unavailable";
  onAction?: () => void;
  actionLabel?: string;
}

const CONFIG: Record<Props["type"], { icon: typeof FileX; titleKey: string; descriptionKey: string; color: string }> = {
  "agent-unavailable": {
    icon: Video,
    titleKey: "roleEmptyState.agentUnavailableTitle",
    descriptionKey: "roleEmptyState.agentUnavailableDescription",
    color: "text-primary",
  },
  "no-data": {
    icon: FileX,
    titleKey: "roleEmptyState.noDataTitle",
    descriptionKey: "roleEmptyState.noDataDescription",
    color: "text-muted-foreground",
  },
  "low-confidence": {
    icon: AlertTriangle,
    titleKey: "roleEmptyState.lowConfidenceTitle",
    descriptionKey: "roleEmptyState.lowConfidenceDescription",
    color: "text-gold",
  },
  "missing-tracking": {
    icon: Wifi,
    titleKey: "roleEmptyState.missingTrackingTitle",
    descriptionKey: "roleEmptyState.missingTrackingDescription",
    color: "text-gold",
  },
  "missing-drill": {
    icon: FileX,
    titleKey: "roleEmptyState.missingDrillTitle",
    descriptionKey: "roleEmptyState.missingDrillDescription",
    color: "text-muted-foreground",
  },
  "phv-unavailable": {
    icon: AlertTriangle,
    titleKey: "roleEmptyState.phvUnavailableTitle",
    descriptionKey: "roleEmptyState.phvUnavailableDescription",
    color: "text-danger",
  },
  "partial-data": {
    icon: AlertTriangle,
    titleKey: "roleEmptyState.partialDataTitle",
    descriptionKey: "roleEmptyState.partialDataDescription",
    color: "text-gold",
  },
};

export default function EmptyState({ type, onAction, actionLabel }: Props) {
  const { t } = useTranslation();
  const { icon: Icon, titleKey, descriptionKey, color } = CONFIG[type];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4`}>
        <Icon className={`w-7 h-7 ${color}`} />
      </div>
      <h3 className="font-display text-lg font-bold mb-2">{t(titleKey)}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4 leading-relaxed">{t(descriptionKey)}</p>
      {onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel || t("roleEmptyState.retry")}
        </Button>
      )}
    </div>
  );
}
