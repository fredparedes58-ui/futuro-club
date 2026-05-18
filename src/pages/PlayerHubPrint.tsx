/**
 * VITAS · PlayerHubPrint
 *
 * Vista print-ready de un jugador. Usa CSS @media print para que el navegador
 * pueda imprimir/guardar como PDF.
 *
 * Diseño 2 páginas A4:
 *   1. Hero: VSI gauge gigante + identidad + métricas base
 *   2. Stats + fortalezas + comparativa pro
 *
 * Branding fuerte VITAS · diseñado para que padres lo compartan en WhatsApp.
 *
 * URL: /players/:id/print  (al cargar dispara window.print() automáticamente
 * si query param `auto=1`).
 */
import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PlayerService, type Player } from "@/services/real/playerService";
import { calculateAdvancedMetrics } from "@/services/real/advancedMetricsService";
import VsiGauge from "@/components/VsiGauge";

const METRIC_LABELS: Record<keyof Player["metrics"], string> = {
  speed:     "Velocidad",
  technique: "Técnica",
  vision:    "Visión de juego",
  stamina:   "Resistencia",
  shooting:  "Disparo",
  defending: "Defensa",
};

export default function PlayerHubPrint() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const player = useMemo(() => (id ? PlayerService.getById(id) : null), [id]);
  const metrics = useMemo(() => {
    if (!player) return null;
    return calculateAdvancedMetrics(player as Parameters<typeof calculateAdvancedMetrics>[0]);
  }, [player]);

  // Auto print si ?auto=1
  useEffect(() => {
    if (searchParams.get("auto") === "1") {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  if (!player) {
    return <div className="p-8 text-center">Jugador no encontrado</div>;
  }

  const phvLabel =
    player.phvCategory === "early" ? "Pre-PHV (estirón pendiente)" :
    player.phvCategory === "late" ? "Post-PHV (consolidado)" :
    player.phvCategory ? "En PHV (estirón en curso)" : "Sin datos PHV";

  const phvColor =
    player.phvCategory === "early" ? "#10b981" :
    player.phvCategory === "late" ? "#3b82f6" :
    player.phvCategory ? "#f59e0b" : "#94a3b8";

  const today = new Date().toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Top 3 fortalezas + 2 áreas de mejora
  const sortedMetrics = (Object.keys(player.metrics) as Array<keyof Player["metrics"]>)
    .map((k) => ({ key: k, label: METRIC_LABELS[k], value: player.metrics[k] }))
    .sort((a, b) => b.value - a.value);
  const strengths = sortedMetrics.slice(0, 3);
  const gaps = sortedMetrics.slice(-2).reverse();

  // Tier badge
  const tier = player.vsi >= 85 ? { label: "ÉLITE", color: "#3b82f6" } :
               player.vsi >= 70 ? { label: "PRO", color: "#a855f7" } :
               player.vsi >= 50 ? { label: "TALENTO", color: "#f59e0b" } :
               { label: "DESARROLLO", color: "#ef4444" };

  return (
    <>
      {/* CSS print-specific */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 16mm;
          box-sizing: border-box;
          background: white;
          color: #0f172a;
        }
        @media screen {
          .page {
            margin: 16px auto;
            box-shadow: 0 4px 32px rgba(0,0,0,0.08);
          }
        }
      `}</style>

      {/* Toolbar (no print) */}
      <div className="no-print sticky top-0 z-50 bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-blue-500 flex items-center justify-center font-black text-xs">V</div>
          <span className="font-bold text-sm">VITAS · Vista de impresión</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-sm font-bold"
          >
            🖨 Descargar PDF / Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div style={{ background: "#f1f5f9", padding: "1px 0", fontFamily: "Geist, system-ui, sans-serif" }}>
        {/* ── PÁGINA 1 · Hero ────────────────────────────────────────── */}
        <div className="page page-break">
          {/* Header brand */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 18 }}>V</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-0.02em" }}>VITAS</div>
                <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Football Intelligence</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Informe</div>
              <div style={{ fontSize: 11, color: "#0f172a", fontWeight: 600 }}>{today}</div>
            </div>
          </div>

          {/* Hero · nombre + VSI gauge gigante */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, marginTop: 32, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 700, marginBottom: 6 }}>
                Análisis del jugador
              </div>
              <h1 style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, margin: 0, color: "#0f172a" }}>
                {player.name}
              </h1>
              <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                <Stat label="Edad" value={`${player.age} años`} />
                <Stat label="Posición" value={player.position} />
                {player.secondaryPositions && player.secondaryPositions.length > 0 && (
                  <Stat label="Polivalencia" value={player.secondaryPositions.join(", ")} />
                )}
                <Stat label="Pie hábil" value={player.foot === "right" ? "Derecho" : player.foot === "left" ? "Izquierdo" : "Ambidiestro"} />
                <Stat label="Nivel" value={player.competitiveLevel} />
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: tier.color, color: "white", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>
                  {tier.label}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: phvColor, color: "white", fontSize: 11, fontWeight: 700 }}>
                  {phvLabel}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <VsiGauge value={player.vsi} size="xl" showTier />
              <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>
                VITAS Score Index
              </div>
            </div>
          </div>

          {/* Métricas base · barras horizontales */}
          <div style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#0f172a", margin: 0, marginBottom: 14, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
              Perfil técnico-físico
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
              {(Object.keys(player.metrics) as Array<keyof Player["metrics"]>).map((k) => {
                const v = player.metrics[k];
                return (
                  <div key={k}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{METRIC_LABELS[k]}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{v}</span>
                    </div>
                    <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${v}%`, height: "100%", background: v >= 75 ? "#3b82f6" : v >= 55 ? "#a855f7" : "#f59e0b", borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fortalezas + áreas */}
          <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#10b981", margin: 0, marginBottom: 10 }}>
                ✓ Fortalezas
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {strengths.map((s) => (
                  <li key={s.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                    <span style={{ color: "#0f172a", fontWeight: 600 }}>{s.label}</span>
                    <span style={{ color: "#10b981", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#f59e0b", margin: 0, marginBottom: 10 }}>
                ↗ Áreas de desarrollo
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {gaps.map((g) => (
                  <li key={g.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                    <span style={{ color: "#0f172a", fontWeight: 600 }}>{g.label}</span>
                    <span style={{ color: "#f59e0b", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{g.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer página 1 */}
          <div style={{ position: "absolute", bottom: "16mm", left: "16mm", right: "16mm", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            <span>VITAS · Football Intelligence · Edad madurativa: {player.phvAge ? `${player.phvAge.toFixed(1)} años` : "No disponible"} · {phvLabel}</span>
            <span>Página 1/2 · {player.name} · {today}</span>
          </div>
        </div>

        {/* ── PÁGINA 2 · Análisis avanzado ────────────────────────────── */}
        <div className="page">
          {/* Header continuación */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 900, fontSize: 14 }}>V</div>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{player.name}</span>
              <span style={{ fontSize: 10, color: "#64748b" }}>· Análisis avanzado</span>
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              VSI <strong style={{ color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{player.vsi}</strong>
            </div>
          </div>

          {/* PHV section */}
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#0f172a", margin: 0, marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
              Madurez biológica · PHV
            </h2>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7, color: "#334155" }}>
              <strong style={{ color: phvColor }}>{phvLabel}</strong>
              {player.phvCategory === "early" && (
                <p style={{ margin: "8px 0 0 0" }}>El estirón está pendiente. La ventana neuromotora está abierta para desarrollar técnica fina y coordinación. Evitar gym pesado.</p>
              )}
              {player.phvCategory === "late" && (
                <p style={{ margin: "8px 0 0 0" }}>Post-estirón. Trabajo de fuerza progresiva y consolidación de patrones técnicos a alta intensidad.</p>
              )}
              {(player.phvCategory === "ontme" || !player.phvCategory) && (
                <p style={{ margin: "8px 0 0 0" }}>Periodo de transformación corporal acelerada. Reducir cargas, monitorizar fatiga, priorizar movilidad y técnica controlada.</p>
              )}
            </div>
          </div>

          {/* Comparativa pro */}
          {metrics && (
            <div style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#0f172a", margin: 0, marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
                Identidad dominante
              </h2>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.6 }}>
                <strong style={{ fontSize: 16, color: "#0f172a", textTransform: "capitalize" }}>{metrics.dominantFeatures.playStyle}</strong>
                <p style={{ margin: "6px 0 0 0", color: "#475569" }}>
                  Especialización: <strong>{Math.round(metrics.dominantFeatures.specializationIndex * 100)}%</strong>
                  {" · "}
                  Atributos dominantes: {metrics.dominantFeatures.dominant.slice(0, 2).join(" + ")}
                </p>
              </div>
            </div>
          )}

          {/* Recomendación próximas 4 semanas */}
          <div style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#0f172a", margin: 0, marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>
              Plan próximas 4 semanas
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PlanCard
                title="Mantener fortalezas"
                items={strengths.map((s) => `Drills semanales de ${s.label.toLowerCase()}`)}
                color="#10b981"
              />
              <PlanCard
                title="Trabajar áreas"
                items={gaps.map((g) => `Bloque específico: ${g.label.toLowerCase()}`)}
                color="#f59e0b"
              />
            </div>
          </div>

          {/* CTA final */}
          <div style={{ marginTop: 32, padding: 20, background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", borderRadius: 8, color: "white", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>
              Análisis generado por
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>VITAS Football Intelligence</div>
            <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>
              Plataforma de scouting juvenil con corrección de maduración biológica
            </div>
            <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 12, fontWeight: 700 }}>
              futuro-club.vercel.app
            </div>
          </div>

          {/* Footer página 2 */}
          <div style={{ position: "absolute", bottom: "16mm", left: "16mm", right: "16mm", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            <span>VITAS v2.0 · Evaluación con corrección PHV Mirwald · Confianza: {player.phvAge ? "Media-Alta" : "Parcial (sin PHV)"}</span>
            <span>Página 2/2 · {player.name} · {today}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PlanCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{ background: "#fafbfc", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{title}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
        {items.map((it, i) => <li key={i}>• {it}</li>)}
      </ul>
    </div>
  );
}
