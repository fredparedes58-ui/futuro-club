/**
 * VITAS · SprintBestCard — mejor marca de sprint del jugador (test de puertas).
 *
 * Estética "marcador de estadio": número protagonista en Geist Mono con count-up,
 * etiqueta Rajdhani (font-tactical), barrido de luz sutil al montar. Procedencia
 * declarada con el componente canónico (DERIVADA → "Calculado"): distancia real
 * medida ÷ tiempo real contado en frames.
 *
 * Sin tests → estado vacío HONESTO con CTA al test (nunca un número inventado).
 */
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Gauge, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SprintTestService } from "@/services/real/sprintTestService";
import { ProvenanceBadge } from "@/components/metrics/MetricValue";

function CountUp({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => v.toFixed(decimals));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export default function SprintBestCard({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const tests = useMemo(() => SprintTestService.getByPlayer(playerId), [playerId]);
  const best = useMemo(
    () => (tests.length ? tests.reduce((a, b) => (b.velocidad_ms > a.velocidad_ms ? b : a)) : null),
    [tests],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden glass rounded-2xl p-4 border border-border"
    >
      {/* Barrido de luz de foco (una pasada, sutil) */}
      <motion.div
        aria-hidden
        initial={{ x: "-120%" }}
        animate={{ x: "140%" }}
        transition={{ duration: 1.4, delay: 0.25, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent skew-x-[-18deg]"
      />

      <div className="flex items-center justify-between mb-2">
        <span className="font-tactical text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1.5">
          <Gauge size={12} className="text-lime-400" /> {t("sprintBestCard.title")}
        </span>
        {best && <ProvenanceBadge provenance="DERIVADA" />}
      </div>

      {best ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tabular-nums text-foreground leading-none">
              <CountUp value={best.velocidad_ms} />
            </span>
            <span className="text-xs text-muted-foreground">m/s</span>
            <span className="font-tactical text-sm font-bold text-lime-400 tabular-nums ml-1">
              {best.velocidad_kmh.toFixed(1)} km/h
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
            {t("sprintBestCard.detail", {
              dist: best.distancia_m,
              time: best.tiempo_s,
              date: best.fecha,
              count: tests.length,
            })}
          </p>
          <Link
            to="/velocidad-sprint"
            className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
          >
            {t("sprintBestCard.newTest")} <ChevronRight size={12} />
          </Link>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("sprintBestCard.empty")}
          </p>
          <Link
            to="/velocidad-sprint"
            className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
          >
            {t("sprintBestCard.measureCta")} <ChevronRight size={12} />
          </Link>
        </>
      )}
    </motion.div>
  );
}
