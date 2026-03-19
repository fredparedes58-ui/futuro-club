import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleProfileData, getConfidenceLabel, getConfidenceColor } from "@/lib/roleProfileData";
import { Brain, Crosshair, Zap } from "lucide-react";

interface Props {
  data: RoleProfileData;
}

const DIMS = [
  { key: "tactical" as const, label: "Táctica", icon: Brain, description: "Lectura de juego, posicionamiento, decisiones" },
  { key: "technical" as const, label: "Técnica", icon: Crosshair, description: "Control, pase, tiro, regate" },
  { key: "physical" as const, label: "Física", icon: Zap, description: "Velocidad, resistencia, fuerza, agilidad" },
];

export default function CapabilityCards({ data }: Props) {
  const { current, projections } = data;

  // Estimate confidence per dimension based on evidence reliability
  const dimConfidence = {
    tactical: 0.78,
    technical: 0.80,
    physical: 0.55,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {DIMS.map(({ key, label, icon: Icon, description }) => {
        const conf = dimConfidence[key];
        const confColor = getConfidenceColor(conf);

        return (
          <Card key={key} className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {label}
                </CardTitle>
                <span className={`text-xs font-mono ${confColor}`}>
                  {getConfidenceLabel(conf)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Current */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Actual</span>
                  <span className="text-2xl font-display font-bold">{current[key].toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${current[key]}%` }} />
                </div>
              </div>

              {/* Projections */}
              <div className="space-y-1.5 border-t border-border pt-2">
                {([
                  ["0_6m", "0–6m"],
                  ["6_18m", "6–18m"],
                  ["18_36m", "18–36m"],
                ] as const).map(([pKey, pLabel]) => {
                  const val = projections[pKey][key];
                  const delta = val - current[key];
                  return (
                    <div key={pKey} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground w-14">{pLabel}</span>
                      <div className="flex-1 mx-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-electric/60 rounded-full" style={{ width: `${val}%` }} />
                      </div>
                      <span className="font-mono w-12 text-right">{val.toFixed(1)}</span>
                      <span className={`font-mono w-12 text-right ${delta > 0 ? "text-primary" : "text-danger"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
