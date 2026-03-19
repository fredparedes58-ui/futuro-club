import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { EvidenceIndicator, ARCHETYPE_LABELS, POSITION_LABELS, getPhaseLabel, getConfidenceColor, ArchetypeCode, PositionCode } from "@/lib/roleProfileData";

interface Props {
  indicator: EvidenceIndicator | null;
  open: boolean;
  onClose: () => void;
}

export default function EvidenceDrawer({ indicator, open, onClose }: Props) {
  if (!indicator) return null;

  const impactColor = indicator.impact === "positivo" ? "text-primary" : indicator.impact === "negativo" ? "text-danger" : "text-muted-foreground";

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b border-border pb-4">
          <DrawerTitle className="font-display text-xl">{indicator.label}</DrawerTitle>
          <DrawerDescription className="text-muted-foreground">
            Detalle de evidencia — <span className="font-mono">{indicator.indicator}</span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox label="Valor bruto" value={String(indicator.raw_value)} />
            <MetricBox label="Score normalizado" value={String(indicator.normalized)} color={indicator.normalized >= 70 ? "text-primary" : "text-electric"} />
            <MetricBox label="Fiabilidad" value={`${Math.round(indicator.reliability * 100)}%`} color={getConfidenceColor(indicator.reliability)} />
            <MetricBox label="Contribución" value={`${indicator.contribution > 0 ? "+" : ""}${indicator.contribution.toFixed(2)}`} color={impactColor} />
          </div>

          {/* Phase & Impact */}
          <div className="flex gap-3">
            <Badge variant="outline">{getPhaseLabel(indicator.phase_of_play)}</Badge>
            <Badge variant="outline" className={impactColor}>
              Impacto {indicator.impact}
            </Badge>
          </div>

          {/* Explanation */}
          <div className="p-4 bg-muted/30 rounded-md">
            <p className="text-sm leading-relaxed">{indicator.explanation}</p>
          </div>

          {/* Positions impacted */}
          <div>
            <h4 className="text-sm font-display font-semibold mb-2">Posiciones impactadas</h4>
            <div className="flex flex-wrap gap-2">
              {indicator.positions_impacted.map(p => (
                <span key={p} className="px-2 py-1 bg-muted rounded text-sm font-mono">
                  {p} — {POSITION_LABELS[p as PositionCode]}
                </span>
              ))}
            </div>
          </div>

          {/* Archetypes impacted */}
          <div>
            <h4 className="text-sm font-display font-semibold mb-2">Arquetipos impactados</h4>
            <div className="flex flex-wrap gap-2">
              {indicator.archetypes_impacted.map(a => (
                <span key={a} className="px-2 py-1 bg-muted rounded text-sm">
                  {ARCHETYPE_LABELS[a as ArchetypeCode]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MetricBox({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 bg-muted/30 rounded-md">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-display font-bold ${color}`}>{value}</p>
    </div>
  );
}
