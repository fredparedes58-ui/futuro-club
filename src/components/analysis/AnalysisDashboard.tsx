/**
 * VITAS · Analysis Dashboard
 *
 * Renderiza los 6 reportes Claude generados por un análisis V2 con tabs:
 *   - player-report (Sonnet)
 *   - lab-biomechanics (Sonnet)
 *   - dna-profile, best-match, projection, development-plan (Haiku)
 *
 * Lee directamente de /api/analyses/reports?analysisId=… y muestra el JSON
 * crudo de cada reporte (sin pasar por el mapping legacy lossy).
 *
 * Estado de carga: muestra spinner mientras `status` es processing/queued.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, AlertCircle, BarChart3, Activity, Dna, Target, TrendingUp, ClipboardList,
  Brain,
} from "lucide-react";

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

const REPORT_META: Record<
  string,
  { Icon: React.ComponentType<{ size?: number; className?: string }>; title: string; color: string }
> = {
  "player-report":    { Icon: BarChart3,    title: "Player Report",    color: "#0066CC" },
  "lab-biomechanics": { Icon: Activity,     title: "LAB Biomecánica",  color: "#B82BD9" },
  "dna-profile":      { Icon: Dna,          title: "ADN Futbolístico", color: "#10b981" },
  "best-match":       { Icon: Target,       title: "Best-Match",       color: "#DC8B0A" },
  projection:         { Icon: TrendingUp,   title: "Proyección 3a",    color: "#1A8FFF" },
  "development-plan": { Icon: ClipboardList, title: "Plan Desarrollo", color: "#22e88c" },
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
        if (data.data.reports?.length > 0) setActiveTab(data.data.reports[0].report_type);
        setLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Error");
          setLoading(false);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, [analysisId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Cargando reportes…</p>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle size={28} className="text-destructive" />
        <p className="text-sm text-foreground">{error ?? "Análisis no encontrado"}</p>
      </div>
    );
  }

  const isProcessing =
    analysis.status === "processing" ||
    analysis.status === "queued" ||
    analysis.status === "processing_reports";

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Loader2 size={28} className="animate-spin text-primary" />
        <h2 className="font-display font-bold text-base text-foreground">IA generando reportes…</h2>
        <p className="text-[11px] text-muted-foreground">
          Estado: <code className="px-1.5 py-0.5 rounded bg-secondary font-mono">{analysis.status}</code>
        </p>
        <p className="text-[10px] text-muted-foreground">~25 segundos · refresca la página</p>
      </div>
    );
  }

  const vsi = analysis.vsi?.vsi ?? null;
  const tier = analysis.vsi?.tierLabel ?? null;
  const activeReport = reports.find((r) => r.report_type === activeTab);
  const ActiveIcon = activeReport ? REPORT_META[activeReport.report_type]?.Icon ?? Brain : Brain;

  return (
    <div className="space-y-4">
      {/* Header VSI */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5 text-center bg-gradient-to-br from-primary/15 via-electric/10 to-transparent border border-primary/20"
      >
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
          VSI Score
        </div>
        <div className="font-display font-bold text-5xl text-foreground leading-none">
          {vsi ?? "—"}
        </div>
        {tier && (
          <div className="text-[11px] mt-1.5 text-muted-foreground">
            Tier · <span className="text-foreground font-semibold">{tier}</span>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {reports.map((r) => {
          const meta = REPORT_META[r.report_type] ?? { Icon: Brain, title: r.report_type, color: "#888" };
          const Icon = meta.Icon;
          const isActive = activeTab === r.report_type;
          return (
            <button
              key={r.report_type}
              onClick={() => setActiveTab(r.report_type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-display font-bold border transition-all ${
                isActive
                  ? "border-primary text-primary-foreground"
                  : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
              style={isActive ? { backgroundColor: meta.color, borderColor: meta.color } : undefined}
            >
              <Icon size={11} />
              {meta.title}
            </button>
          );
        })}
      </div>

      {/* Contenido del reporte activo */}
      {activeReport && (
        <motion.div
          key={activeReport.report_type}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="glass rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ActiveIcon size={16} className="text-primary" />
              <h3 className="font-display font-bold text-base text-foreground">
                {REPORT_META[activeReport.report_type]?.title ?? activeReport.report_type}
              </h3>
            </div>
            <span className="text-[9px] text-muted-foreground font-mono">
              {activeReport.model} · {activeReport.prompt_version}
            </span>
          </div>
          <ReportRenderer report={activeReport.content} />
        </motion.div>
      )}

      {/* Datos técnicos crudos */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5">
          <Activity size={11} /> Datos técnicos (avanzado)
        </summary>
        <div className="mt-2 rounded-xl bg-secondary/30 p-3 space-y-2 font-mono text-[10px]">
          <div>
            <div className="text-foreground font-bold mb-1">Biomecánica</div>
            <pre className="whitespace-pre-wrap break-all text-muted-foreground">
              {JSON.stringify(analysis.biomechanics, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-foreground font-bold mb-1">PHV</div>
            <pre className="whitespace-pre-wrap break-all text-muted-foreground">
              {JSON.stringify(analysis.phv, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

// ─── ReportRenderer ──────────────────────────────────────────────────────────

/**
 * Renderiza el JSON de un reporte intentando varios shapes:
 *   {title, summary, sections}, {strengths, concerns, recommendations},
 *   {blocks}, {metrics_table}. Fallback: pretty-print JSON.
 */
function ReportRenderer({ report }: { report: Record<string, unknown> }) {
  if (!report || Object.keys(report).length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sin contenido</p>;
  }

  const title = report.title as string | undefined;
  const summary = (report.summary as string | undefined) ?? (report.executive_summary as string | undefined);
  const strengths = report.strengths as Array<{ title: string; description?: string } | string> | undefined;
  const concerns = (report.concerns as Array<{ title: string; description?: string } | string> | undefined)
    ?? (report.areas_to_improve as Array<{ title: string; description?: string } | string> | undefined);
  const recommendations = report.recommendations as Array<{ title?: string; description?: string } | string> | undefined;
  const nextFocus = (report.next_focus as string | undefined) ?? (report.proximo_foco as string | undefined);
  const blocks = report.blocks as Record<string, unknown>[] | undefined;
  const metricsTable = report.metrics_table as Record<string, unknown>[] | undefined;
  const pillars = report.pillars as Array<{ pilar?: string; acciones?: string[]; prioridad?: string }> | undefined;

  return (
    <div className="space-y-4">
      {title && <h4 className="font-display font-bold text-sm text-foreground">{title}</h4>}
      {summary && <p className="text-xs text-foreground leading-relaxed">{summary}</p>}

      {metricsTable && metricsTable.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="p-2 border-b border-border font-bold">Métrica</th>
                <th className="p-2 border-b border-border font-bold">Valor</th>
                <th className="p-2 border-b border-border font-bold">Interpretación</th>
              </tr>
            </thead>
            <tbody>
              {metricsTable.map((m, i) => (
                <tr key={i} className="hover:bg-secondary/30">
                  <td className="p-2 border-b border-border/40 font-semibold text-foreground">
                    {m.metric as string}
                  </td>
                  <td className="p-2 border-b border-border/40 font-mono text-primary">
                    {m.value as string}
                  </td>
                  <td className="p-2 border-b border-border/40 text-muted-foreground">
                    {m.interpretation as string}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {strengths && strengths.length > 0 && (
        <Section heading="✓ Fortalezas" color="text-green-400">
          {strengths.map((s, i) => (
            <li key={i}>{typeof s === "string" ? s : s.title}{typeof s !== "string" && s.description ? <span className="text-muted-foreground"> · {s.description}</span> : null}</li>
          ))}
        </Section>
      )}

      {concerns && concerns.length > 0 && (
        <Section heading="⚠ Áreas de mejora" color="text-amber-400">
          {concerns.map((s, i) => (
            <li key={i}>{typeof s === "string" ? s : s.title}{typeof s !== "string" && s.description ? <span className="text-muted-foreground"> · {s.description}</span> : null}</li>
          ))}
        </Section>
      )}

      {recommendations && recommendations.length > 0 && (
        <Section heading="💡 Recomendaciones" color="text-electric">
          {recommendations.map((s, i) => (
            <li key={i}>
              {typeof s === "string" ? s : (s.title ?? "")}
              {typeof s !== "string" && s.description ? <span className="text-muted-foreground"> · {s.description}</span> : null}
            </li>
          ))}
        </Section>
      )}

      {pillars && pillars.length > 0 && (
        <Section heading="🏛 Pilares de trabajo" color="text-primary">
          {pillars.map((p, i) => (
            <li key={i}>
              <span className="font-semibold text-foreground">{p.pilar}</span>
              {p.prioridad && (
                <span className="ml-2 text-[9px] uppercase tracking-wider text-muted-foreground">
                  ({p.prioridad})
                </span>
              )}
              {Array.isArray(p.acciones) && p.acciones.length > 0 && (
                <ul className="ml-4 mt-1 list-[circle] list-inside text-muted-foreground">
                  {p.acciones.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              )}
            </li>
          ))}
        </Section>
      )}

      {nextFocus && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
          <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
            Próximo foco
          </div>
          <p className="text-xs text-foreground">{nextFocus}</p>
        </div>
      )}

      {blocks && blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((b, i) => (
            <div key={i} className="rounded-xl bg-secondary/30 border-l-2 border-electric p-3">
              <div className="text-[10px] uppercase tracking-wider text-electric font-bold">
                Bloque {(b.block_number as number) ?? i + 1}
                {b.weeks && <span className="ml-2 text-muted-foreground">· {b.weeks as string}</span>}
              </div>
              <p className="text-xs text-foreground mt-1">{b.theme as string}</p>
              {Array.isArray(b.objectives) && (
                <ul className="text-[11px] text-muted-foreground mt-1.5 list-disc list-inside">
                  {(b.objectives as string[]).map((o, j) => <li key={j}>{o}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback */}
      {!title && !summary && !blocks && !strengths && !concerns && !recommendations && !pillars && !metricsTable && (
        <pre className="bg-secondary/30 rounded-xl p-3 text-[10px] overflow-x-auto whitespace-pre-wrap text-muted-foreground font-mono">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Section({
  heading,
  color,
  children,
}: {
  heading: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h5 className={`font-display font-bold text-xs ${color} mb-1.5`}>{heading}</h5>
      <ul className="list-disc list-inside space-y-1 text-xs text-foreground">{children}</ul>
    </section>
  );
}
