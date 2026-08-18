/**
 * VITAS · ModelLoadingOverlay — descarga del modelo, narrada.
 *
 * El worker de tracking ya emite % + mensaje por etapa (descargar → cargar en
 * memoria); antes casi no se veía ("barra muda"). Este overlay lo surfacea con
 * contexto honesto: cuánto pesa y que se descarga UNA vez y queda cacheado, para
 * que la espera de la primera vez se entienda en vez de sufrirse.
 *
 * Firma visual "marcador de estadio": anillo de progreso, % en mono, etiqueta
 * Rajdhani, barrido de foco.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export default function ModelLoadingOverlay({
  progress,
  message,
  sizeMb,
}: {
  progress: number;
  message: string;
  sizeMb: number;
}) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden bg-[#0b1220]/85 backdrop-blur-sm"
    >
      {/* barrido de foco */}
      <motion.div
        aria-hidden
        initial={{ x: "-130%" }}
        animate={{ x: "150%" }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent skew-x-[-16deg]"
      />

      {/* anillo de progreso */}
      <div className="relative">
        <svg width="120" height="120" className="-rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="6" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="#0059B3"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - pct / 100) }}
            transition={{ ease: "easeOut", duration: 0.4 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-2xl font-bold text-white tabular-nums">
            {pct}
            <span className="text-sm text-white/60">%</span>
          </span>
        </div>
      </div>

      <div className="max-w-xs px-6 text-center">
        <p className="font-tactical text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
          {t("modelLoading.title")}
        </p>
        <p className="mt-1 text-sm text-white/90">{message || t("modelLoading.preparing")}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">
          {t("modelLoading.context", { mb: sizeMb })}
        </p>
      </div>
    </motion.div>
  );
}
