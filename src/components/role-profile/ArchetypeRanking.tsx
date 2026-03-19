import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleProfileData, ARCHETYPE_LABELS, getConfidenceColor, getStabilityLabel } from "@/lib/roleProfileData";
import { Layers } from "lucide-react";

interface Props {
  data: RoleProfileData;
}

const STABILITY_COLORS: Record<string, string> = {
  emergente: "border-gold/30 text-gold",
  en_desarrollo: "border-electric/30 text-electric",
  estable: "border-primary/30 text-primary",
  consolidado: "border-primary text-primary",
};

export default function ArchetypeRanking({ data }: Props) {
  const archetypes = [...data.archetypes].sort((a, b) => b.score - a.score);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Arquetipos compatibles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {archetypes.map((arch, i) => {
            const confColor = getConfidenceColor(arch.confidence);
            const stabColor = STABILITY_COLORS[arch.stability] || "border-muted text-muted-foreground";

            return (
              <div
                key={arch.code}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>

                <span className="font-display font-semibold text-sm flex-shrink-0 w-44">
                  {ARCHETYPE_LABELS[arch.code]}
                </span>

                {/* Score */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-electric rounded-full" style={{ width: `${arch.score}%` }} />
                  </div>
                  <span className="text-xs font-mono w-10 text-right">{arch.score.toFixed(1)}</span>
                </div>

                {/* Confidence */}
                <span className={`text-xs font-mono w-10 text-right ${confColor}`}>
                  {Math.round(arch.confidence * 100)}%
                </span>

                {/* Stability */}
                <Badge variant="outline" className={`text-xs ${stabColor} w-24 justify-center`}>
                  {getStabilityLabel(arch.stability)}
                </Badge>

                {/* Positions */}
                <div className="flex gap-1 w-28 flex-shrink-0">
                  {arch.positions?.map(p => (
                    <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
