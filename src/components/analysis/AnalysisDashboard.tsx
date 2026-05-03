/**
 * VITAS · Analysis Dashboard
 * Muestra los 6 reportes generados por un análisis con tabs.
 *
 * Uso:
 *   <AnalysisDashboard analysisId="..." />
 */

import { useEffect, useState } from "react";

interface ReportData {
  report_type: string;
  content: Record<string, unknown>;
  model: string;
  prompt_version: string;
  generated_at: string;
}

interface AnalysisData {
  id: string;
  status: string;
  vsi: { vsi?: number; tier?: string; tierLabel?: string } | null;
  phv: Record<string, unknown> | null;
  similarity: Record<string, unknown> | null;
  biomechanics: Record<string, unknown> | null;
  completed_at: string | null;
  player_id: string;
  video_id: string;
}

const REPORT_LABELS: Record<string, { emoji: string; title: string; color: string }> = {
  "player-report": { emoji: "📊", title: "Player Report", color: "#0066CC" },
  "lab-biomechanics": { emoji: "🦴", title: "LAB Biomechanics", color: "#B82BD9" },
  "dna-profile": { emoji: "🧬", title: "ADN Futbolístico", color: "#10b981" },
  "best-match": { emoji: "🎯", title: "Best-Match", color: "#DC8B0A" },
  projection: { emoji: "📈", title: "Proyección 3 años", color: "#1A8FFF" },
  "development-plan": { emoji: "📋", title: "Plan Desarrollo", color: "#22e88c" },
};

interface Props {
  analysisId: string;
}

