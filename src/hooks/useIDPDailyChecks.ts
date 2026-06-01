/**
 * VITAS · useIDPDailyChecks
 *
 * Hook que dispara automáticamente las comprobaciones del IDPAlertService
 * cuando el usuario abre el dashboard del IDP o de un jugador.
 *
 * Comportamiento:
 *   - Corre 1× cuando hay un plan activo cargado
 *   - El servicio internamente deduplica (no spammea)
 *   - Las notificaciones aparecen solo si el usuario ha dado permiso
 *
 * Llamadas que hace:
 *   - IDPAlertService.checkinReminder(plan)  → 7 días antes de fin de mes
 *   - IDPAlertService.planExpired(plan)      → si el mes ya pasó sin checkin
 *
 * No bloquea el render: se ejecuta en useEffect después del paint.
 */
import { useEffect, useRef } from "react";
import { IDPAlertService } from "@/services/real/idpAlertService";
import type { DevelopmentPlan } from "@/lib/idp/idpTypes";

interface Options {
  plan: DevelopmentPlan | null | undefined;
  playerName: string | undefined;
  /** Disable in storybook / tests */
  enabled?: boolean;
}

export function useIDPDailyChecks({ plan, playerName, enabled = true }: Options) {
  // Run-once guard per (planId, mountedAt) — avoid double-fires from StrictMode
  const ranForPlanId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!plan || !playerName) return;
    if (plan.status !== "active") return;
    if (ranForPlanId.current === plan.id) return;
    ranForPlanId.current = plan.id;

    // Fire-and-forget — errors are logged inside the service
    (async () => {
      try {
        await IDPAlertService.checkinReminder(plan, playerName);
        await IDPAlertService.planExpired(plan, playerName);
      } catch (err) {
        console.warn("[useIDPDailyChecks] alert failed:", err);
      }
    })();
  }, [plan, playerName, enabled]);
}
