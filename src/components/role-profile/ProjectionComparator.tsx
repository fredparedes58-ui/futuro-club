import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleProfileData, POSITION_LABELS } from "@/lib/roleProfileData";
import { ArrowRight, TrendingUp } from "lucide-react";

interface Props {
  data: RoleProfileData;
}

export default function ProjectionComparator({ data }: Props) {
  const positions = [...data.positions].sort((a, b) => b.score - a.score);
  const bestNow = positions[0];
  // For "best at 18m" we simulate — in production this comes from projection endpoint
  const bestAt18m = positions[0]; // Same position projected

  const dims = [
    { key: "tactical" as const, label: "Táctica" },
    { key: "technical" as const, label: "Técnica" },
    { key: "physical" as const, label: "Física" },
  ];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Comparador de proyección
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Positions header */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-muted/30 rounded-md">
          <div className="text-center flex-1">
            <p className="text-xs text-muted-foreground mb-1">Mejor posición actual</p>
            <p className="font-display font-bold text-lg">{bestNow.code}</p>
            <p className="text-xs text-muted-foreground">{POSITION_LABELS[bestNow.code]}</p>
            <p className="text-sm font-mono text-primary mt-1">{bestNow.score.toFixed(1)}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <div className="text-center flex-1">
            <p className="text-xs text-muted-foreground mb-1">Proyección 18 meses</p>
            <p className="font-display font-bold text-lg">{bestAt18m.code}</p>
            <p className="text-xs text-muted-foreground">{POSITION_LABELS[bestAt18m.code]}</p>
            <p className="text-sm font-mono text-electric mt-1">
              {(bestAt18m.score + (data.projections["18_36m"].tactical - data.current.tactical) * 0.3 +
                (data.projections["18_36m"].technical - data.current.technical) * 0.4 +
                (data.projections["18_36m"].physical - data.current.physical) * 0.3).toFixed(1)}
            </p>
          </div>
        </div>

        {/* Delta table */}
        <div className="space-y-2">
          {dims.map(({ key, label }) => {
            const now = data.current[key];
            const proj = data.projections["18_36m"][key];
            const delta = proj - now;

            return (
              <div key={key} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-20">{label}</span>
                <span className="font-mono w-12 text-right">{now.toFixed(1)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono w-12 text-right text-electric">{proj.toFixed(1)}</span>
                <span className={`font-mono w-14 text-right ${delta > 0 ? "text-primary" : "text-danger"}`}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                </span>
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/40 rounded-full" style={{ width: `${(delta / 20) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Insight */}
        <div className="mt-4 p-3 bg-primary/5 border border-primary/10 rounded-md">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-primary">Insight:</strong> La mayor evolución esperada es en el eje físico (+{(data.projections["18_36m"].physical - data.current.physical).toFixed(1)} pts), 
            condicionada a completar la ventana de maduración. El eje técnico muestra la base más sólida con menor margen pero mayor certeza.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
