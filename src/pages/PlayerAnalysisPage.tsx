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
 *   - Compartir (genera HMAC token + texto WhatsApp rico copiable)
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Share2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PlayerService } from "@/services/real/playerService";
import { AnalysisDashboard } from "@/components/analysis/AnalysisDashboard";
import { getAuthHeaders } from "@/lib/apiAuth";

interface LoadedData {
  analysis: {
    vsi?: { vsi?: number; tierLabel?: string; peer?: { percentile: number | null } | null; trend?: { delta: number | null } | null } | null;
  };
  reports: Array<{ report_type: string; content: Record<string, unknown> }>;
}

function buildWhatsAppText(playerName: string, data: LoadedData | null, url: string): string {
  if (!data) return `Análisis VITAS · ${playerName}\n\n${url}`;

  const vsi = data.analysis.vsi?.vsi ?? null;
  const tier = data.analysis.vsi?.tierLabel ?? "";
  const percentile = data.analysis.vsi?.peer?.percentile ?? null;
  const delta = data.analysis.vsi?.trend?.delta ?? null;

  const playerReport = data.reports.find((r) => r.report_type === "player-report")?.content as
    | { strengths?: Array<{ title?: string } | string>; areas_to_improve?: Array<{ title?: string } | string> } | undefined;
  const topStrength = playerReport?.strengths?.[0];
  const topArea = playerReport?.areas_to_improve?.[0];
  const strengthText = typeof topStrength === "string" ? topStrength : topStrength?.title;
  const areaText     = typeof topArea     === "string" ? topArea     : topArea?.title;

  const lines: string[] = [];
  lines.push(`🏆 *Análisis VITAS · ${playerName}*`);
  lines.push("");
  if (vsi !== null) {
    let vsiLine = `*VSI ${vsi}*`;
    if (tier) vsiLine += ` · ${tier}`;
    if (percentile !== null && percentile !== undefined) vsiLine += ` · P${percentile}`;
    lines.push(vsiLine);
  }
  if (delta !== null && delta !== undefined) {
    const sign = delta > 0 ? "↗ +" : delta < 0 ? "↘ " : "→ ";
    lines.push(`${sign}${delta} pts vs análisis previo`);
  }
  lines.push("");
  if (strengthText) lines.push(`✅ Fortaleza: ${strengthText}`);
  if (areaText)     lines.push(`⚠️ A trabajar: ${areaText}`);
  lines.push("");
  lines.push(`📊 Ver completo: ${url}`);
  lines.push("");
  lines.push(`_Generado por VITAS · Football Intelligence_`);

  return lines.join("\n");
}

export default function PlayerAnalysisPage() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const navigate = useNavigate();
  const player = id ? PlayerService.getById(id) : null;
  const [sharing, setSharing] = useState(false);
  const [loaded, setLoaded] = useState<LoadedData | null>(null);

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
      const text = buildWhatsAppText(player?.name ?? "Jugador", loaded, fullUrl);

      // Web Share API primero (móvil → menú nativo + texto rico),
      // fallback a copiar el texto rico al clipboard.
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Análisis VITAS · ${player?.name ?? "Jugador"}`,
            text,
            url: fullUrl,
          });
          toast.success("Compartido");
          return;
        } catch {
          // user canceled · fall back to clipboard
        }
      }

      await navigator.clipboard.writeText(text);
      toast.success("Texto WhatsApp copiado · pega en grupo familia");
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
            disabled={sharing || !loaded}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Compartir"
            title="Generar link público + texto WhatsApp"
          >
            {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
          </button>
          <FileText size={18} className="text-primary" />
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block px-4 py-3 border-b border-border">
        <h1 className="text-base font-bold">{player?.name ?? "Jugador"} · Análisis VITAS</h1>
        <p className="text-xs text-muted-foreground">
          Generado {new Date().toLocaleDateString("es-ES")} · vitas.football
        </p>
      </div>

      <div className="px-4 py-4 max-w-3xl mx-auto">
        {analysisId ? (
          <AnalysisDashboard
            analysisId={analysisId}
            onLoaded={(analysis, reports) => setLoaded({ analysis, reports })}
          />
        ) : (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Falta el ID del análisis.
          </div>
        )}
      </div>
    </div>
  );
}
