import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleProfileData, IdentityType } from "@/lib/roleProfileData";

const IDENTITY_LABELS: Record<IdentityType, string> = {
  ofensivo: "Ofensivo",
  defensivo: "Defensivo",
  tecnico: "Técnico",
  fisico: "Físico",
  mixto: "Mixto",
};

const IDENTITY_COLORS: Record<IdentityType, string> = {
  ofensivo: "bg-danger/20 text-danger",
  defensivo: "bg-electric/20 text-electric",
  tecnico: "bg-primary/20 text-primary",
  fisico: "bg-gold/20 text-gold",
  mixto: "bg-muted text-muted-foreground",
};

interface Props {
  data: RoleProfileData;
}

export default function IdentityCard({ data }: Props) {
  const { identity } = data;
  const sorted = Object.entries(identity.distribution)
    .sort(([, a], [, b]) => b - a) as [IdentityType, number][];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display">Identidad del jugador</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dominant chip */}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-md text-sm font-semibold ${IDENTITY_COLORS[identity.dominant]}`}>
            {IDENTITY_LABELS[identity.dominant]}
          </span>
          <span className="text-xs text-muted-foreground">— identidad dominante</span>
        </div>

        {/* Distribution bars */}
        <div className="space-y-2">
          {sorted.map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20 text-right">{IDENTITY_LABELS[key]}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${key === identity.dominant ? "bg-primary" : "bg-muted-foreground/40"}`}
                  style={{ width: `${Math.round(value * 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-foreground w-10">{Math.round(value * 100)}%</span>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
          {identity.explanation}
        </p>
      </CardContent>
    </Card>
  );
}
