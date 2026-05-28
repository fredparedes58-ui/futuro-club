/**
 * VITAS · Wellbeing Alert Service (Sprint 22)
 *
 * Push notification when dropout risk > 50.
 * Pattern: identical to injuryAlertService.ts.
 * Deduplicates by playerId — only fires once per 24h per player.
 * Stores dedup keys in localStorage.
 */

import { PushNotificationService } from "./pushNotificationService";

const DEDUP_PREFIX = "vitas_wellbeing_alert_";
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export const WellbeingAlertService = {
  /**
   * Check if a dropout risk alert should fire, and fire it if so.
   * Only alerts when riskScore > 50 (high or critical).
   * Deduplicates: max 1 notification per player per 24h.
   */
  async checkAndAlert(
    playerId: string,
    playerName: string,
    riskScore: number,
    riskLevel: "low" | "moderate" | "high" | "critical",
    primaryFactor: string,
  ): Promise<boolean> {
    // Only alert for high or critical
    if (riskScore <= 50) return false;

    // Dedup check
    const key = `${DEDUP_PREFIX}${playerId}`;
    const lastAlerted = localStorage.getItem(key);
    if (lastAlerted) {
      const elapsed = Date.now() - parseInt(lastAlerted, 10);
      if (elapsed < DEDUP_WINDOW_MS) return false;
    }

    // Save dedup timestamp
    localStorage.setItem(key, Date.now().toString());

    // Build notification
    const emoji = riskLevel === "critical" ? "🚨" : "⚠️";
    const factorLabel = FACTOR_LABELS[primaryFactor] ?? primaryFactor;

    await PushNotificationService.showLocal(
      `${emoji} Alerta de bienestar — ${playerName}`,
      `Riesgo de abandono: ${riskScore}/100 (${LEVEL_LABELS[riskLevel]}). Factor principal: ${factorLabel}.`,
      "/pwa-192x192.png",
      `/wellbeing?playerId=${encodeURIComponent(playerId)}`,
    );

    return true;
  },

  /**
   * Batch check: evaluate multiple players and alert for any with risk > 50.
   */
  async batchCheck(
    players: Array<{
      playerId: string;
      playerName: string;
      riskScore: number;
      riskLevel: "low" | "moderate" | "high" | "critical";
      primaryFactor: string;
    }>,
  ): Promise<string[]> {
    const alerted: string[] = [];
    for (const p of players) {
      const fired = await this.checkAndAlert(
        p.playerId, p.playerName, p.riskScore, p.riskLevel, p.primaryFactor,
      );
      if (fired) alerted.push(p.playerId);
    }
    return alerted;
  },

  /**
   * Clear dedup cache for a specific player (e.g., after intervention).
   */
  clearAlert(playerId: string): void {
    localStorage.removeItem(`${DEDUP_PREFIX}${playerId}`);
  },

  /**
   * Clear all wellbeing alert dedup entries.
   */
  clearAll(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DEDUP_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  },
};

// ─── Labels ────────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  low: "bajo",
  moderate: "moderado",
  high: "alto",
  critical: "crítico",
};

const FACTOR_LABELS: Record<string, string> = {
  engagementDecline: "Declive de engagement",
  motivationType: "Tipo de motivación",
  overtrainingRisk: "Sobreentrenamiento",
  vsiStagnation: "Estancamiento VSI",
  attendanceDecline: "Descenso de asistencia",
  injuryRecurrence: "Recurrencia de lesiones",
  growthSpurtStress: "Estrés por estirón",
  lowResilience: "Baja resiliencia",
};
