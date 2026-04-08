/**
 * VITAS — Analysis Report Print Layout
 * Ruta: /analysis-report/:id
 * Optimizado para impresión / exportación PDF.
 * Lee datos de sessionStorage o Supabase (player_analyses).
 */
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DimensionScore {
  score: number;
  observacion: string;
}

interface AnalysisReport {
  estadoActual: {
    resumenEjecutivo: string;
    nivelActual: string;
    fortalezasPrimarias: string[];
    areasDesarrollo: string[];
    dimensiones: {
      velocidadDecision: DimensionScore;
      tecnicaConBalon: DimensionScore;
      inteligenciaTactica: DimensionScore;
      capacidadFisica: DimensionScore;
      liderazgoPresencia: DimensionScore;
      eficaciaCompetitiva: DimensionScore;
    };
    ajusteVSIVideoScore: number;
  };
  adnFutbolistico: {
    estiloJuego: string;
    arquetipoTactico: string;
    patrones: Array<{ patron: string; frecuencia: string; descripcion: string }>;
    mentalidad: string;
  };
  jugadorReferencia: {
    bestMatch: {
      nombre: string;
      posicion: string;
      club: string;
      score: number;
      narrativa: string;
    };
  };
  proyeccionCarrera: {
    escenarioOptimista: { descripcion: string; nivelProyecto: string };
    escenarioRealista: { descripcion: string; nivelProyecto: string };
    factoresClave: string[];
    riesgos: string[];
  };
  planDesarrollo: {
    objetivo6meses: string;
    objetivo18meses: string;
    pilaresTrabajo: Array<{ pilar: string; acciones: string[]; prioridad: string }>;
  };
  metricasCuantitativas?: {
    fisicas?: {
      velocidadMaxKmh: number;
      velocidadPromKmh: number;
      distanciaM: number;
      sprints: number;
      zonasIntensidad: { caminar: number; trotar: number; correr: number; sprint: number };
    };
    eventos?: {
      pasesCompletados: number;
      pasesFallados: number;
      precisionPases: number;
      recuperaciones: number;
      duelosGanados: number;
      duelosPerdidos: number;
      disparosAlArco: number;
      disparosFuera: number;
    };
    fuente: string;
    confianza: number;
  };
  confianza: number;
}

interface StoredReport {
  report: AnalysisReport;
  playerName: string;
  playerPosition: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dimensionLabels: Record<string, string> = {
  velocidadDecision: "Velocidad de Decisión",
  tecnicaConBalon: "Técnica con Balón",
  inteligenciaTactica: "Inteligencia Táctica",
  capacidadFisica: "Capacidad Física",
  liderazgoPresencia: "Liderazgo y Presencia",
  eficaciaCompetitiva: "Eficacia Competitiva",
};

function scoreColor(score: number): string {
  if (score >= 85) return "#10b981";
  if (score >= 70) return "#7c3aed";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function confianzaBadge(value: number) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-green-100 text-green-700" :
    pct >= 60 ? "bg-yellow-100 text-yellow-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      Confianza: {pct}%
    </span>
  );
}

