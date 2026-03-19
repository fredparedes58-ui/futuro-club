import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import TopNav from "@/components/TopNav";
import PlayerHeader from "@/components/role-profile/PlayerHeader";
import IndicatorsAuditTable from "@/components/role-profile/IndicatorsAuditTable";
import EvidenceDrawer from "@/components/role-profile/EvidenceDrawer";
import { mockRoleProfile, PhaseOfPlay, EvidenceIndicator } from "@/lib/roleProfileData";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function RoleProfileAudit() {
  const { id } = useParams();
  const data = mockRoleProfile;

  const [phaseFilter, setPhaseFilter] = useState<PhaseOfPlay | "all">("all");
  const [drawerIndicator, setDrawerIndicator] = useState<EvidenceIndicator | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const phases = [
    { key: "all" as const, label: "Todas" },
    { key: "in_possession" as const, label: "En posesión" },
    { key: "out_of_possession" as const, label: "Sin posesión" },
    { key: "transition" as const, label: "Transición" },
  ];

  const handleOpenEvidence = (indicatorKey: string) => {
    const found = data.evidence.find(e => e.indicator === indicatorKey);
    if (found) {
      setDrawerIndicator(found);
      setDrawerOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/players/${id}/role-profile`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Motor de Perfil</p>
              <h2 className="font-display text-2xl font-bold">Auditoría de indicadores</h2>
            </div>
          </div>

          {/* Phase filter */}
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            {phases.map(p => (
              <Button
                key={p.key}
                variant={phaseFilter === p.key ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPhaseFilter(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <PlayerHeader data={data} />

        {/* Stats summary */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>{data.evidence.length} indicadores registrados</span>
          <span>{data.evidence.filter(e => e.reliability >= 0.75).length} con fiabilidad alta</span>
          <span>{data.evidence.filter(e => e.impact === "positivo").length} con impacto positivo</span>
        </div>

        {/* Audit table */}
        <div className="bg-card border border-border rounded-lg">
          <IndicatorsAuditTable
            data={data}
            phaseFilter={phaseFilter}
            onOpenEvidence={handleOpenEvidence}
          />
        </div>

        {/* Evidence drawer */}
        <EvidenceDrawer
          indicator={drawerIndicator}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        {/* Run metadata */}
        <div className="text-xs text-muted-foreground border-t border-border pt-4 flex items-center gap-4">
          <span>Run: <span className="font-mono">{data.run_id}</span></span>
          <span>Haz clic en una fila para ver el detalle de evidencia</span>
        </div>
      </main>
    </div>
  );
}
