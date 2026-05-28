/**
 * PhvRiskOverlay — PHV growth risk zone indicator
 *
 * Shows a visual indicator of the player's position relative to
 * Peak Height Velocity, highlighting the ±6 month danger zone
 * for growth-related injuries (Osgood-Schlatter, Sever's disease).
 *
 * Sprint 11: Injury Dashboard & Alerts
 */

import { motion } from "framer-motion";
import { Bone, AlertTriangle, TrendingUp, Shield } from "lucide-react";

interface PhvRiskOverlayProps {
  /** PHV offset in years (negative = pre-PHV, 0 = at PHV, positive = post-PHV) */
  phvOffset: number | null;
  /** PHV category */
  phvCategory?: string | null;
  /** Chronological age */
  age?: number | null;
  /** Compact mode */
  compact?: boolean;
}

interface RiskZone {
  label: string;
  color: string;
  bgColor: string;
  description: string;
  icon: React.ElementType;
  risk: "low" | "moderate" | "high" | "critical";
}

function getZone(offset: number | null, category?: string | null): RiskZone {
  if (offset == null) {
    // Fallback by category
    if (category === "circa" || category === "ontime") {
      return {
        label: "En ventana PHV",
        color: "#ef4444",
        bgColor: "bg-red-500/10",
        description: "Riesgo maximo de lesion osea por crecimiento rapido",
        icon: AlertTriangle,
        risk: "critical",
      };
    }
    return {
      label: "PHV desconocido",
      color: "#94a3b8",
      bgColor: "bg-muted/20",
      description: "Registrar mediciones antropometricas para calcular PHV",
      icon: Bone,
      risk: "low",
    };
  }

  const abs = Math.abs(offset);

  if (abs <= 0.5) {
    return {
      label: "Pico PHV",
      color: "#ef4444",
      bgColor: "bg-red-500/10",
      description: "Velocidad de crecimiento maxima. Riesgo critico de apofisitis, Osgood-Schlatter, enfermedad de Sever",
      icon: AlertTriangle,
      risk: "critical",
    };
  }
  if (abs <= 1.0) {
    return {
      label: offset < 0 ? "Pre-PHV cercano" : "Post-PHV reciente",
      color: "#f97316",
      bgColor: "bg-orange-500/10",
      description: offset < 0
        ? "Acercandose al pico de crecimiento. Monitorizar dolor en rodillas y talones"
        : "Crecimiento desacelerandose. Aun vulnerable a lesiones de crecimiento",
      icon: AlertTriangle,
      risk: "high",
    };
  }
  if (abs <= 1.5) {
    return {
      label: offset < 0 ? "Pre-PHV moderado" : "Post-PHV moderado",
      color: "#eab308",
      bgColor: "bg-amber-500/10",
      description: "Zona de riesgo moderado. Mantener monitorizacion regular",
      icon: TrendingUp,
      risk: "moderate",
    };
  }

  return {
    label: offset < 0 ? "Pre-PHV lejano" : "Post-PHV maduro",
    color: "#22c55e",
    bgColor: "bg-emerald-500/10",
    description: offset < 0
      ? "Lejos del pico de crecimiento. Riesgo bajo"
      : "Crecimiento estabilizado. Riesgo bajo de lesion osea",
    icon: Shield,
    risk: "low",
  };
}

export default function PhvRiskOverlay({
  phvOffset,
  phvCategory,
  age,
  compact = false,
}: PhvRiskOverlayProps) {
  const zone = getZone(phvOffset, phvCategory);
  const Icon = zone.icon;

  // Visual position on the gradient bar (maps -3..+3 years to 0..100%)
  const barPosition = phvOffset != null
    ? Math.max(0, Math.min(100, ((phvOffset + 3) / 6) * 100))
    : 50;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: zone.color }} />
        <div>
          <span className="text-[11px] font-medium" style={{ color: zone.color }}>
            {zone.label}
          </span>
          {phvOffset != null && (
            <span className="text-[10px] text-muted-foreground ml-1">
              ({phvOffset > 0 ? "+" : ""}{phvOffset.toFixed(1)} anos)
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${zone.bgColor} border-current/10`}
      style={{ borderColor: `${zone.color}30` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bone size={16} className="text-primary" />
          <h4 className="font-display font-bold text-sm text-foreground">Riesgo PHV</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon size={14} style={{ color: zone.color }} />
          <span className="text-xs font-display font-bold" style={{ color: zone.color }}>
            {zone.label}
          </span>
        </div>
      </div>

      {/* Gradient bar with position marker */}
      <div className="relative">
        <div className="h-3 rounded-full overflow-hidden flex">
          <div className="flex-1 bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-emerald-500/30 relative">
            {/* Danger zone overlay */}
            <div
              className="absolute top-0 bottom-0 bg-red-500/30 rounded"
              style={{ left: "33.3%", right: "33.3%" }}
            />
          </div>
        </div>

        {/* Position marker */}
        {phvOffset != null && (
          <motion.div
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${barPosition}%` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <div
              className="w-3 h-3 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: zone.color }}
            />
          </motion.div>
        )}

        {/* Labels */}
        <div className="flex justify-between mt-1">
          <span className="text-[8px] text-muted-foreground">-3 anos</span>
          <span className="text-[8px] text-red-500 font-bold">PHV</span>
          <span className="text-[8px] text-muted-foreground">+3 anos</span>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5">
        {phvOffset != null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Offset PHV:</span>
            <span className="text-xs font-display font-bold text-foreground">
              {phvOffset > 0 ? "+" : ""}{phvOffset.toFixed(1)} anos
            </span>
          </div>
        )}
        {age != null && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Edad:</span>
            <span className="text-xs text-foreground">{age} anos</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {zone.description}
        </p>
      </div>

      {/* Critical alert */}
      {zone.risk === "critical" && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-red-600 dark:text-red-400">
              Protocolo de proteccion activo
            </p>
            <p className="text-[9px] text-red-500/70">
              Limitar sprints maximos, saltos repetitivos, y cambios de direccion bruscos.
              Priorizar trabajo tecnico sobre fisico.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
