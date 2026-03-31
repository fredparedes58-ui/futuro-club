/**
 * VITAS Card — Tarjeta exportable del jugador
 * Muestra: identidad, VSI, PHV, clon más cercano, proyección
 * Exporta como PNG con html2canvas
 */

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Share2, Loader2, Zap, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Player } from "@/services/real/playerService";
import type { SimilarityMatch } from "@/services/real/similarityService";

interface VitasCardProps {
  player:    Player;
  bestMatch: SimilarityMatch | null;
  projection?: string; // "Primera División", "Segunda División", etc.
  onClose?:  () => void;
}

const PHV_LABELS: Record<string, string> = {
  early:  "PRECOZ",
  ontme:  "NORMAL",
  late:   "TARDÍO",
};

const PHV_COLORS: Record<string, string> = {
  early:  "#F59E0B",
  ontme:  "#22C55E",
  late:   "#3B82F6",
};

const METRIC_LABELS: Record<string, string> = {
  speed:     "RITMO",
  shooting:  "TIRO",
  vision:    "VISIÓN",
  technique: "TÉCNICA",
  defending: "DEFENSA",
  stamina:   "FÍSICO",
};

function RadarHex({ metrics }: { metrics: Player["metrics"] }) {
  const keys = ["speed", "shooting", "vision", "technique", "defending", "stamina"];
  const cx = 80, cy = 80, r = 60;
  const angles = keys.map((_, i) => (i * Math.PI * 2) / keys.length - Math.PI / 2);

  const toPoint = (angle: number, val: number) => ({
    x: cx + r * (val / 100) * Math.cos(angle),
    y: cy + r * (val / 100) * Math.sin(angle),
  });

  const gridPoly = (scale: number) =>
    angles.map(a => `${cx + r * scale * Math.cos(a)},${cy + r * scale * Math.sin(a)}`).join(" ");

  const dataPoints = keys.map((k, i) =>
    toPoint(angles[i], (metrics as Record<string, number>)[k] ?? 0)
  );
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={gridPoly(s)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1"
        />
      ))}
      <path d={dataPath} fill="rgba(99,102,241,0.3)" stroke="rgb(99,102,241)" strokeWidth="2" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="rgb(99,102,241)" />
      ))}
      {angles.map((a, i) => {
        const lx = cx + (r + 14) * Math.cos(a);
        const ly = cy + (r + 14) * Math.sin(a);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize="7" fill="rgba(255,255,255,0.5)" fontFamily="Rajdhani" fontWeight="600">
            {METRIC_LABELS[keys[i]]}
          </text>
        );
      })}
    </svg>
  );
}

export default function VitasCard({ player, bestMatch, projection, onClose }: VitasCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const phvColor = PHV_COLORS[player.phvCategory ?? "ontme"] ?? "#22C55E";
  const phvLabel = PHV_LABELS[player.phvCategory ?? "ontme"] ?? "NORMAL";
  const cloneScore = bestMatch?.score ?? null;
  const cloneName = bestMatch?.player.short_name ?? null;
  const cloneClub = bestMatch?.player.club ?? null;
  const clonePos = bestMatch?.player.position ?? null;

  const topMetrics = Object.entries(player.metrics)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => ({ label: METRIC_LABELS[k] ?? k, value: v }));

  const handleExport = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `VITAS_${player.name.replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Tarjeta exportada");
    } catch {
      toast.error("Error al exportar — intenta con captura de pantalla");
    } finally {
      setExporting(false);
    }
  };

  const handleShare = async () => {
    const text = `⚡ ${player.name} | VSI ${player.vsi} | PHV ${phvLabel}${cloneName ? ` | Se parece a ${cloneName} (${cloneScore?.toFixed(0)}%)` : ""} — Generado con VITAS Football Intelligence`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="space-y-4">
      {/* Acciones */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar PNG
        </Button>
        <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={handleShare}>
          <Share2 size={14} /> Compartir
        </Button>
      </div>

      {/* Card */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-2xl overflow-hidden select-none"
        style={{
          background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0d0d1f 100%)",
          border: "1px solid rgba(99,102,241,0.3)",
          minHeight: 420,
        }}
      >
        {/* Glow de fondo */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)" }} />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #8b5cf6, transparent 70%)" }} />
        </div>

        {/* Header VITAS */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-indigo-400" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-indigo-400 uppercase">
              VITAS Intelligence
            </span>
          </div>
          <span className="text-[9px] text-white/30 font-mono">2026</span>
        </div>

        <div className="p-5 grid grid-cols-[1fr_auto] gap-4">
          {/* Columna izquierda */}
          <div className="space-y-4">
            {/* Identidad */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold tracking-[0.15em] text-white/40 uppercase">
                  {player.position} · {player.age} años
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: phvColor, backgroundColor: `${phvColor}20`, border: `1px solid ${phvColor}40` }}>
                  PHV {phvLabel}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                {player.name}
              </h2>
              {player.competitiveLevel && (
                <p className="text-[10px] text-white/40 mt-0.5">{player.competitiveLevel}</p>
              )}
            </div>

            {/* VSI */}
            <div className="flex items-end gap-3">
              <div>
                <p className="text-[9px] font-bold tracking-widest text-white/40 uppercase mb-0.5">VSI Score</p>
                <div className="text-5xl font-black text-white leading-none">{player.vsi}</div>
                <div className="mt-1.5 h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${player.vsi}%` }} />
                </div>
              </div>
              {player.phvOffset !== undefined && (
                <div className="mb-1">
                  <p className="text-[9px] text-white/40 uppercase tracking-widest">Offset bio</p>
                  <p className="text-lg font-bold" style={{ color: phvColor }}>
                    {player.phvOffset > 0 ? "+" : ""}{player.phvOffset?.toFixed(1)}
                  </p>
                </div>
              )}
            </div>

            {/* Top métricas */}
            <div>
              <p className="text-[9px] font-bold tracking-widest text-white/40 uppercase mb-2">Fortalezas</p>
              <div className="space-y-1.5">
                {topMetrics.map(m => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="text-[9px] text-white/50 w-14">{m.label}</span>
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${m.value}%` }} />
                    </div>
                    <span className="text-[9px] font-mono text-white/70">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Proyección */}
            {projection && (
              <div className="rounded-lg px-3 py-2 border border-white/10 bg-white/5">
                <p className="text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Proyección</p>
                <p className="text-xs font-bold text-white">{projection}</p>
              </div>
            )}
          </div>

          {/* Columna derecha */}
          <div className="flex flex-col items-center gap-4">
            {/* Radar */}
            <RadarHex metrics={player.metrics} />

            {/* Clon */}
            {bestMatch && cloneName && (
              <div className="text-center rounded-xl px-4 py-3 border border-indigo-500/30 bg-indigo-500/10 w-full">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Star size={10} className="text-yellow-400" />
                  <span className="text-[8px] font-bold tracking-widest text-white/50 uppercase">
                    Se parece a
                  </span>
                </div>
                <p className="text-sm font-black text-white">{cloneName}</p>
                <p className="text-[9px] text-white/50">{clonePos} · {cloneClub}</p>
                <div className="mt-1.5 text-xl font-black text-indigo-400">
                  {cloneScore?.toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <span className="text-[8px] font-mono text-white/20">
            Generado con VITAS · Football Intelligence
          </span>
          <span className="text-[8px] font-mono text-white/20">
            {new Date().toLocaleDateString("es-ES")}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
