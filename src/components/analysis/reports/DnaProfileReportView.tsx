/**
 * VITAS · DnaProfileReportView
 *
 * Renderer dedicado para el reporte `dna-profile` (agente api/agents/_dna-profile.ts).
 * Antes caía al ReportRenderer genérico, que solo mapea `title` → todos los campos
 * ricos del ADN (estilo, rol, comportamiento bajo presión, lectura de juego, etiquetas)
 * se descartaban silenciosamente. Pinta la ESTRUCTURA del prompt:
 *   title · primary_style · style_summary · natural_role · current_role ·
 *   role_alignment · tactical_labels[] · pressure_behavior · game_reading ·
 *   confidence_score · data_completeness · not_evaluated[]
 *
 * Honestidad: los valores tipo "No observado en este vídeo" / "no determinable con
 * este vídeo" (docx #14 P2) se pintan TAL CUAL — no se ocultan. Todo el ADN es
 * ESTIMADO POR IA (badge de procedencia). Campos opcionales → ?? y condicionales.
 *
 * El `content` de dna llega ENVUELTO ({success,data:{...,dna}}) porque el agente usa
 * la clave `dna` en vez de `report` → se desenvuelve tolerante como los demás renderers.
 */

import { useTranslation } from "react-i18next";
import { Dna, Compass, Sparkles, ShieldHalf, Eye, Cpu } from "lucide-react";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";

const ALIGNMENT_META: Record<string, { color: string; key: string }> = {
  aligned: { color: "border-green-500/30 bg-green-500/10 text-green-400", key: "aligned" },
  adjacent: { color: "border-amber-500/30 bg-amber-500/10 text-amber-400", key: "adjacent" },
  misaligned: { color: "border-destructive/30 bg-destructive/10 text-destructive", key: "misaligned" },
};

const asText = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" && "title" in v ? String((v as { title?: unknown }).title ?? "") : "";

export default function DnaProfileReportView({ report }: { report: Record<string, unknown> }) {
  const { t } = useTranslation();

  // Unwrap tolerante: content puede venir como {success,data:{...,dna}}, como {dna},
  // o como el propio objeto dna. Buscamos el que tenga los campos del ADN.
  const root =
    report.data && typeof report.data === "object" && !Array.isArray(report.data)
      ? (report.data as Record<string, unknown>)
      : report;
  const dna =
    root.dna && typeof root.dna === "object" && !Array.isArray(root.dna)
      ? (root.dna as Record<string, unknown>)
      : root;

  const title = (dna.title as string | undefined) ?? undefined;
  const primaryStyle = (dna.primary_style as string | undefined) ?? undefined;
  const styleSummary = (dna.style_summary as string | undefined) ?? undefined;
  const naturalRole = (dna.natural_role as string | undefined) ?? undefined;
  const currentRole = (dna.current_role as string | undefined) ?? undefined;
  const roleAlignment = (dna.role_alignment as string | undefined) ?? undefined;
  const tacticalLabels = Array.isArray(dna.tactical_labels) ? (dna.tactical_labels as unknown[]) : [];
  const pressureBehavior = (dna.pressure_behavior as string | undefined) ?? undefined;
  const gameReading = (dna.game_reading as string | undefined) ?? undefined;

  const isEmpty =
    !title && !primaryStyle && !styleSummary && !naturalRole && !currentRole &&
    tacticalLabels.length === 0 && !pressureBehavior && !gameReading;

  if (isEmpty) {
    return <p className="text-xs text-muted-foreground italic">{t("dnaProfileReport.noContent")}</p>;
  }

  const alignMeta = (roleAlignment && ALIGNMENT_META[roleAlignment]) || null;

  return (
    <div className="space-y-4">
      {/* Confianza (el dispatcher no la encuentra por el envoltorio → aquí, sobre el dna) */}
      <ReportConfidenceChip report={dna} />

      {/* Badge de procedencia: todo el ADN es estimado por IA */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Cpu size={11} className="text-primary" />
        <span className="uppercase tracking-wider font-bold">{t("dnaProfileReport.aiEstimated")}</span>
      </div>

      {/* Estilo principal + resumen */}
      {(primaryStyle || styleSummary || title) && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Dna size={13} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
              {t("dnaProfileReport.style")}
            </span>
          </div>
          {primaryStyle && (
            <p className="font-display font-bold text-base text-foreground capitalize leading-snug">{primaryStyle}</p>
          )}
          {styleSummary && <p className="text-xs text-foreground/90 leading-relaxed mt-1">{styleSummary}</p>}
        </div>
      )}

      {/* Rol natural vs actual + alineación */}
      {(naturalRole || currentRole) && (
        <div className="rounded-xl bg-secondary/30 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Compass size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {t("dnaProfileReport.role")}
            </span>
            {alignMeta && (
              <span className={`ml-auto inline-flex px-2 py-0.5 rounded-full border text-[9px] uppercase tracking-wider font-bold ${alignMeta.color}`}>
                {t(`dnaProfileReport.alignment.${alignMeta.key}`)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 text-xs">
            {naturalRole && (
              <div>
                <span className="text-muted-foreground">{t("dnaProfileReport.naturalRole")}: </span>
                <span className="font-semibold text-foreground">{naturalRole}</span>
              </div>
            )}
            {currentRole && (
              <div>
                <span className="text-muted-foreground">{t("dnaProfileReport.currentRole")}: </span>
                <span className="text-foreground">{currentRole}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Etiquetas tácticas */}
      {tacticalLabels.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={13} className="text-electric" />
            <h5 className="font-display font-bold text-xs text-electric">{t("dnaProfileReport.tacticalLabels")}</h5>
          </div>
          <div className="flex flex-wrap gap-1">
            {tacticalLabels.map((label, i) => {
              const text = asText(label);
              if (!text) return null;
              return (
                <span key={i} className="inline-flex px-2 py-0.5 rounded-full border border-electric/30 bg-electric/10 text-[10px] font-bold text-electric">
                  {text}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Comportamiento bajo presión + lectura de juego */}
      <div className="grid gap-2 sm:grid-cols-2">
        {pressureBehavior && (
          <div className="rounded-xl bg-secondary/30 border border-border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldHalf size={12} className="text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                {t("dnaProfileReport.pressureBehavior")}
              </span>
            </div>
            <p className="text-[11px] text-foreground/90 leading-relaxed">{pressureBehavior}</p>
          </div>
        )}
        {gameReading && (
          <div className="rounded-xl bg-secondary/30 border border-border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Eye size={12} className="text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                {t("dnaProfileReport.gameReading")}
              </span>
            </div>
            <p className="text-[11px] text-foreground/90 leading-relaxed">{gameReading}</p>
          </div>
        )}
      </div>
    </div>
  );
}
