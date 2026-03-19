import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleProfileData, getConfidenceColor } from "@/lib/roleProfileData";
import { CheckCircle2, AlertTriangle, Target, BookOpen } from "lucide-react";

interface Props {
  data: RoleProfileData;
}

export default function StrengthsRisksPanel({ data }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Strengths */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Fortalezas verificadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.strengths.map((s, i) => (
            <div key={i} className="px-3 py-2 rounded-md bg-muted/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.label}</span>
                <span className={`text-xs font-mono ${getConfidenceColor(s.confidence)}`}>
                  {Math.round(s.confidence * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{s.evidence}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Risks */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold" />
            Riesgos de interpretación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.risks.map((r, i) => (
            <div key={i} className="px-3 py-2 rounded-md bg-gold/5 border border-gold/10 space-y-1">
              <span className="text-sm font-medium text-gold">{r.label}</span>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Gaps */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Target className="w-4 h-4 text-electric" />
            Gaps de desarrollo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.gaps.map((g, i) => {
            const prioColor = g.priority === "alta" ? "text-danger" : g.priority === "media" ? "text-gold" : "text-muted-foreground";
            return (
              <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-md bg-muted/30">
                <span className={`text-xs font-mono uppercase mt-0.5 ${prioColor}`}>{g.priority}</span>
                <div>
                  <p className="text-sm">{g.label}</p>
                  <div className="flex gap-1 mt-1">
                    {g.relatedPositions.map(p => (
                      <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Consolidation */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            Para consolidar el rol
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.consolidation_notes.map((note, i) => (
            <div key={i} className="flex gap-2 px-3 py-2 rounded-md bg-muted/30">
              <span className="text-xs text-muted-foreground mt-0.5">{i + 1}.</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{note}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
