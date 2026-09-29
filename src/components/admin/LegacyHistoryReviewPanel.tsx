/**
 * VITAS · Revisión VSI (pestaña del panel /admin)
 *
 * Lista para REVISIÓN HUMANA los jugadores cuyo historial VSI legacy contiene el 57.5
 * fabricado antes de #146 (barras por defecto guardadas sin evaluación). Fuente:
 * /api/admin/vsi-suspects → vista v_vsi_default_suspects (migración 070).
 *
 * Solo lectura: nada se borra ni se corrige desde aquí. La resolución (tras hablar con
 * el entrenador) es una UPDATE documentada en la 070. Sin nombres (minimización RGPD:
 * son menores); el id basta para localizar al jugador.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/apiAuth";

export interface VsiSuspect {
  id: string;
  user_id: string;
  created_at: string;
  vsi: number | null;
  vsi_history: number[] | null;
  data_vsi_history: unknown;
  review_reason: string;
  flagged_at: string;
  current_vsi_is_default: boolean;
  metrics_are_default: boolean;
}

async function fetchVsiSuspects(): Promise<VsiSuspect[]> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/admin/vsi-suspects", { headers });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { suspects?: VsiSuspect[] }; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json.data?.suspects ?? [];
}

/** Historial legacy a mostrar: la columna o, si está vacía, el del blob. */
function legacyHistory(s: VsiSuspect): number[] {
  if (Array.isArray(s.vsi_history) && s.vsi_history.length > 0) return s.vsi_history;
  return Array.isArray(s.data_vsi_history)
    ? (s.data_vsi_history as unknown[]).filter((v): v is number => typeof v === "number")
    : [];
}

export default function LegacyHistoryReviewPanel() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-vsi-suspects"],
    queryFn: fetchVsiSuspects,
    staleTime: 60_000,
    retry: 0,
  });

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);

  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <div>
        <h3 className="font-display font-bold text-sm text-foreground">{t("adminDashboardPage.vsiReview.title")}</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{t("adminDashboardPage.vsiReview.desc")}</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-primary" />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-lg border border-destructive/30 p-3 text-xs">
          <div className="flex items-center gap-2 text-destructive font-semibold">
            <AlertCircle size={13} /> {t("adminDashboardPage.vsiReview.error")}
          </div>
          <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      )}

      {data && !isLoading && data.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("adminDashboardPage.vsiReview.empty")}</p>
      )}

      {data && !isLoading && data.length > 0 && (
        <>
          <p className="text-xs font-display font-semibold text-foreground">
            {t("adminDashboardPage.vsiReview.count", { count: data.length })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">{t("adminDashboardPage.vsiReview.colPlayer")}</th>
                  <th className="py-1 pr-3">{t("adminDashboardPage.vsiReview.colOwner")}</th>
                  <th className="py-1 pr-3">{t("adminDashboardPage.vsiReview.colCreated")}</th>
                  <th className="py-1 pr-3">{t("adminDashboardPage.vsiReview.colHistory")}</th>
                  <th className="py-1">{t("adminDashboardPage.vsiReview.colFlags")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="border-t border-border/40 align-top" data-testid="vsi-suspect-row">
                    <td className="py-1.5 pr-3 font-mono">{s.id}</td>
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground">{s.user_id}</td>
                    <td className="py-1.5 pr-3">{fmtDate(s.created_at)}</td>
                    <td className="py-1.5 pr-3 font-mono">{legacyHistory(s).join(" → ")}</td>
                    <td className="py-1.5 space-y-0.5">
                      {s.current_vsi_is_default && <div>{t("adminDashboardPage.vsiReview.flagCurrentDefault")}</div>}
                      {s.metrics_are_default && <div>{t("adminDashboardPage.vsiReview.flagMetricsDefault")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{t("adminDashboardPage.vsiReview.resolveHint")}</p>
        </>
      )}
    </div>
  );
}
