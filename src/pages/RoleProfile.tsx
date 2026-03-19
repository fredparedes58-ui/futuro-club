import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import TopNav from "@/components/TopNav";
import PlayerHeader from "@/components/role-profile/PlayerHeader";
import IdentityCard from "@/components/role-profile/IdentityCard";
import CapabilityCards from "@/components/role-profile/CapabilityCards";
import PositionFitRanking from "@/components/role-profile/PositionFitRanking";
import ArchetypeRanking from "@/components/role-profile/ArchetypeRanking";
import StrengthsRisksPanel from "@/components/role-profile/StrengthsRisksPanel";
import ProjectionComparator from "@/components/role-profile/ProjectionComparator";
import ViewModeToggle, { ViewMode } from "@/components/role-profile/ViewModeToggle";
import { mockRoleProfile } from "@/lib/roleProfileData";
import { Button } from "@/components/ui/button";
import { FileText, GitCompare, Table2 } from "lucide-react";

export default function RoleProfile() {
  const { id } = useParams();
  const [mode, setMode] = useState<ViewMode>("scout");

  // In production: fetch from GET /api/player/:id/role-profile
  const data = mockRoleProfile;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Motor de Perfil, Rol y Proyección</p>
            <h2 className="font-display text-2xl font-bold">Perfil de rol</h2>
          </div>
          <div className="flex items-center gap-3">
            <ViewModeToggle mode={mode} onChange={setMode} />
            <Link to={`/players/${id}/role-profile/compare`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <GitCompare className="w-3.5 h-3.5" />
                Comparar
              </Button>
            </Link>
            <Link to={`/players/${id}/role-profile/audit`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Table2 className="w-3.5 h-3.5" />
                Auditoría
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Player header */}
        <PlayerHeader data={data} />

        {/* Identity + Capabilities */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <IdentityCard data={data} />
          </div>
          <div className="lg:col-span-2">
            <CapabilityCards data={data} />
          </div>
        </div>

        {/* Position fit + Archetypes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <PositionFitRanking data={data} />
          <ArchetypeRanking data={data} />
        </div>

        {/* Strengths, risks, gaps */}
        <StrengthsRisksPanel data={data} />

        {/* Projection comparator - scout mode shows it inline */}
        {mode === "scout" && <ProjectionComparator data={data} />}

        {/* Run metadata */}
        <div className="text-xs text-muted-foreground border-t border-border pt-4 flex items-center gap-4">
          <span>Run: <span className="font-mono">{data.run_id}</span></span>
          <span>Confianza global: {Math.round(data.overall_confidence * 100)}%</span>
          <span>Muestra: {data.sample_tier}</span>
        </div>
      </main>
    </div>
  );
}
