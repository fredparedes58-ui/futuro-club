/**
 * VITAS — Player Report Print Layout
 * Ruta: /report/:id
 * Optimizado para impresión / exportación PDF.
 * Incluye RadarChart (Recharts), VSI gauge SVG, PHV, VAEP.
 */
import { useParams, useSearchParams } from "react-router-dom";
import { useRawPlayerById } from "@/hooks/usePlayers";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { MetricsService } from "@/services/real/metricsService";
import { useEffect, useRef } from "react";
import { DominantFeaturesService } from "@/services/real/advancedMetricsService";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { calculateReportBenchmark, type ReportBenchmark } from "@/services/real/benchmarkService";

// ─── VSI Gauge SVG ────────────────────────────────────────────────────────────

function VsiGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = (clamped / 100) * 180 - 180; // -180 a 0
  const r = 54;
  const cx = 70;
  const cy = 70;

  // arco de fondo
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  // aguja
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * 0.7 * Math.cos(rad);
  const ny = cy + r * 0.7 * Math.sin(rad);

  const tierColor =
    clamped >= 85 ? "#10b981" :
    clamped >= 70 ? "#7c3aed" :
    clamped >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="140" height="80" viewBox="0 0 140 80">
      {/* Track */}
      <path d={arcPath} fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      {/* Fill */}
      <path
        d={arcPath}
        fill="none"
        stroke={tierColor}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * 170} 170`}
        strokeDashoffset="0"
      />
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#1f2937" />
      {/* Value */}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="18" fontWeight="bold" fill={tierColor}>
        {clamped}
      </text>
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PlayerReportPrint() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { data: rawPlayer, isLoading } = useRawPlayerById(id);
  const rootRef = useRef<HTMLDivElement>(null);
  const isImageMode = searchParams.get("format") === "image";

  useEffect(() => {
    if (isLoading || !rawPlayer) return;

    if (isImageMode) {
      // html2canvas captura y descarga PNG
      import("html2canvas").then(({ default: html2canvas }) => {
        setTimeout(() => {
          if (!rootRef.current) return;
          html2canvas(rootRef.current, { scale: 2, useCORS: true }).then((canvas) => {
            const link = document.createElement("a");
            link.download = `vitas-report-${rawPlayer.name.replace(/\s/g, "-")}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
          });
        }, 600);
      });
    } else {
      setTimeout(() => window.print(), 500);
    }
  }, [isLoading, rawPlayer, isImageMode]);

  if (isLoading) return <div className="p-8 text-center">Cargando informe...</div>;
  if (!rawPlayer) return <div className="p-8 text-center">Jugador no encontrado</div>;

  const player = adaptPlayerForUI(rawPlayer);
  const vsi = MetricsService.calculateVSI(rawPlayer.metrics);
  const vsiTier = MetricsService.classifyVSI(vsi);
  const dominantFeatures = DominantFeaturesService.calculate(rawPlayer.metrics);

  const metricLabels: Record<string, string> = {
    speed: "Velocidad", technique: "Técnica", vision: "Visión",
    stamina: "Resistencia", shooting: "Disparo", defending: "Defensa",
  };

  const radarData = Object.entries(rawPlayer.metrics).map(([key, value]) => ({
    subject: metricLabels[key] ?? key,
    value,
    fullMark: 100,
  }));

  const reportId = `VIT-${rawPlayer.id?.slice(0, 6).toUpperCase() ?? "000000"}`;

  // VAEP data if available (safe runtime check)
  const vaepPer90 = rawPlayer && typeof rawPlayer === "object" && "vaepPer90" in rawPlayer
    ? (rawPlayer as Record<string, unknown>).vaepPer90 as number | undefined
    : undefined;
  const hasVaep = vaepPer90 != null;

  return (
    <div
      ref={rootRef}
      className="bg-white text-gray-900 min-h-screen p-8 max-w-2xl mx-auto font-sans"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-200">
        <div>
          <div className="text-xs font-bold tracking-widest text-purple-600 uppercase mb-1">
            VITAS Football Intelligence
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{rawPlayer.name}</h1>
          <div className="text-sm text-gray-500 mt-1">
            {rawPlayer.position} · {rawPlayer.age} años · {rawPlayer.competitiveLevel}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Informe {reportId} · Generado: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div className="text-center">
          <VsiGauge value={vsi} />
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider -mt-2">VSI Score</div>
          <div className="text-xs text-gray-400 capitalize">{vsiTier}</div>
        </div>
      </div>

      {/* Radar + Métricas en fila */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* RadarChart */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Perfil Técnico</h2>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 9, fill: "#6b7280" }}
                />
                <Radar
                  name={rawPlayer.name}
                  dataKey="value"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Barras de métricas */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Valores</h2>
          <div className="space-y-2.5 mt-2">
            {Object.entries(rawPlayer.metrics).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-20 shrink-0">{metricLabels[key] ?? key}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500" style={{ width: `${value}%` }} />
                </div>
                <span className="text-[10px] font-bold text-gray-700 w-5 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* VSI Evolution */}
      {rawPlayer.vsiHistory && rawPlayer.vsiHistory.length > 1 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Evolución VSI</h2>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rawPlayer.vsiHistory.map((v: number, i: number) => ({
                  eval: `#${i + 1}`,
                  vsi: Math.round(v * 10) / 10,
                }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="eval" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9ca3af" }} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: number) => [`${value}`, "VSI"]}
                />
                <Line
                  type="monotone"
                  dataKey="vsi"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#7c3aed" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>
              Tendencia:{" "}
              <span className="font-semibold text-gray-600">
                {(() => {
                  const h = rawPlayer.vsiHistory;
                  if (h.length < 2) return "—";
                  const last = h[h.length - 1];
                  const prev = h[h.length - 2];
                  const delta = last - prev;
                  return delta > 2 ? "↑ En ascenso" : delta < -2 ? "↓ En descenso" : "→ Estable";
                })()}
              </span>
            </span>
            <span>{rawPlayer.vsiHistory.length} evaluaciones</span>
          </div>
        </div>
      )}

      {/* PHV */}
      {rawPlayer.phvCategory && (
        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
            Maduración Biológica (PHV)
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-purple-700 capitalize">
                {rawPlayer.phvCategory === "ontme" ? "Maduración Normal" :
                 rawPlayer.phvCategory === "early" ? "Madurador Precoz" : "Madurador Tardío"}
              </span>
              <div className="flex gap-1 mt-1.5">
                {["early", "ontme", "late"].map((cat) => (
                  <div
                    key={cat}
                    className={`h-1.5 flex-1 rounded-full ${
                      rawPlayer.phvCategory === cat ? "bg-purple-500" : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
            <span className="text-sm text-gray-500">
              Offset: {rawPlayer.phvOffset !== undefined
                ? (rawPlayer.phvOffset > 0 ? "+" : "") + rawPlayer.phvOffset.toFixed(2)
                : "N/D"} años
            </span>
          </div>
        </div>
      )}

      {/* Características dominantes */}
      <div className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Características Dominantes</h2>
        <div className="flex gap-2 flex-wrap mb-2">
          {dominantFeatures.dominant.map((f) => (
            <span key={f.key} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
              {f.label} ({f.value})
            </span>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          Estilo: <span className="font-semibold capitalize">{dominantFeatures.playStyle}</span> ·{" "}
          Especialización: {Math.round(dominantFeatures.specializationIndex * 100)}%
        </div>
      </div>

      {/* VAEP */}
      {hasVaep && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">VAEP (Value Added per 90)</h2>
          <div className="text-2xl font-black text-green-700">
            {vaepPer90 != null ? (vaepPer90 > 0 ? "+" : "") + vaepPer90.toFixed(3) : "N/D"}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Valor ofensivo + defensivo añadido por cada 90 minutos jugados
          </p>
        </div>
      )}

      {/* Benchmark vs Peers */}
      <BenchmarkSection age={rawPlayer.age} position={rawPlayer.position} metrics={rawPlayer.metrics} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-black text-gray-800">{rawPlayer.minutesPlayed}</div>
          <div className="text-xs text-gray-500">Minutos jugados</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-black text-gray-800">{rawPlayer.vsiHistory?.length ?? 1}</div>
          <div className="text-xs text-gray-500">Evaluaciones</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-black text-gray-800 capitalize">
            {rawPlayer.foot === "right" ? "Diestro" : rawPlayer.foot === "left" ? "Zurdo" : "Ambidiestro"}
          </div>
          <div className="text-xs text-gray-500">Pie dominante</div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-gray-200 flex items-center justify-between">
        <div className="text-xs text-purple-600 font-bold tracking-widest uppercase">VITAS.</div>
        <div className="text-xs text-gray-400">
          Football Intelligence · prophet-horizon.tech · {reportId}
        </div>
        <div className="text-xs text-gray-400">© {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

// ─── Benchmark Section ────────────────────────────────────────────────────────

const dimLabels: Record<string, string> = {
  velocidadDecision: "Vel. Decisión",
  tecnicaConBalon: "Técnica",
  inteligenciaTactica: "Int. Táctica",
  capacidadFisica: "Capacidad Física",
  liderazgoPresencia: "Liderazgo",
  eficaciaCompetitiva: "Eficacia",
};

function BenchmarkSection({
  age,
  position,
  metrics,
}: {
  age: number;
  position: string;
  metrics: Record<string, number>;
}) {
  // Convert player metrics (0-100) to dimension-like scores (0-10) for benchmark
  const dimensionScores: Record<string, { score: number }> = {
    velocidadDecision: { score: metrics.speed / 10 },
    tecnicaConBalon: { score: metrics.technique / 10 },
    inteligenciaTactica: { score: metrics.vision / 10 },
    capacidadFisica: { score: metrics.stamina / 10 },
    liderazgoPresencia: { score: metrics.vision / 10 },
    eficaciaCompetitiva: { score: metrics.shooting / 10 },
  };

  let benchmark: ReportBenchmark | null = null;
  try {
    benchmark = calculateReportBenchmark(age, position, dimensionScores);
  } catch {
    // benchmarkService may fail if no players in storage
  }

  if (!benchmark || benchmark.sampleSize === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
        Benchmark vs Pares
      </h2>
      <p className="text-[10px] text-gray-400 mb-2">{benchmark.groupDescription}</p>
      <div className="space-y-1.5">
        {benchmark.dimensions.map((d) => (
          <div key={d.dimensionKey} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-24 shrink-0">
              {dimLabels[d.dimensionKey] ?? d.dimensionKey}
            </span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${d.percentile}%`,
                  backgroundColor:
                    d.percentile >= 75 ? "#10b981" :
                    d.percentile >= 50 ? "#7c3aed" :
                    d.percentile >= 25 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <span className="text-[10px] font-bold w-8 text-right text-gray-700">
              P{d.percentile}
            </span>
          </div>
        ))}
      </div>
      {benchmark.sampleSize < 5 && (
        <p className="text-[9px] text-amber-500 mt-1">
          ⚠ Muestra pequeña ({benchmark.sampleSize} jugadores). Percentiles orientativos.
        </p>
      )}
    </div>
  );
}
