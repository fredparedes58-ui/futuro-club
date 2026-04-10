import { FileX, AlertTriangle, Wifi, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  type: "no-data" | "low-confidence" | "missing-tracking" | "missing-drill" | "phv-unavailable" | "partial-data" | "agent-unavailable";
  onAction?: () => void;
  actionLabel?: string;
}

const CONFIG: Record<Props["type"], { icon: typeof FileX; title: string; description: string; color: string }> = {
  "agent-unavailable": {
    icon: Video,
    title: "Análisis no disponible",
    description: "El perfil de rol táctico se genera mediante análisis de IA a partir de videos del jugador. Sube un video desde el perfil del jugador para generar este informe con datos reales.",
    color: "text-primary",
  },
  "no-data": {
    icon: FileX,
    title: "Sin datos de perfil",
    description: "No hay datos disponibles para generar el perfil de rol. Asegúrate de que el jugador tiene minutos registrados y métricas cargadas.",
    color: "text-muted-foreground",
  },
  "low-confidence": {
    icon: AlertTriangle,
    title: "Confianza insuficiente",
    description: "Los datos disponibles no alcanzan el umbral mínimo de confianza para generar recomendaciones fiables. Se requieren más minutos o mayor cobertura de tracking.",
    color: "text-gold",
  },
  "missing-tracking": {
    icon: Wifi,
    title: "Sin datos de tracking/GPS",
    description: "Este jugador no tiene cobertura GPS. Las métricas físicas y de intensidad no están disponibles, lo que limita significativamente la evaluación de proyección física.",
    color: "text-gold",
  },
  "missing-drill": {
    icon: FileX,
    title: "Sin drills registrados",
    description: "No se han completado drills individuales. Las métricas técnicas y de biomecánica están basadas únicamente en datos de partido.",
    color: "text-muted-foreground",
  },
  "phv-unavailable": {
    icon: AlertTriangle,
    title: "PHV no disponible",
    description: "Los datos antropométricos no están actualizados. Las proyecciones físicas y los ajustes por maduración no son fiables hasta completar la medición PHV.",
    color: "text-danger",
  },
  "partial-data": {
    icon: AlertTriangle,
    title: "Datos parciales",
    description: "Solo se dispone de datos parciales. Algunos indicadores pueden estar infrarepresentados o tener fiabilidad reducida.",
    color: "text-gold",
  },
};

export default function EmptyState({ type, onAction, actionLabel }: Props) {
  const { icon: Icon, title, description, color } = CONFIG[type];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4`}>
        <Icon className={`w-7 h-7 ${color}`} />
      </div>
      <h3 className="font-display text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4 leading-relaxed">{description}</p>
      {onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel || "Reintentar"}
        </Button>
      )}
    </div>
  );
}
