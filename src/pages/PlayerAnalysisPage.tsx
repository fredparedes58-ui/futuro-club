/**
 * VITAS · Player Analysis Page
 * /player/:id/analysis/:analysisId
 *
 * Wrapper de AnalysisDashboard que añade el header con info del jugador
 * y navegación de vuelta al historial de reportes.
 */

import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { PlayerService } from "@/services/real/playerService";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";

export default function PlayerAnalysisPage() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const navigate = useNavigate();
  const player = id ? PlayerService.getById(id) : null;

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header sticky */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/player/${id}/reports`)}
            className="p-1.5 rounded-lg hover:bg-secondary"
            aria-label="Volver al historial"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {player?.name ?? "Jugador"}
            </h1>
            <p className="text-[10px] text-muted-foreground">Reportes IA · 6 análisis</p>
          </div>
          <FileText size={18} className="text-primary" />
        </div>
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto">
        {analysisId ? (
          <AnalysisDashboard analysisId={analysisId} />
        ) : (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Falta el ID del análisis.
          </div>
        )}
      </div>
    </div>
  );
}