export function AnalysisDashboard({ analysisId }: Props) {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [reports, setReports] = useState<ReportData[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/analyses/reports?analysisId=${analysisId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!mounted) return;

        if (!res.ok || !data.success) {
          setError(data?.error?.message ?? "Error cargando reportes");
          setLoading(false);
          return;
        }

        setAnalysis(data.data.analysis);
        setReports(data.data.reports ?? []);
        if (data.data.reports?.length > 0) {
          setActiveTab(data.data.reports[0].report_type);
        }
        setLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Error");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [analysisId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center">
        <div className="w-12 h-12 mx-auto border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 mt-4">Cargando reportes...</p>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-slate-600">{error ?? "Análisis no encontrado"}</p>
      </div>
    );
  }

  const isProcessing = analysis.status === "processing" || analysis.status === "queued" || analysis.status === "processing_reports";

  if (isProcessing) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 mx-auto border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <h2 className="font-rajdhani text-2xl font-bold">IA generando reportes...</h2>
        <p className="text-slate-600">
          Estado: <code className="bg-slate-100 px-2 py-1 rounded text-sm">{analysis.status}</code>
        </p>
        <p className="text-xs text-slate-400">Tarda ~25 segundos · esta página se actualiza sola</p>
      </div>
    );
  }

  const vsi = analysis.vsi?.vsi ?? null;
  const tier = analysis.vsi?.tierLabel ?? null;
  const activeReport = reports.find((r) => r.report_type === activeTab);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header con VSI */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-2xl p-8 text-center">
        <div className="text-xs uppercase tracking-widest opacity-80 mb-2">VSI Score</div>
        <div className="font-rajdhani font-bold text-7xl leading-none">
          {vsi ?? "—"}
        </div>
        {tier && (
          <div className="text-sm mt-2 opacity-90">
            Tier: <strong>{tier}</strong>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {reports.map((r) => {
          const meta = REPORT_LABELS[r.report_type] ?? { emoji: "📄", title: r.report_type, color: "#666" };
          const isActive = activeTab === r.report_type;
          return (
            <button
              key={r.report_type}
              onClick={() => setActiveTab(r.report_type)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                isActive ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 hover:border-slate-400"
              }`}
            >
              {meta.emoji} {meta.title}
            </button>
          );
        })}
      </div>

      {/* Contenido del reporte activo */}
      {activeReport && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="font-rajdhani font-bold text-2xl">
              {REPORT_LABELS[activeReport.report_type]?.title ?? activeReport.report_type}
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {activeReport.model} · {activeReport.prompt_version}
            </span>
          </div>
          <ReportRenderer report={activeReport.content} />
        </div>
      )}

      {/* Métricas crudas (debug/info) */}
      <details className="text-sm text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">📊 Datos técnicos (avanzado)</summary>
        <div className="mt-2 bg-slate-50 rounded-xl p-4">
          <div className="font-mono text-xs space-y-1">
            <div>📐 Biomecánica: <pre className="inline">{JSON.stringify(analysis.biomechanics, null, 2)}</pre></div>
            <div>🧬 PHV: <pre className="inline">{JSON.stringify(analysis.phv, null, 2)}</pre></div>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * Renderiza un reporte JSON · maneja varios formatos típicos:
 * - {title, summary, sections: [...]}
 * - {strengths, concerns, recommendations}
 * - {blocks: [...]}
 * - Fallback: pretty-print del JSON
 */
function ReportRenderer({ report }: { report: Record<string, unknown> }) {
  if (!report || Object.keys(report).length === 0) {
    return <p className="text-slate-500 italic">Sin contenido</p>;
  }

  const title = report.title as string | undefined;
  const summary = report.summary as string | undefined;
  const strengths = report.strengths as string[] | undefined;
  const concerns = report.concerns as string[] | undefined;
  const recommendations = report.recommendations as string[] | undefined;
  const nextFocus = report.next_focus as string | undefined;
  const blocks = report.blocks as Record<string, unknown>[] | undefined;
  const metricsTable = report.metrics_table as Record<string, unknown>[] | undefined;

  return (
    <div className="space-y-5">
      {title && <h4 className="font-rajdhani font-bold text-xl">{title}</h4>}
      {summary && <p className="text-slate-700 leading-relaxed">{summary}</p>}

      {metricsTable && metricsTable.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="p-2 border-b border-slate-200">Métrica</th>
              <th className="p-2 border-b border-slate-200">Valor</th>
              <th className="p-2 border-b border-slate-200">Interpretación</th>
            </tr>
          </thead>
          <tbody>
            {metricsTable.map((m, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="p-2 border-b border-slate-100 font-semibold">{m.metric as string}</td>
                <td className="p-2 border-b border-slate-100 font-mono">{m.value as string}</td>
                <td className="p-2 border-b border-slate-100 text-slate-600">{m.interpretation as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {strengths && strengths.length > 0 && (
        <section>
          <h5 className="font-bold text-green-700 mb-2">✓ Fortalezas</h5>
          <ul className="list-disc list-inside space-y-1 text-slate-700">
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}

      {concerns && concerns.length > 0 && (
        <section>
          <h5 className="font-bold text-amber-700 mb-2">⚠️ Áreas de mejora</h5>
          <ul className="list-disc list-inside space-y-1 text-slate-700">
            {concerns.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}

      {recommendations && recommendations.length > 0 && (
        <section>
          <h5 className="font-bold text-blue-700 mb-2">💡 Recomendaciones</h5>
          <ul className="list-disc list-inside space-y-1 text-slate-700">
            {recommendations.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}

      {nextFocus && (
        <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-xl">
          <div className="font-bold text-purple-900 text-xs uppercase tracking-wider mb-1">Próximo foco</div>
          <p className="text-purple-800 text-sm">{nextFocus}</p>
        </div>
      )}

      {blocks && blocks.length > 0 && (
        <div className="space-y-4">
          {blocks.map((b, i) => (
            <div key={i} className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-xl">
              <div className="font-bold text-blue-900 text-sm">
                Bloque {(b.block_number as number) ?? i + 1} · {(b.weeks as string) ?? ""}
              </div>
              <p className="text-blue-800 text-sm mt-1">{b.theme as string}</p>
              {Array.isArray(b.objectives) && (
                <ul className="text-xs text-blue-700 mt-2 list-disc list-inside">
                  {(b.objectives as string[]).map((o, j) => <li key={j}>{o}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback: si nada de lo anterior matchea, pretty-print JSON */}
      {!title && !summary && !blocks && !strengths && (
        <pre className="bg-slate-50 rounded-xl p-4 text-xs overflow-x-auto">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}
