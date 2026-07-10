/**
 * VITAS · DemoDataBanner
 *
 * Aviso honesto de "datos de demostración". Se muestra cuando un panel pinta
 * datos de muestra porque todavía no existe la fuente real (p.ej. analítica de
 * sesión de entrenamiento sin vídeo analizado). Evita que el usuario tome los
 * datos de ejemplo como métricas reales del equipo.
 */
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  /** Clave i18n del mensaje contextual (default: demoData.generic). */
  messageKey?: string;
}

export default function DemoDataBanner({ messageKey }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <FlaskConical size={14} className="text-amber-400 mt-0.5 shrink-0" />
      <p className="text-[11px] leading-relaxed">
        <span className="font-bold text-amber-300">{t("demoData.title")}</span>{" "}
        <span className="text-foreground/70">{t(messageKey ?? "demoData.generic")}</span>
      </p>
    </div>
  );
}
