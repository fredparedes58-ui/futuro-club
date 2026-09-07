/**
 * VITAS · GlobalDemoBanner
 *
 * Banner global y persistente que se muestra en TODAS las superficies cuando la
 * app corre en modo DEMO (IS_DEMO). Garantía de honestidad transversal
 * (invariante #4 de CLAUDE.md / metricas.md): ninguna pantalla del demo puede
 * enseñar cifras o texto de IA de ejemplo sin declarar que son ficticios. Los
 * `DemoDataBanner` por-superficie siguen existiendo; este cubre el resto (Pulse,
 * Hub, informes, ScoutFeed y cualquier ruta futura) de una sola vez.
 *
 * No es descartable a propósito: la declaración de «datos de ejemplo» debe
 * seguir visible durante toda la sesión del demo.
 */

import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";

export default function GlobalDemoBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center"
    >
      <p className="text-[12px] leading-tight text-amber-200 flex items-center justify-center gap-1.5">
        <FlaskConical size={13} className="shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">
            {t("globalDemoBanner.tag", "DEMO")}
          </span>{" "}
          {t(
            "globalDemoBanner.message",
            "Datos de ejemplo — jugadores y análisis ficticios para demostración. No son datos reales de menores.",
          )}
        </span>
      </p>
    </div>
  );
}
