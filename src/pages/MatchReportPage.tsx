/**
 * VITAS · Match Report Page (FASE 3c-3) · /equipo/partido
 *
 * Feature "Partido A vs B": el coach describe dos equipos (local vs visitante)
 * y recibe un informe táctico comparativo generado por el agente team-report.
 * Patrón de UI idéntico a CompareRivalPage (form → generate → view).
 *
 * Bilingüe: pasa locale = idioma activo de la app (FASE 5).
 * Fail-safe: si el agente cae a mock/error, el informe igual se muestra
 * (marcado con source) y el chip de confianza refleja la incertidumbre.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList, Sparkles, Loader2, AlertCircle, Home, Plane } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";
import i18n from "@/i18n";
import { normalizeLocale } from "@/lib/shared/locale";
import TeamReportView from "@/components/analysis/reports/TeamReportView";

export default function MatchReportPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [homeName, setHomeName] = useState("");
  const [homeFormation, setHomeFormation] = useState("");
  const [homeNotes, setHomeNotes] = useState("");
  const [awayName, setAwayName] = useState("");
  const [awayFormation, setAwayFormation] = useState("");
  const [awayNotes, setAwayNotes] = useState("");
  const [matchContext, setMatchContext] = useState("");

  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!homeName.trim() || !awayName.trim()) {
      toast.error(t("matchReportPage.namesRequiredToast"));
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/agents/team-report", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          homeFormation: homeFormation.trim() || undefined,
          awayFormation: awayFormation.trim() || undefined,
          teamMetrics: {
            home: { name: homeName.trim(), notes: homeNotes.trim() || undefined },
            away: { name: awayName.trim(), notes: awayNotes.trim() || undefined },
            matchContext: matchContext.trim() || undefined,
          },
          locale: normalizeLocale(i18n.language),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message ?? t("matchReportPage.errorGenerating"));
      }
      // successResponse envuelve en { data }, y el agente vuelve a envolver en { data }
      const payload = (json.data?.data ?? json.data ?? json) as Record<string, unknown>;
      const rep = (payload.report ?? {}) as Record<string, unknown>;
      setReport(rep);
      toast.success(t("matchReportPage.generatedToast"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("matchReportPage.errorGeneric");
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  // ── Result view ──────────────────────────────────────────────────
  if (report) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-display font-bold text-foreground truncate">
                {t("matchReportPage.resultTitle", { home: homeName, away: awayName })}
              </h1>
              <p className="text-[10px] text-muted-foreground">{t("matchReportPage.resultSubtitle")}</p>
            </div>
            <button onClick={() => setReport(null)} className="text-[11px] text-primary hover:text-primary/80 font-bold">
              {t("matchReportPage.edit")}
            </button>
          </div>
        </div>
        <div className="px-4 py-4 max-w-2xl mx-auto">
          <TeamReportView report={report} />
        </div>
      </div>
    );
  }

  // ── Form view ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {t("matchReportPage.headerTitle")}
            </h1>
            <p className="text-[10px] text-muted-foreground">{t("matchReportPage.headerSubtitle")}</p>
          </div>
          <ClipboardList size={18} className="text-electric" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Team A · home */}
          <TeamCard
            Icon={Home}
            title={t("matchReportPage.homeTitle")}
            color="#0066CC"
            name={homeName}
            onName={setHomeName}
            formation={homeFormation}
            onFormation={setHomeFormation}
            notes={homeNotes}
            onNotes={setHomeNotes}
          />
          {/* Team B · away */}
          <TeamCard
            Icon={Plane}
            title={t("matchReportPage.awayTitle")}
            color="#F59E0B"
            name={awayName}
            onName={setAwayName}
            formation={awayFormation}
            onFormation={setAwayFormation}
            notes={awayNotes}
            onNotes={setAwayNotes}
          />
        </div>

        <div className="glass rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
              {t("matchReportPage.contextLabel")}
            </label>
            <textarea
              value={matchContext}
              onChange={(e) => setMatchContext(e.target.value)}
              rows={2}
              placeholder={t("matchReportPage.contextPlaceholder")}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 flex items-center gap-2 text-[11px] text-destructive">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !homeName.trim() || !awayName.trim()}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {generating ? (
              <><Loader2 size={14} className="animate-spin" /> {t("matchReportPage.analyzing")}</>
            ) : (
              <><Sparkles size={14} /> {t("matchReportPage.generate")}</>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">{t("matchReportPage.footer")}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: tarjeta de equipo ─────────────────────────────

function TeamCard({
  Icon, title, color, name, onName, formation, onFormation, notes, onNotes,
}: {
  Icon: LucideIcon;
  title: string;
  color: string;
  name: string;
  onName: (v: string) => void;
  formation: string;
  onFormation: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon size={13} style={{ color }} />
        </div>
        <h2 className="font-display font-bold text-sm text-foreground">{title}</h2>
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.teamNameLabel")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t("matchReportPage.teamNamePlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.formationLabel")}
        </label>
        <input
          type="text"
          value={formation}
          onChange={(e) => onFormation(e.target.value)}
          placeholder={t("matchReportPage.formationPlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.notesLabel")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          rows={3}
          placeholder={t("matchReportPage.notesPlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
        />
      </div>
    </motion.div>
  );
}
