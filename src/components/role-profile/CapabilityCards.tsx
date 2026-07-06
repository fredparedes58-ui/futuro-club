import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleProfileData, getConfidenceLabel, getConfidenceColor } from "@/lib/roleProfileData";
import { Brain, Crosshair, Zap } from "lucide-react";
import type { RoleProfileFilters } from "@/components/role-profile/RoleProfileFilterBar";
import { MetricWithInterval } from "@/components/MetricWithInterval";
import { useTranslation } from "react-i18next";

interface Props {
  data: RoleProfileData;
  filters?: RoleProfileFilters | null;
}

const DIMS = [
  { key: "tactical" as const, icon: Brain },
  { key: "technical" as const, icon: Crosshair },
  { key: "physical" as const, icon: Zap },
];

export default function CapabilityCards({ data, filters }: Props) {
  const { t } = useTranslation();
  const { current, projections } = data;

  const dimMeta: Record<(typeof DIMS)[number]["key"], { label: string; description: string }> = {
    tactical: { label: t("capabilityCards.tacticalLabel"), description: t("capabilityCards.tacticalDescription") },
    technical: { label: t("capabilityCards.technicalLabel"), description: t("capabilityCards.technicalDescription") },
    physical: { label: t("capabilityCards.physicalLabel"), description: t("capabilityCards.physicalDescription") },
  };

  // Estimate confidence per dimension based on evidence reliability
  const dimConfidence = {
    tactical: 0.78,
    technical: 0.80,
    physical: 0.55,
  };

  const activeDims = filters?.dimension && filters.dimension !== "all"
    ? DIMS.filter(d => d.key === filters.dimension)
    : DIMS;

  const activeHorizon = filters?.horizon ?? "current";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {activeDims.map(({ key, icon: Icon }) => {
        const { label, description } = dimMeta[key];
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
                  <span className="text-xs text-muted-foreground">{t("capabilityCards.current")}</span>
                  <MetricWithInterval
                    value={current[key]}
                    input={{ reliability: conf, metricType: key, dataSource: "ai" }}
                    valueClassName="text-2xl"
                  />
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
                ] as const).filter(([pKey]) => activeHorizon === "current" || activeHorizon === pKey || true).map(([pKey, pLabel]) => {
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