function formatDate(): string {
  return new Date().toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Print Styles ─────────────────────────────────────────────────────────────

const printStyles = `
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-before: always; }
  .no-break { page-break-inside: avoid; }
}
`;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnalysisReportPrint() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<StoredReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load report data
  useEffect(() => {
    if (!id) {
      setError("ID de análisis no proporcionado");
      setLoading(false);
      return;
    }

    const storageKey = `vitas-analysis-report-${id}`;
    const stored = sessionStorage.getItem(storageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredReport;
        setData(parsed);
        setLoading(false);
        return;
      } catch {
        // fall through to Supabase
      }
    }

    // Try Supabase if ID looks like a UUID
    if (UUID_RE.test(id) && SUPABASE_CONFIGURED) {
      supabase
        .from("player_analyses")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data: row, error: err }) => {
          if (err || !row) {
            setError("Análisis no encontrado");
            setLoading(false);
            return;
          }
          const report = (typeof row.report === "string" ? JSON.parse(row.report) : row.report) as AnalysisReport;
          setData({
            report,
            playerName: (row as Record<string, unknown>).player_name as string ?? "Jugador",
            playerPosition: (row as Record<string, unknown>).player_position as string ?? "",
          });
          setLoading(false);
        });
    } else {
      setError("Análisis no encontrado en sesión");
      setLoading(false);
    }
  }, [id]);

  // Auto-print
  useEffect(() => {
    if (!data || loading) return;
    const timer = setTimeout(() => window.print(), 1500);
    return () => clearTimeout(timer);
  }, [data, loading]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando informe de análisis...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-500">{error ?? "Error desconocido"}</div>;

  const { report, playerName, playerPosition } = data;
  const r = report;
  const dims = r.estadoActual.dimensiones;
  const fisicas = r.metricasCuantitativas?.fisicas;
  const eventos = r.metricasCuantitativas?.eventos;

  return (
    <>
      <style>{printStyles}</style>
      <div
        className="bg-white text-gray-900 min-h-screen p-8 max-w-3xl mx-auto font-sans print:p-4"
        style={{ fontFamily: "system-ui, sans-serif", fontSize: "13px" }}
      >
        {/* ── 1. Header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-200 no-break">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-purple-600 uppercase mb-1">
              VITAS Intelligence Report
            </div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{playerName}</h1>
            {playerPosition && (
              <div className="text-sm text-gray-500 mt-0.5">{playerPosition}</div>
            )}
            <div className="text-[10px] text-gray-400 mt-1">
              Generado: {formatDate()}
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            {confianzaBadge(r.confianza)}
            <div className="mt-2 text-[10px] text-gray-400">
              VSI Ajuste: <span className="font-bold text-gray-700">{r.estadoActual.ajusteVSIVideoScore}</span>
            </div>
          </div>
        </div>

        {/* ── 2. Resumen Ejecutivo ────────────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Resumen Ejecutivo</h2>
          <p className="text-sm text-gray-700 leading-relaxed">{r.estadoActual.resumenEjecutivo}</p>
          <div className="flex gap-4 mt-3 text-xs">
            <div>
              <span className="text-gray-400">Nivel Actual:</span>{" "}
              <span className="font-semibold text-purple-700">{r.estadoActual.nivelActual}</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {r.estadoActual.fortalezasPrimarias.map((f, i) => (
              <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded">
                {f}
              </span>
            ))}
            {r.estadoActual.areasDesarrollo.map((a, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] font-semibold rounded">
                {a}
              </span>
            ))}
          </div>
        </section>

        {/* ── 3. Dimensiones ─────────────────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Dimensiones de Rendimiento</h2>
          <div className="space-y-2">
            {(Object.entries(dims) as [string, DimensionScore][]).map(([key, dim]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-[10px] text-gray-500 w-32 shrink-0 pt-0.5">
                  {dimensionLabels[key] ?? key}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${dim.score}%`, backgroundColor: scoreColor(dim.score) }}
                      />
                    </div>
                    <span className="text-[10px] font-bold w-6 text-right" style={{ color: scoreColor(dim.score) }}>
                      {dim.score}
                    </span>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{dim.observacion}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Métricas Físicas ────────────────────────────────────── */}
        {fisicas && (
          <section className="mb-6 no-break">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Métricas Físicas</h2>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Vel. Máxima" value={`${fisicas.velocidadMaxKmh} km/h`} />
              <MetricCard label="Vel. Promedio" value={`${fisicas.velocidadPromKmh} km/h`} />
              <MetricCard label="Distancia" value={`${fisicas.distanciaM} m`} />
              <MetricCard label="Sprints" value={String(fisicas.sprints)} />
            </div>
            {fisicas.zonasIntensidad && (
              <div className="flex gap-1 mt-3">
                {(
                  [
                    ["Caminar", fisicas.zonasIntensidad.caminar, "#d1d5db"],
                    ["Trotar", fisicas.zonasIntensidad.trotar, "#93c5fd"],
                    ["Correr", fisicas.zonasIntensidad.correr, "#fbbf24"],
                    ["Sprint", fisicas.zonasIntensidad.sprint, "#f87171"],
                  ] as [string, number, string][]
                ).map(([label, pct, color]) => (
                  <div key={label} className="flex-1 text-center">
                    <div className="h-2 rounded-full" style={{ backgroundColor: color, opacity: 0.7 }} />
                    <div className="text-[8px] text-gray-500 mt-0.5">{label} {pct}%</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 5. Métricas Eventos ────────────────────────────────────── */}
        {eventos && (
          <section className="mb-6 no-break">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Métricas de Eventos</h2>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard
                label="Pases"
                value={`${eventos.pasesCompletados}/${eventos.pasesCompletados + eventos.pasesFallados}`}
                sub={`${eventos.precisionPases}% precisión`}
              />
              <MetricCard
                label="Duelos"
                value={`${eventos.duelosGanados}/${eventos.duelosGanados + eventos.duelosPerdidos}`}
                sub={`${Math.round((eventos.duelosGanados / Math.max(1, eventos.duelosGanados + eventos.duelosPerdidos)) * 100)}% ganados`}
              />
              <MetricCard label="Recuperaciones" value={String(eventos.recuperaciones)} />
              <MetricCard
                label="Disparos"
                value={`${eventos.disparosAlArco}/${eventos.disparosAlArco + eventos.disparosFuera}`}
                sub="al arco"
              />
            </div>
          </section>
        )}

        {/* Page break hint */}
        <div className="page-break" />

        {/* ── 6. ADN Futbolístico ────────────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">ADN Futbolístico</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-2 bg-purple-50 rounded">
              <div className="text-[9px] text-gray-400 uppercase">Arquetipo</div>
              <div className="text-xs font-bold text-purple-700">{r.adnFutbolistico.arquetipoTactico}</div>
            </div>
            <div className="p-2 bg-purple-50 rounded">
              <div className="text-[9px] text-gray-400 uppercase">Estilo</div>
              <div className="text-xs font-bold text-purple-700">{r.adnFutbolistico.estiloJuego}</div>
            </div>
            <div className="p-2 bg-purple-50 rounded">
              <div className="text-[9px] text-gray-400 uppercase">Mentalidad</div>
              <div className="text-xs font-bold text-purple-700">{r.adnFutbolistico.mentalidad}</div>
            </div>
          </div>
          {r.adnFutbolistico.patrones.length > 0 && (
            <div className="space-y-1">
              {r.adnFutbolistico.patrones.map((p, i) => (
                <div key={i} className="flex gap-2 text-[10px]">
                  <span className="font-semibold text-gray-700 shrink-0">{p.patron}</span>
                  <span className="text-gray-400">({p.frecuencia})</span>
                  <span className="text-gray-500">{p.descripcion}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 7. Jugador Referencia ──────────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Jugador Referencia</h2>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <div>
                <span className="text-sm font-bold text-gray-900">
                  {r.jugadorReferencia.bestMatch.nombre}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {r.jugadorReferencia.bestMatch.posicion} · {r.jugadorReferencia.bestMatch.club}
                </span>
              </div>
              <span className="text-xs font-bold text-purple-600">
                {Math.round(r.jugadorReferencia.bestMatch.score * 100)}% similitud
              </span>
            </div>
            <p className="text-[11px] text-gray-600 leading-relaxed">
              {r.jugadorReferencia.bestMatch.narrativa}
            </p>
          </div>
        </section>

        {/* ── 8. Proyección de Carrera ───────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Proyección de Carrera</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-3 bg-green-50 rounded border border-green-100">
              <div className="text-[9px] text-green-600 uppercase font-bold mb-1">Escenario Optimista</div>
              <div className="text-[10px] text-gray-400 mb-1">
                Nivel: <span className="font-semibold text-green-700">{r.proyeccionCarrera.escenarioOptimista.nivelProyecto}</span>
              </div>
              <p className="text-[10px] text-gray-600 leading-snug">
                {r.proyeccionCarrera.escenarioOptimista.descripcion}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded border border-blue-100">
              <div className="text-[9px] text-blue-600 uppercase font-bold mb-1">Escenario Realista</div>
              <div className="text-[10px] text-gray-400 mb-1">
                Nivel: <span className="font-semibold text-blue-700">{r.proyeccionCarrera.escenarioRealista.nivelProyecto}</span>
              </div>
              <p className="text-[10px] text-gray-600 leading-snug">
                {r.proyeccionCarrera.escenarioRealista.descripcion}
              </p>
            </div>
          </div>
          {r.proyeccionCarrera.factoresClave.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] text-gray-400 uppercase font-bold mb-1">Factores Clave</div>
              <div className="flex gap-1.5 flex-wrap">
                {r.proyeccionCarrera.factoresClave.map((f, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] rounded">{f}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── 9. Plan de Desarrollo ──────────────────────────────────── */}
        <section className="mb-6 no-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Plan de Desarrollo</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-2 bg-gray-50 rounded">
              <div className="text-[9px] text-gray-400 uppercase">Objetivo 6 meses</div>
              <div className="text-[10px] font-semibold text-gray-700">{r.planDesarrollo.objetivo6meses}</div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <div className="text-[9px] text-gray-400 uppercase">Objetivo 18 meses</div>
              <div className="text-[10px] font-semibold text-gray-700">{r.planDesarrollo.objetivo18meses}</div>
            </div>
          </div>
          {r.planDesarrollo.pilaresTrabajo.length > 0 && (
            <div className="space-y-2">
              {r.planDesarrollo.pilaresTrabajo.map((pilar, i) => (
                <div key={i} className="p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-gray-700">{pilar.pilar}</span>
                    <span
                      className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        pilar.prioridad === "alta"
                          ? "bg-red-100 text-red-600"
                          : pilar.prioridad === "media"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {pilar.prioridad}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[9px] text-gray-500 space-y-0.5">
                    {pilar.acciones.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 10. Riesgos ────────────────────────────────────────────── */}
        {r.proyeccionCarrera.riesgos.length > 0 && (
          <section className="mb-6 no-break">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Riesgos Identificados</h2>
            <ul className="list-disc list-inside text-[10px] text-gray-600 space-y-1">
              {r.proyeccionCarrera.riesgos.map((riesgo, i) => (
                <li key={i}>{riesgo}</li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="pt-4 mt-6 border-t border-gray-200 flex items-center justify-between">
          <div className="text-[10px] text-purple-600 font-bold tracking-widest uppercase">VITAS.</div>
          <div className="text-[10px] text-gray-400">
            Generado por VITAS Intelligence · {formatDate()}
          </div>
          <div className="text-[10px] text-gray-400">&copy; {new Date().getFullYear()}</div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center p-2 bg-gray-50 rounded">
      <div className="text-lg font-black text-gray-800 leading-tight">{value}</div>
      <div className="text-[9px] text-gray-500">{label}</div>
      {sub && <div className="text-[8px] text-gray-400">{sub}</div>}
    </div>
  );
}
