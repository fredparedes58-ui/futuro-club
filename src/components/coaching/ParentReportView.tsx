/**
 * VITAS · ParentReportView (Sprint 16)
 *
 * Parent-friendly report view with non-technical language,
 * simple progress bars, and encouraging tone.
 */
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, Heart, Star,
  MessageSquare, Sprout, User,
} from "lucide-react";
import type { ParentReport } from "@/lib/shared/sessionTypes";

interface Props {
  report: ParentReport;
}

const TREND_ICON: Record<string, React.ElementType> = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};
const TREND_COLOR: Record<string, string> = {
  improving: "text-emerald-400",
  stable: "text-muted-foreground",
  declining: "text-amber-400",
};
const TREND_LABEL: Record<string, string> = {
  improving: "Mejorando",
  stable: "Estable",
  declining: "Necesita apoyo",
};

const TREND_CATEGORIES = [
  { key: "participation", label: "Participación" },
  { key: "technique",     label: "Técnica" },
  { key: "physical",      label: "Condición Física" },
  { key: "social",        label: "Integración Social" },
] as const;

function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

export default function ParentReportView({ report }: Props) {
  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <motion.div
        className="glass rounded-xl p-5 text-center space-y-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <User size={28} className="mx-auto text-primary" />
        <h2 className="text-lg font-bold text-foreground">{report.playerName}</h2>
        <p className="text-xs text-muted-foreground">
          Reporte mensual — {report.reportMonth}
        </p>
      </motion.div>

      {/* Summary */}
      <motion.div
        className="glass rounded-xl p-4 space-y-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Resumen del Mes
        </span>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-foreground">
              {report.summary.sessionsAttended}
            </div>
            <div className="text-[10px] text-muted-foreground">Sesiones</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-foreground">
              {report.summary.totalTrainingMinutes}
            </div>
            <div className="text-[10px] text-muted-foreground">Min entrenados</div>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Participación</span>
              <span className="font-mono font-bold text-foreground">
                {report.summary.avgParticipationScore}/100
              </span>
            </div>
            <ProgressBar value={report.summary.avgParticipationScore} />
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Compromiso</span>
              <span className="font-mono font-bold text-foreground">
                {report.summary.avgEngagementScore}/100
              </span>
            </div>
            <ProgressBar value={report.summary.avgEngagementScore} />
          </div>
        </div>
      </motion.div>

      {/* Trends */}
      <motion.div
        className="glass rounded-xl p-4 space-y-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Evolución
        </span>
        <div className="grid grid-cols-2 gap-2">
          {TREND_CATEGORIES.map(({ key, label }) => {
            const trend = report.trends[key];
            const TIcon = TREND_ICON[trend];
            return (
              <div key={key} className="flex items-center gap-2 glass rounded-lg p-2">
                <TIcon size={14} className={TREND_COLOR[trend]} />
                <div>
                  <div className="text-[10px] font-bold text-foreground">{label}</div>
                  <div className={`text-[9px] ${TREND_COLOR[trend]}`}>
                    {TREND_LABEL[trend]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Growth Context (PHV) */}
      {report.growthContext && (
        <motion.div
          className="glass rounded-xl p-4 border border-amber-500/20 space-y-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <Sprout size={16} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">
              Sobre su Crecimiento
            </span>
          </div>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            {report.growthContext}
          </p>
        </motion.div>
      )}

      {/* Positives */}
      <motion.div
        className="glass rounded-xl p-4 space-y-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2">
          <Star size={14} className="text-amber-400" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Aspectos Positivos
          </span>
        </div>
        {report.positives.map((p, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
            <Heart size={10} className="text-rose-400 mt-1 shrink-0" />
            <span>{p}</span>
          </div>
        ))}
      </motion.div>

      {/* Development areas */}
      {report.developmentAreas.length > 0 && (
        <motion.div
          className="glass rounded-xl p-4 space-y-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Áreas de Desarrollo
          </span>
          {report.developmentAreas.map((a, i) => (
            <p key={i} className="text-[11px] text-foreground/70 leading-relaxed">
              {a}
            </p>
          ))}
        </motion.div>
      )}

      {/* Coach Note */}
      <motion.div
        className="glass rounded-xl p-4 space-y-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-primary" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Nota del Entrenador
          </span>
        </div>
        <p className="text-[11px] text-foreground/80 leading-relaxed italic">
          "{report.coachNote}"
        </p>
      </motion.div>
    </div>
  );
}
