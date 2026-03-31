import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleProfileData, POSITION_LABELS, getConfidenceLabel, getConfidenceColor } from "@/lib/roleProfileData";
import { MapPin } from "lucide-react";
import type { RoleProfileFilters } from "@/components/role-profile/RoleProfileFilterBar";

interface Props {
  data: RoleProfileData;
  filters?: RoleProfileFilters | null;
}

export default function PositionFitRanking({ data, filters }: Props) {
  const allPositions = [...data.positions].sort((a, b) => b.score - a.score);
  const positions = filters?.currentPosition && filters.currentPosition !== "all"
    ? allPositions.filter(p => p.code === filters.currentPosition)
    : allPositions;
  const top1 = positions[0];
  const top2 = positions[1];
  const isDualFit = top1 && top2 && (top1.score - top2.score) < 5;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Ajuste por posición
          </CardTitle>
          {isDualFit && (
            <Badge variant="outline" className="text-gold border-gold/30 text-xs">
              Dual-fit detectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {positions.map((pos, i) => {
            const isTop3 = i < 3;
            const confColor = getConfidenceColor(pos.confidence);

            return (
              <div
                key={pos.code}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isTop3 ? "bg-muted/50" : "hover:bg-muted/30"
                }`}
              >
                {/* Rank */}
                <span className={`text-xs font-mono w-5 ${isTop3 ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {i + 1}
                </span>

                {/* Position code */}
                <span className={`font-display font-bold text-sm w-10 ${isTop3 ? "text-foreground" : "text-muted-foreground"}`}>
                  {pos.code}
                </span>

                {/* Position name */}
                <span className="text-xs text-muted-foreground w-36 hidden lg:block">
                  {POSITION_LABELS[pos.code]}
                </span>

                {/* Score bar */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isTop3 ? "bg-primary" : "bg-muted-foreground/40"}`}
                      style={{ width: `${pos.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">{pos.score.toFixed(1)}</span>
                </div>

                {/* Prob */}
                <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                  {Math.round(pos.prob * 100)}%
                </span>

                {/* Confidence */}
                <span className={`text-xs font-mono w-12 text-right ${confColor}`}>
                  {Math.round(pos.confidence * 100)}%
                </span>

                {/* Reason - only top 3 */}
                {isTop3 && (
                  <span className="text-xs text-muted-foreground w-64 hidden xl:block truncate">
                    {pos.reason}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          <span>Score</span>
          <span>Prob.</span>
          <span>Conf.</span>
        </div>
      </CardContent>
    </Card>
  );
}
