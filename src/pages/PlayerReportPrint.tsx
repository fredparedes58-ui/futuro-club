/**
 * VITAS — Player Report Print Layout
 * Ruta: /report/:id
 * Optimizado para impresión / exportación PDF.
 * Usa @media print via className "print:..." de Tailwind.
 */
import { useParams } from "react-router-dom";
import { useRawPlayerById } from "@/hooks/usePlayers";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { MetricsService } from "@/services/real/metricsService";
import { useEffect } from "react";
import { DominantFeaturesService } from "@/services/real/advancedMetricsService";

export default function PlayerReportPrint() {
  const { id } = useParams<{ id: string }>();
  const { data: rawPlayer, isLoading } = useRawPlayerById(id);

  // Auto-print when loaded
  useEffect(() => {
    if (!isLoading && rawPlayer) {
      setTimeout(() => window.print(), 500);
    }
  }, [isLoading, rawPlayer]);

  if (isLoading) return <div className="p-8 text-center">Cargando informe...</div>;
  if (!rawPlayer) return <div className="p-8 text-center">Jugador no encontrado</div>;

  const player = adaptPlayerForUI(rawPlayer);
  const vsi = MetricsService.calculateVSI(rawPlayer.metrics);
  const dominantFeatures = DominantFeaturesService.calculate(rawPlayer.metrics);

  const metricLabels: Record<string, string> = {
    speed: "Velocidad", technique: "Técnica", vision: "Visión",
    stamina: "Resistencia", shooting: "Disparo", defending: "Defensa",
  };

  return (
    <div className="bg-white text-gray-900 min-h-screen p-8 max-w-2xl mx-auto font-sans">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-200">
        <div>
          <div className="text-xs font-bold tracking-widest text-purple-600 uppercase mb-1">VITAS Football Intelligence</div>
          <h1 className="text-3xl font-bold text-gray-900">{rawPlayer.name}</h1>
          <div className="text-sm text-gray-500 mt-1">
            {rawPlayer.position} · {rawPlayer.age} años · {rawPlayer.competitiveLevel}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Informe generado: {new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div className="text-center">
          <div className="text-5xl font-black text-purple-600">{vsi}</div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">VSI Score</div>
          <div className="text-xs text-gray-400">{MetricsService.classifyVSI(vsi).toUpperCase()}</div>
        </div>
      </div>

      {/* Métricas */}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Perfil Técnico</h2>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(rawPlayer.metrics).map(([key, value]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 shrink-0">{metricLabels[key] ?? key}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500"
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-700 w-6 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PHV */}
      {rawPlayer.phvCategory && (
        <div className="mb-8 p-4 bg-purple-50 rounded-lg border border-purple-100">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">Maduración Biológica (PHV)</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-purple-700 capitalize">
              {rawPlayer.phvCategory === "ontme" ? "Maduración Normal" :
               rawPlayer.phvCategory === "early" ? "Madurador Precoz" : "Madurador Tardío"}
            </span>
            <span className="text-sm text-gray-500">
              Offset: {rawPlayer.phvOffset !== undefined ? (rawPlayer.phvOffset > 0 ? "+" : "") + rawPlayer.phvOffset.toFixed(2) : "N/D"} años
            </span>
          </div>
        </div>
      )}

      {/* Características dominantes */}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Características Dominantes</h2>
        <div className="flex gap-2 flex-wrap mb-3">
          {dominantFeatures.dominant.map(f => (
            <span key={f.key} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
              {f.label} ({f.value})
            </span>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          Estilo: <span className="font-semibold capitalize">{dominantFeatures.playStyle}</span> ·
          Especialización: {Math.round(dominantFeatures.specializationIndex * 100)}%
        </div>
      </div>

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
          <div className="text-2xl font-black text-gray-800 capitalize">{rawPlayer.foot === "right" ? "Diestro" : rawPlayer.foot === "left" ? "Zurdo" : "Ambidiestro"}</div>
          <div className="text-xs text-gray-500">Pie dominante</div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-gray-200 text-center">
        <div className="text-xs text-gray-400">
          Generado por VITAS Football Intelligence · futuro-club.vercel.app · © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
