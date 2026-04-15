/**
 * VITAS · MatchStatsPanel
 *
 * Panel de estadísticas de partido estilo Wyscout — pero mejor:
 *  - Rating compuesto (0–10) con gauge circular animado
 *  - Barras comparativas ganados/perdidos (W/L)
 *  - KPIs clásicos del fútbol (pases, duelos, recuperaciones, disparos)
 *  - Clasificación cualitativa con colores semánticos
 *  - Físicas integradas cuando hay tracking YOLO
 *  - Aristas redondeadas premium, gradientes, iconografía clara
 *  - Responsive mobile-first (todo en <360px width)
 *
 * Consume: `metricasCuantitativas` del `VideoIntelligenceOutput`.
 * Zero backend changes — usa datos ya persistidos en Supabase.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Target, Swords, ShieldCheck, Crosshair,
  Zap, Gauge, Activity, TrendingUp, Award,
  Flame,
} from "lucide-react";
import type { VideoIntelligenceOutput } from "@/agents/contracts";
import {
  computeMatchStats,
  RATING_LABEL_ES,
  RATING_COLOR,
  KPI_RATING_LABEL_ES,
  DUEL_RATING_LABEL_ES,
  PHYSICAL_RATING_LABEL_ES,
  type KpiRating,
  type DuelRating,
  type PhysicalRating,
} from "@/services/real/matchStatsService";

type MetricasCuantitativas = NonNullable<VideoIntelligenceOutput["metricasCuantitativas"]>;

interface Props {
  data: MetricasCuantitativas;
  title?: string;
}

// ── Colores por rating ──────────────────────────────────────────────────────
const KPI_COLOR: Record<KpiRating, string> = {
  elite:     "#10b981",
  excelente: "#22c55e",
  bueno:     "#eab308",
  aceptable: "#f97316",
  bajo:      "#ef4444",
};

const DUEL_COLOR: Record<DuelRating, string> = {
  dominante:    "#10b981",
  competitivo:  "#22c55e",
  igualado:     "#eab308",
  dominado:     "#ef4444",
};

const PHYSICAL_COLOR: Record<PhysicalRating, string> = {
  elite: "#10b981",
  alto:  "#22c55e",
  medio: "#eab308",
  bajo:  "#ef4444",
};

const FUENTE_LABELS: Record<string, string> = {
  "yolo+gemini": "Tracking + IA",
  "gemini_only": "Observación IA",
  "yolo_only":   "Tracking YOLO",
};

// ─── Main ───────────────────────────────────────────────────────────────────

export default function MatchStatsPanel({ data, title = "Panel de Estadísticas" }: Props) {
  const stats = useMemo(() => computeMatchStats(data), [data]);

  if (!stats) {
    return null;
  }

  const ratingColor = RATING_COLOR[stats.performanceLabel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-3"
    >
      {/* ── Header con rating global ────────────────────────────────────── */}
      <div className="glass rounded-2xl p-4 relative overflow-hidden">
        {/* Gradient accent */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            background: `radial-gradient(circle at top right, ${ratingColor}, transparent 60%)`,
          }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
                <Award size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-display font-bold text-foreground truncate">
                  {title}
                </h3>
                <p className="text-[9px] text-muted-foreground">
                  {FUENTE_LABELS[stats.fuente] ?? stats.fuente} · confianza {Math.round(stats.confianza * 100)}%
                </p>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-3">
              <span
                className="font-display font-bold text-4xl tabular-nums"
                style={{ color: ratingColor }}
              >
                {stats.performanceRating.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted-foreground">/ 10</span>
            </div>
            <div className="mt-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-display font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${ratingColor}22`,
                  color: ratingColor,
                }}
              >
                {RATING_LABEL_ES[stats.performanceLabel]}
              </span>
            </div>
          </div>

          {/* Gauge circular */}
          <CircularGauge value={stats.performanceRating} color={ratingColor} size={88} />
        </div>

        {/* Totales agregados */}
        <div className="relative grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/40">
          <TotalCell icon={<TrendingUp size={11} />} label="Total" value={stats.totalAcciones} tint="text-foreground" />
          <TotalCell icon={<Target size={11} />} label="Ofensivas" value={stats.totalOfensivas} tint="text-green-400" />
          <TotalCell icon={<ShieldCheck size={11} />} label="Defensivas" value={stats.totalDefensivas} tint="text-blue-400" />
        </div>
      </div>

      {/* ── KPIs de eventos ─────────────────────────────────────────────── */}
      {stats.tieneEventos && (
        <div className="grid grid-cols-1 gap-3">
          {/* Pases */}
          {stats.pases && (
            <KpiCardComparative
              icon={<Target size={14} />}
              title="Pases"
              ratingLabel={KPI_RATING_LABEL_ES[stats.pases.rating]}
              ratingColor={KPI_COLOR[stats.pases.rating]}
              bigValue={`${stats.pases.precision}%`}
              bigLabel="precisión"
              left={{ label: "Completados", value: stats.pases.completados, color: "#22c55e" }}
              right={{ label: "Fallados", value: stats.pases.fallados, color: "#ef4444" }}
              total={stats.pases.total}
              percentLeft={stats.pases.precision}
            />
          )}

          {/* Duelos */}
          {stats.duelos && (
            <KpiCardComparative
              icon={<Swords size={14} />}
              title="Duelos"
              ratingLabel={DUEL_RATING_LABEL_ES[stats.duelos.rating]}
              ratingColor={DUEL_COLOR[stats.duelos.rating]}
              bigValue={`${stats.duelos.efectividad}%`}
              bigLabel="efectividad"
              left={{ label: "Ganados", value: stats.duelos.ganados, color: "#10b981" }}
              right={{ label: "Perdidos", value: stats.duelos.perdidos, color: "#f97316" }}
              total={stats.duelos.total}
              percentLeft={stats.duelos.efectividad}
            />
          )}

          {/* Recuperaciones + Disparos */}
          <div className="grid grid-cols-2 gap-2">
            {stats.recuperaciones && (
              <KpiCardSingle
                icon={<ShieldCheck size={12} />}
                title="Recuperaciones"
                value={stats.recuperaciones.total}
                sub="balones recuperados"
                ratingLabel={KPI_RATING_LABEL_ES[stats.recuperaciones.rating]}
                ratingColor={KPI_COLOR[stats.recuperaciones.rating]}
              />
            )}
            {stats.disparos && (
              <KpiCardSingle
                icon={<Crosshair size={12} />}
                title="Disparos"
                value={stats.disparos.total}
                sub={`${stats.disparos.alArco} al arco · ${stats.disparos.fuera} fuera`}
                ratingLabel={`${stats.disparos.precision}% precisión`}
                ratingColor={stats.disparos.precision >= 50 ? "#22c55e" : "#f97316"}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Físicas (YOLO) ──────────────────────────────────────────────── */}
      {stats.fisicas && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Flame size={13} className="text-orange-400" />
              </div>
              <div>
                <h4 className="text-xs font-display font-bold text-foreground">Rendimiento físico</h4>
                <p className="text-[9px] text-muted-foreground">Tracking pose YOLO</p>
              </div>
            </div>
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-display font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${PHYSICAL_COLOR[stats.fisicas.rating]}22`,
                color: PHYSICAL_COLOR[stats.fisicas.rating],
              }}
            >
              {PHYSICAL_RATING_LABEL_ES[stats.fisicas.rating]}
            </span>
          </div>

          {/* Físicas grid */}
          <div className="grid grid-cols-4 gap-2">
            <PhysicalCell icon={<Zap size={10} />} label="Vel. máx" value={stats.fisicas.velocidadMaxKmh.toFixed(1)} unit="km/h" color="#eab308" />
            <PhysicalCell icon={<Gauge size={10} />} label="Vel. prom" value={stats.fisicas.velocidadPromKmh.toFixed(1)} unit="km/h" color="#3b82f6" />
            <PhysicalCell icon={<Activity size={10} />} label="Distancia" value={stats.fisicas.distanciaM.toString()} unit="m" color="#8b5cf6" />
            <PhysicalCell icon={<Flame size={10} />} label="Sprints" value={stats.fisicas.sprints.toString()} unit="" color="#ef4444" />
          </div>

          {/* Barra de intensidad segmentada */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                Zonas de intensidad
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {stats.fisicas.intensidadPct.sprint}% sprint
              </span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-background/40">
              {[
                { w: stats.fisicas.intensidadPct.caminar, c: "#94a3b8" },
                { w: stats.fisicas.intensidadPct.trotar,  c: "#3b82f6" },
                { w: stats.fisicas.intensidadPct.correr,  c: "#f97316" },
                { w: stats.fisicas.intensidadPct.sprint,  c: "#ef4444" },
              ].map((seg, i) => (
                <div key={i} style={{ width: `${seg.w}%`, backgroundColor: seg.c }} />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1 pt-0.5">
              {[
                { label: "Caminar", pct: stats.fisicas.intensidadPct.caminar, color: "#94a3b8" },
                { label: "Trotar",  pct: stats.fisicas.intensidadPct.trotar,  color: "#3b82f6" },
                { label: "Correr",  pct: stats.fisicas.intensidadPct.correr,  color: "#f97316" },
                { label: "Sprint",  pct: stats.fisicas.intensidadPct.sprint,  color: "#ef4444" },
              ].map((z) => (
                <div key={z.label} className="flex items-center gap-1 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                  <span className="text-[8px] text-muted-foreground truncate">
                    {z.label} {z.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sin datos ───────────────────────────────────────────────────── */}
      {!stats.tieneEventos && !stats.tieneFisicas && (
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No hay estadísticas cuantitativas disponibles para este análisis
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function CircularGauge({ value, color, size }: { value: number; color: string; size: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(10, value)) / 10;
  const offset = c * (1 - pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">
          Rating
        </span>
        <span className="font-display font-bold text-base tabular-nums" style={{ color }}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function TotalCell({ icon, label, value, tint }: {
  icon: React.ReactNode; label: string; value: number; tint: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className={`flex items-center gap-1 ${tint}`}>
        {icon}
        <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="font-display font-bold text-base tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function KpiCardComparative({
  icon, title, ratingLabel, ratingColor, bigValue, bigLabel,
  left, right, total, percentLeft,
}: {
  icon: React.ReactNode;
  title: string;
  ratingLabel: string;
  ratingColor: string;
  bigValue: string;
  bigLabel: string;
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
  total: number;
  percentLeft: number;
}) {
  const pctLeft = Math.max(0, Math.min(100, percentLeft));
  const pctRight = 100 - pctLeft;

  return (
    <div className="glass rounded-2xl p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${ratingColor}, transparent 70%)` }}
      />
      <div className="relative space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${ratingColor}22`, color: ratingColor }}
            >
              {icon}
            </div>
            <div>
              <h4 className="text-xs font-display font-bold text-foreground">{title}</h4>
              <p className="text-[9px] text-muted-foreground">{total} totales</p>
            </div>
          </div>
          <span
            className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-display font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${ratingColor}22`, color: ratingColor }}
          >
            {ratingLabel}
          </span>
        </div>

        {/* Big value */}
        <div className="flex items-baseline gap-2">
          <span className="font-display font-bold text-3xl tabular-nums text-foreground">
            {bigValue}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {bigLabel}
          </span>
        </div>

        {/* Barra comparativa W / L */}
        {total > 0 && (
          <div className="space-y-1.5">
            <div className="flex h-2 rounded-full overflow-hidden bg-background/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctLeft}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                style={{ backgroundColor: left.color }}
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctRight}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                style={{ backgroundColor: right.color }}
              />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: left.color }} />
                <span className="text-[10px] text-muted-foreground">
                  {left.label}
                </span>
                <span className="text-[10px] font-display font-bold tabular-nums" style={{ color: left.color }}>
                  {left.value}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-display font-bold tabular-nums" style={{ color: right.color }}>
                  {right.value}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {right.label}
                </span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: right.color }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCardSingle({
  icon, title, value, sub, ratingLabel, ratingColor,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  sub: string;
  ratingLabel: string;
  ratingColor: string;
}) {
  return (
    <div className="glass rounded-2xl p-3 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${ratingColor}, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="shrink-0" style={{ color: ratingColor }}>{icon}</div>
          <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground truncate">
            {title}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-display font-bold text-2xl tabular-nums" style={{ color: ratingColor }}>
            {value}
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{sub}</p>
        <p
          className="text-[8px] font-display font-bold uppercase tracking-wider mt-1 truncate"
          style={{ color: ratingColor }}
        >
          {ratingLabel}
        </p>
      </div>
    </div>
  );
}

function PhysicalCell({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: string; unit: string; color: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1" style={{ color }}>
        {icon}
        <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="font-display font-bold text-sm tabular-nums text-foreground">
          {value}
        </span>
        {unit && <span className="text-[8px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
