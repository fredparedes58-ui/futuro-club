/**
 * VITAS · IDP Alert Service
 *
 * Recordatorios push para los hitos del plan IDP mensual:
 *
 *   1. **Checkin reminder** — 7 días antes de fin de mes, para que el coach
 *      complete el cuestionario de revisión mensual.
 *   2. **Plan expired** — el día siguiente al fin de mes, si no se ha hecho
 *      checkin: avisa al coach de que el mes terminó sin cerrar.
 *   3. **Goal at risk** — opcional, durante el mes si un goal está en zona
 *      "at_risk" según el progress tracker.
 *
 * Dedup en localStorage:
 *   - checkin-reminder: 1 vez por plan (key = `idp_checkin_<planId>`)
 *   - plan-expired:     1 vez por plan (key = `idp_expired_<planId>`)
 *   - goal-at-risk:     1 vez por (plan, goal) cada 72h
 *
 * Patrón: idéntico a WellbeingAlertService + InjuryAlertService.
 */

import { PushNotificationService } from "./pushNotificationService";
import type { DevelopmentPlan, IDPGoal } from "@/lib/idp/idpTypes";
import { daysRemainingInMonth } from "@/lib/idp";

const PREFIX_CHECKIN = "vitas_idp_checkin_";
const PREFIX_EXPIRED = "vitas_idp_expired_";
const PREFIX_AT_RISK = "vitas_idp_atrisk_";

const AT_RISK_DEDUP_MS = 72 * 60 * 60 * 1000; // 72 h

/** Días antes del fin de mes a partir de los cuales avisamos del checkin. */
const CHECKIN_REMINDER_WINDOW_DAYS = 7;

function alreadyAlerted(key: string, dedupMs?: number): boolean {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  if (!dedupMs) return true; // single-use dedup
  const elapsed = Date.now() - parseInt(raw, 10);
  return elapsed < dedupMs;
}

function markAlerted(key: string): void {
  localStorage.setItem(key, Date.now().toString());
}

export const IDPAlertService = {
  /**
   * Avisa al coach 7 días antes del fin de mes para hacer checkin.
   * Solo dispara si:
   *   - Plan en estado `active` (no draft, no completed)
   *   - Ya hemos entrado en la ventana de 7 días
   *   - No se ha disparado para este plan antes
   *
   * Returns true if a notification was fired.
   */
  async checkinReminder(plan: DevelopmentPlan, playerName: string): Promise<boolean> {
    if (plan.status !== "active") return false;

    const remaining = daysRemainingInMonth(plan.monthEnd);
    if (remaining > CHECKIN_REMINDER_WINDOW_DAYS) return false;
    if (remaining < 0) return false; // ya pasó — esto es plan-expired

    // ¿ya tiene checkin? Si sí, no avisamos.
    if ((plan.checkins ?? []).some((c) => !c.goalId)) return false;

    const key = `${PREFIX_CHECKIN}${plan.id}`;
    if (alreadyAlerted(key)) return false;
    markAlerted(key);

    await PushNotificationService.showLocal(
      `📝 Checkin del Plan IDP — ${playerName}`,
      `Quedan ${remaining} día${remaining === 1 ? "" : "s"} para cerrar el mes. Completa la revisión mensual del plan.`,
      "/pwa-192x192.png",
      `/idp/${plan.playerId}?tab=checkin`,
    );
    return true;
  },

  /**
   * Avisa el día después del fin de mes si el plan sigue `active` (no se cerró).
   * Útil para evitar planes "huérfanos" del mes pasado.
   */
  async planExpired(plan: DevelopmentPlan, playerName: string): Promise<boolean> {
    if (plan.status !== "active") return false;

    const remaining = daysRemainingInMonth(plan.monthEnd);
    if (remaining >= 0) return false; // todavía no ha terminado

    const key = `${PREFIX_EXPIRED}${plan.id}`;
    if (alreadyAlerted(key)) return false;
    markAlerted(key);

    await PushNotificationService.showLocal(
      `⏰ Plan IDP del mes pasado sin cerrar — ${playerName}`,
      `Cierra el plan con un checkin para que el próximo mes use el contexto.`,
      "/pwa-192x192.png",
      `/idp/${plan.playerId}?tab=checkin`,
    );
    return true;
  },

  /**
   * Avisa cuando un goal específico entra en zona "at risk" (>50% del mes
   * transcurrido pero <30% de progreso). Dedup 72h por (plan, goal).
   */
  async goalAtRisk(
    plan: DevelopmentPlan,
    goal: IDPGoal,
    playerName: string,
    progressPct: number,
  ): Promise<boolean> {
    if (plan.status !== "active") return false;

    const key = `${PREFIX_AT_RISK}${plan.id}_${goal.id}`;
    if (alreadyAlerted(key, AT_RISK_DEDUP_MS)) return false;
    markAlerted(key);

    await PushNotificationService.showLocal(
      `⚠️ Objetivo en riesgo — ${playerName}`,
      `"${goal.title}" lleva ${progressPct}% de progreso. Revisa los drills asignados.`,
      "/pwa-192x192.png",
      `/idp/${plan.playerId}`,
    );
    return true;
  },

  /**
   * Batch — corre las 3 comprobaciones sobre un set de planes activos.
   * Útil para llamar 1× al día desde un service worker o al login.
   */
  async runDailyChecks(
    plans: Array<{ plan: DevelopmentPlan; playerName: string }>,
  ): Promise<{ checkin: number; expired: number; atRisk: number }> {
    let checkinCount = 0;
    let expiredCount = 0;
    const atRiskCount = 0;

    for (const { plan, playerName } of plans) {
      if (await this.checkinReminder(plan, playerName)) checkinCount++;
      if (await this.planExpired(plan, playerName)) expiredCount++;
      // Goal at-risk requires the live metrics → caller orchestrates that
    }

    return { checkin: checkinCount, expired: expiredCount, atRisk: atRiskCount };
  },

  /** Borra todas las dedup keys (útil al logout o factory reset). */
  clearAll(): void {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key?.startsWith(PREFIX_CHECKIN) ||
        key?.startsWith(PREFIX_EXPIRED) ||
        key?.startsWith(PREFIX_AT_RISK)
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },

  /** Borra dedup de un plan concreto (útil cuando se completa). */
  clearPlan(planId: string): void {
    localStorage.removeItem(`${PREFIX_CHECKIN}${planId}`);
    localStorage.removeItem(`${PREFIX_EXPIRED}${planId}`);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${PREFIX_AT_RISK}${planId}_`)) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },
};
