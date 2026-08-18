/**
 * VITAS · PulseInboxHero — "el inbox de hoy" (Ola 2 del plan UX).
 *
 * Al abrir la app, UNA tarjeta responde "¿qué hay para mí hoy?":
 *  - Novedades REALES desde tu última visita (sesiones de tracking y análisis
 *    nuevos, contados desde datos locales — nunca cifras infladas).
 *  - Si no hay nada nuevo: el ritual — "sube el vídeo del último partido".
 *
 * Estética "marcador bajo focos": líneas de campo como motivo (línea media +
 * círculo central), barrido de luz único al montar, eyebrow Rajdhani, números
 * Geist Mono con count-up. Un momento orquestado, no confeti gratuito.
 */
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Upload, ChevronRight, Radar, FileVideo } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StorageService } from "@/services/real/storageService";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";
import { VideoService } from "@/services/real/videoService";

const LAST_VISIT_KEY = "pulse_last_visit"; // → vitas_pulse_last_visit

function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

/** Motivo de campo: línea media + círculo central, trazado en un solo SVG tenue. */
function PitchMotif() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 120"
      className="pointer-events-none absolute -right-6 -top-4 h-[150%] opacity-[0.07] text-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <line x1="100" y1="-10" x2="100" y2="130" />
      <circle cx="100" cy="60" r="34" />
      <circle cx="100" cy="60" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function PulseInboxHero() {
  const { t, i18n } = useTranslation();

  // Congelado al montar: cuenta contra la visita ANTERIOR, luego sella la nueva.
  const { lastVisit, newSessions, newAnalyses } = useMemo(() => {
    const last = StorageService.get<string | null>(LAST_VISIT_KEY, null);
    const sessions = last
      ? PlayerTrackingService.list().filter((s) => s.savedAt > last).length
      : 0;
    const analyses = last
      ? VideoService.getAll().filter(
          (v) => v.analysisResult?.analyzedAt && v.analysisResult.analyzedAt > last,
        ).length
      : 0;
    return { lastVisit: last, newSessions: sessions, newAnalyses: analyses };
     
  }, []);

  useEffect(() => {
    StorageService.set(LAST_VISIT_KEY, new Date().toISOString());
  }, []);

  const hasNews = newSessions + newAnalyses > 0;
  const today = new Date().toLocaleDateString(i18n.language === "en" ? "en-GB" : "es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } }}
      className="relative overflow-hidden glass-strong rounded-2xl border border-border p-4"
    >
      <PitchMotif />
      {/* Barrido de foco: una sola pasada al montar */}
      <motion.div
        aria-hidden
        initial={{ x: "-130%" }}
        animate={{ x: "150%" }}
        transition={{ duration: 1.6, delay: 0.2, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent skew-x-[-16deg]"
      />

      <motion.p
        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
        className="font-tactical text-[11px] font-semibold uppercase tracking-[0.28em] text-primary"
      >
        {t("pulseInbox.eyebrow")} · <span className="text-muted-foreground normal-case tracking-normal">{today}</span>
      </motion.p>

      {hasNews ? (
        <>
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
            className="font-display font-bold text-lg text-foreground mt-1"
          >
            {t("pulseInbox.newsTitle")}
          </motion.h2>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
            className="mt-2 flex flex-col gap-1.5"
          >
            {newAnalyses > 0 && (
              <Link to="/reports" className="group flex items-center gap-2 text-sm">
                <FileVideo size={14} className="text-cyan-400 shrink-0" />
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  <CountUp value={newAnalyses} />
                </span>
                <span className="text-muted-foreground">{t("pulseInbox.newAnalyses", { count: newAnalyses })}</span>
                <ChevronRight size={13} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
            {newSessions > 0 && (
              <Link to="/lab" className="group flex items-center gap-2 text-sm">
                <Radar size={14} className="text-lime-400 shrink-0" />
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  <CountUp value={newSessions} />
                </span>
                <span className="text-muted-foreground">{t("pulseInbox.newSessions", { count: newSessions })}</span>
                <ChevronRight size={13} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </motion.div>
        </>
      ) : (
        <>
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
            className="font-display font-bold text-lg text-foreground mt-1"
          >
            {lastVisit ? t("pulseInbox.ritualTitle") : t("pulseInbox.firstTitle")}
          </motion.h2>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
            className="text-xs text-muted-foreground mt-0.5"
          >
            {t("pulseInbox.ritualSubtitle")}
          </motion.p>
        </>
      )}

      <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="mt-3">
        <Link
          to="/lab"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-display font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:brightness-110 transition-all"
        >
          <Upload size={15} /> {t("pulseInbox.uploadCta")}
        </Link>
      </motion.div>
    </motion.div>
  );
}
