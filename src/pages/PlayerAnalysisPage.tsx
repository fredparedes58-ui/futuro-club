/**
 * VITAS · Player Analysis Page
 * /player/:id/analysis/:analysisId
 *
 * Wrapper de AnalysisDashboard que añade el header con info del jugador
 * y navegación de vuelta al historial de reportes.
 *
 * Header acciones:
 *   - Volver al historial
 *   - Imprimir / PDF (window.print con CSS @media print)
 *   - Compartir (genera HMAC token vía /api/analyses/share + copia URL)
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Share2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PlayerService } from "@/services/real/playerService";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { getAuthHeaders } from "@/lib/apiAuth";

export default function PlayerAnalysisPage() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const navigate = useNavigate();
  const player = id ? PlayerService.getById(id) : null;
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (!analysisId || sharing) return;
    setSharing(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/analyses/share?analysisId=${analysisId}`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error?.message ?? "No se pudo generar link");
      }
      const fullUrl = `${window.location.origin}${data.data.url}`;

      // Try Web Share API first (móvil), fallback a clipboard
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Análisis VITAS · ${player?.name ?? "Jugador"}`,
            text: `Mira el análisis IA de ${player?.name ?? "este jugador"}`,
            url: fullUrl,
          });
          toast.success("Compartido");
          return;
        } catch {
          // user canceled · fall back to clipboard
        }
      }

      await navigator.clipboard.writeText(fullUrl);
      toast.success("Link copiado · expira en 90 días");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al compartir");
    } finally {
      setSharing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header sticky · oculto al imprimir */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/players/${id}/reports`)}
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
          <button
            onClick={handlePrint}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Imprimir / PDF"
            title="Imprimir / Exportar PDF"
          >
            <Printer size={16} />
          </button>
          <button
            onClick={handleShare}
            disabled={sharing}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Compartir"
            title="Generar link público"
          >
            {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          </button>
          <FileText size={18} className="text-primary" />
        </div>
      </div>

      {/* Print-only header · solo al imprimir */}
      <div className="hidden print:block px-4 py-3 border-b border-border">
        <h1 className="text-base font-bold">{player?.name ?? "Jugador"} · Análisis VITAS</h1>
        <p className="text-xs text-muted-foreground">
          Generado {new Date().toLocaleDateString("es-ES")} · vitas.football
        </p>
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
