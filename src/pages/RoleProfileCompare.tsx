import { useParams, Link } from "react-router-dom";
import TopNav from "@/components/TopNav";
import ProjectionComparator from "@/components/role-profile/ProjectionComparator";
import CapabilityCards from "@/components/role-profile/CapabilityCards";
import { mockRoleProfile, POSITION_LABELS } from "@/lib/roleProfileData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function RoleProfileCompare() {
  const { id } = useParams();
  const data = mockRoleProfile;
  const positions = [...data.positions].sort((a, b) => b.score - a.score);
  const [selectedHorizon, setSelectedHorizon] = useState<"0_6m" | "6_18m" | "18_36m">("18_36m");

  const horizons = [
    { key: "0_6m" as const, label: "0–6 meses" },
    { key: "6_18m" as const, label: "6–18 meses" },
    { key: "18_36m" as const, label: "18–36 meses" },
  ];

  const dims = [
    { key: "tactical" as const, label: "Táctica" },
    { key: "technical" as const, label: "Técnica" },
    { key: "physical" as const, label: "Física" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/players/${id}/role-profile`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Motor de Perfil</p>
              <h2 className="font-display text-2xl font-bold">Comparador de proyección</h2>
            </div>
          </div>
          {/* Horizon selector */}
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            {horizons.map(h => (
              <Button
                key={h.key}
                variant={selectedHorizon === h.key ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedHorizon(h.key)}
              >
                {h.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="font-display text-lg font-semibold">
          {data.player_name} — {data.player_age} años
        </div>

        {/* Current vs projected capabilities */}
        <CapabilityCards data={data} />

        {/* Side by side position comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Current top positions */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Posiciones actuales (top 5)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {positions.slice(0, 5).map((pos, i) => (
                <div key={pos.code} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                  <span className="text-xs font-mono text-primary w-4">{i + 1}</span>
                  <span className="font-display font-bold text-sm w-10">{pos.code}</span>
                  <span className="text-xs text-muted-foreground flex-1">{POSITION_LABELS[pos.code]}</span>
                  <span className="font-mono text-sm">{pos.score.toFixed(1)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Projected — simulated delta */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Posiciones proyectadas ({horizons.find(h => h.key === selectedHorizon)?.label})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {positions.slice(0, 5).map((pos, i) => {
                const proj = data.projections[selectedHorizon];
                const boost = (proj.tactical - data.current.tactical) * 0.3 +
                  (proj.technical - data.current.technical) * 0.4 +
                  (proj.physical - data.current.physical) * 0.3;
                const projScore = pos.score + boost;

                return (
                  <div key={pos.code} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                    <span className="text-xs font-mono text-electric w-4">{i + 1}</span>
                    <span className="font-display font-bold text-sm w-10">{pos.code}</span>
                    <span className="text-xs text-muted-foreground flex-1">{POSITION_LABELS[pos.code]}</span>
                    <span className="font-mono text-sm text-electric">{projScore.toFixed(1)}</span>
                    <span className="font-mono text-xs text-primary">+{boost.toFixed(1)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Delta detail per dimension */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display">Detalle de delta por dimensión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              {dims.map(({ key, label }) => {
                const now = data.current[key];
                const proj = data.projections[selectedHorizon][key];
                const delta = proj - now;
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-sm font-medium">{label}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-display font-bold">{now.toFixed(1)}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="text-2xl font-display font-bold text-electric">{proj.toFixed(1)}</span>
                    </div>
                    <span className={`text-sm font-mono ${delta > 0 ? "text-primary" : "text-danger"}`}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)} pts
                    </span>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.min((delta / 20) * 100, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <ProjectionComparator data={data} />
      </main>
    </div>
  );
}
