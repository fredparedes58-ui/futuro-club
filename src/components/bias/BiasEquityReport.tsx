/**
 * VITAS · BiasEquityReport (Sprint 3.2)
 *
 * Informe de equidad imprimible/descargable (PDF vía window.print) apto para
 * federaciones: severidad, desviaciones por cohorte (posición, edad/maduración,
 * visibilidad, temporal) + metodología. Tema claro, tablas, cabecera con marca.
 *
 * Se renderiza oculto y solo aparece en @media print (ver BiasAuditDashboard).
 */

import { useTranslation } from "react-i18next";

interface BiasRow {
  bias_type: string;
  category: string;
  player_count: number;
  avg_vsi: number;
  stddev_vsi: number;
  deviation_from_global_avg: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
}
interface VisibilityRow {
  data_volume: string;
  player_count: number;
  avg_vsi: number;
  stddev_vsi: number;
}
interface RecencyRow {
  month: string;
  analysis_count: number;
  avg_vsi: number;
  stddev_vsi: number;
}

interface Props {
  dashboard: BiasRow[];
  visibility: VisibilityRow[];
  recency: RecencyRow[];
  orgName?: string;
  generatedBy?: string;
  /** Fecha ISO — se pasa desde el componente padre (no usamos Date() aquí). */
  generatedAt: string;
}

const SEV_COLOR: Record<BiasRow["severity"], string> = { HIGH: "#b91c1c", MEDIUM: "#b45309", LOW: "#047857" };

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid #cbd5e1",
  fontSize: 11,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", fontSize: 12, color: "#0f172a" };

function CohortTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: BiasRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  const SEV_LABEL: Record<BiasRow["severity"], string> = {
    HIGH: t("biasEquityReport.severityHigh"),
    MEDIUM: t("biasEquityReport.severityMedium"),
    LOW: t("biasEquityReport.severityLow"),
  };
  return (
    <section style={{ marginTop: 20, breakInside: "avoid" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>{title}</h2>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>{subtitle}</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>{t("biasEquityReport.colCohort")}</th>
            <th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colPlayers")}</th>
            <th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colAvgVsi")}</th>
            <th style={{ ...th, textAlign: "right" }}>σ</th>
            <th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colDeviation")}</th>
            <th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colSeverity")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600 }}>{r.category}</td>
              <td style={{ ...td, textAlign: "right" }}>{r.player_count}</td>
              <td style={{ ...td, textAlign: "right" }}>{r.avg_vsi}</td>
              <td style={{ ...td, textAlign: "right" }}>{r.stddev_vsi}</td>
              <td style={{ ...td, textAlign: "right", color: r.deviation_from_global_avg >= 0 ? "#047857" : "#b91c1c" }}>
                {r.deviation_from_global_avg > 0 ? "+" : ""}{r.deviation_from_global_avg}
              </td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: SEV_COLOR[r.severity] }}>{SEV_LABEL[r.severity]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function BiasEquityReport({ dashboard, visibility, recency, orgName, generatedBy, generatedAt }: Props) {
  const { t } = useTranslation();
  const position = dashboard.filter((r) => r.bias_type === "position");
  const age = dashboard.filter((r) => r.bias_type === "age");
  const high = dashboard.filter((r) => r.severity === "HIGH").length;
  const medium = dashboard.filter((r) => r.severity === "MEDIUM").length;
  const low = dashboard.filter((r) => r.severity === "LOW").length;
  const dateLabel = new Date(generatedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{ background: "#fff", color: "#0f172a", padding: "24px 28px", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <style>{`@media print { @page { margin: 12mm; } body { background:#fff !important; } nav, .print-hide { display:none !important; } }`}</style>

      {/* Cabecera federación */}
      <header style={{ borderBottom: "3px solid #0066CC", paddingBottom: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "#0066CC", textTransform: "uppercase" }}>
            VITAS · Football Intelligence
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 0" }}>{t("biasEquityReport.reportTitle")}</h1>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
          <div><strong style={{ color: "#0f172a" }}>{orgName ?? t("biasEquityReport.defaultOrg")}</strong></div>
          <div>{dateLabel}</div>
          {generatedBy && <div>{t("biasEquityReport.generatedBy", { name: generatedBy })}</div>}
        </div>
      </header>

      <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 12 }}>
        {t("biasEquityReport.intro")}
      </p>

      {/* Resumen ejecutivo */}
      <section style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {([
          ["HIGH", t("biasEquityReport.severityHigh"), high, "#b91c1c", t("biasEquityReport.summaryHighNote")],
          ["MEDIUM", t("biasEquityReport.severityMedium"), medium, "#b45309", t("biasEquityReport.summaryMediumNote")],
          ["LOW", t("biasEquityReport.severityLow"), low, "#047857", t("biasEquityReport.summaryLowNote")],
        ] as const).map(([sevKey, label, n, color, note]) => (
          <div key={sevKey} style={{ flex: 1, border: `1px solid ${color}33`, borderRadius: 10, padding: "10px 12px", background: `${color}0d` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{n}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              {note}
            </div>
          </div>
        ))}
      </section>

      <CohortTable title={t("biasEquityReport.byPositionTitle")} subtitle={t("biasEquityReport.byPositionSubtitle")} rows={position} />
      <CohortTable title={t("biasEquityReport.byAgeTitle")} subtitle={t("biasEquityReport.byAgeSubtitle")} rows={age} />

      {/* Visibilidad */}
      {visibility.length > 0 && (
        <section style={{ marginTop: 20, breakInside: "avoid" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>{t("biasEquityReport.byVisibilityTitle")}</h2>
          <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>{t("biasEquityReport.byVisibilitySubtitle")}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>{t("biasEquityReport.colVolume")}</th><th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colPlayers")}</th><th style={{ ...th, textAlign: "right" }}>{t("biasEquityReport.colAvgVsi")}</th><th style={{ ...th, textAlign: "right" }}>σ</th></tr></thead>
            <tbody>
              {visibility.map((r, i) => (
                <tr key={i}><td style={td}>{r.data_volume}</td><td style={{ ...td, textAlign: "right" }}>{r.player_count}</td><td style={{ ...td, textAlign: "right" }}>{r.avg_vsi}</td><td style={{ ...td, textAlign: "right" }}>{r.stddev_vsi}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Metodología */}
      <section style={{ marginTop: 24, breakInside: "avoid", borderTop: "1px solid #e2e8f0", paddingTop: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>{t("biasEquityReport.methodologyTitle")}</h2>
        <ul style={{ fontSize: 11, color: "#475569", lineHeight: 1.6, margin: 0, paddingLeft: 16 }}>
          <li><strong style={{ color: SEV_COLOR.HIGH }}>{t("biasEquityReport.methodHighLabel")}</strong>{t("biasEquityReport.methodHighDesc")}</li>
          <li><strong style={{ color: SEV_COLOR.MEDIUM }}>{t("biasEquityReport.methodMediumLabel")}</strong>{t("biasEquityReport.methodMediumDesc")}</li>
          <li><strong style={{ color: SEV_COLOR.LOW }}>{t("biasEquityReport.methodLowLabel")}</strong>{t("biasEquityReport.methodLowDesc")}</li>
        </ul>
        <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 10 }}>
          {t("biasEquityReport.footer")}
        </p>
      </section>
    </div>
  );
}
