/**
 * InjuryAlertService — Push notifications when injury risk exceeds threshold
 *
 * Checks injury risk after each analysis and triggers:
 * - Browser push notification to coach/parent
 * - ScoutFeed-style alert entry in localStorage
 * - Optional email via Resend (server-side, triggered by pipeline)
 *
 * Sprint 11: Injury Dashboard & Alerts
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface InjuryAlert {
  id: string;
  playerId: string;
  playerName: string;
  riskLevel: number;
  riskCategory: "moderate" | "high" | "critical";
  topFactor: string;
  recommendation: string;
  createdAt: string;
  dismissed: boolean;
}

// ── Storage ─────────────────────────────────────────────────────────────────

const ALERTS_KEY = "vitas_injury_alerts";
const THRESHOLD = 50; // Only alert for risk >= 50 (high/critical)
const MAX_ALERTS = 50;

// ── Service ─────────────────────────────────────────────────────────────────

export const InjuryAlertService = {
  /**
   * Check risk and create alert if threshold exceeded.
   * Called after injury-risk-calculator returns.
   */
  checkAndAlert(params: {
    playerId: string;
    playerName: string;
    riskLevel: number;
    riskCategory: string;
    topFactor: string;
    recommendations: string[];
  }): InjuryAlert | null {
    if (params.riskLevel < THRESHOLD) return null;

    const category = params.riskCategory as "moderate" | "high" | "critical";
    if (!["moderate", "high", "critical"].includes(category)) return null;

    const alert: InjuryAlert = {
      id: `alert-${Date.now()}-${params.playerId}`,
      playerId: params.playerId,
      playerName: params.playerName,
      riskLevel: params.riskLevel,
      riskCategory: category,
      topFactor: params.topFactor,
      recommendation: params.recommendations[0] ?? "Monitorizar al jugador",
      createdAt: new Date().toISOString(),
      dismissed: false,
    };

    // Save to localStorage
    const alerts = this.getAll();
    // Dedup: don't alert twice for same player within 24h
    const recent = alerts.find(
      (a) =>
        a.playerId === params.playerId &&
        !a.dismissed &&
        Date.now() - new Date(a.createdAt).getTime() < 24 * 60 * 60 * 1000,
    );
    if (recent) return null; // Already alerted recently

    alerts.unshift(alert);
    if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS;

    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch {
      // Storage full — ignore
    }

    // Trigger browser push notification
    this._sendPushNotification(alert);

    return alert;
  },

  /** Get all alerts */
  getAll(): InjuryAlert[] {
    try {
      const raw = localStorage.getItem(ALERTS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as InjuryAlert[];
    } catch {
      return [];
    }
  },

  /** Get active (non-dismissed) alerts */
  getActive(): InjuryAlert[] {
    return this.getAll().filter((a) => !a.dismissed);
  },

  /** Get alerts for a specific player */
  getForPlayer(playerId: string): InjuryAlert[] {
    return this.getAll().filter((a) => a.playerId === playerId);
  },

  /** Dismiss an alert */
  dismiss(alertId: string): void {
    const alerts = this.getAll();
    const alert = alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.dismissed = true;
      try {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
      } catch {
        // Ignore
      }
    }
  },

  /** Dismiss all alerts for a player */
  dismissForPlayer(playerId: string): void {
    const alerts = this.getAll();
    alerts.forEach((a) => {
      if (a.playerId === playerId) a.dismissed = true;
    });
    try {
      localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch {
      // Ignore
    }
  },

  /** Clear all alerts */
  clear(): void {
    localStorage.removeItem(ALERTS_KEY);
  },

  /** Send browser push notification (best-effort) */
  _sendPushNotification(alert: InjuryAlert): void {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") {
      // Request permission (non-blocking)
      Notification.requestPermission().catch(() => {});
      return;
    }

    const categoryEmoji =
      alert.riskCategory === "critical" ? "🔴" :
      alert.riskCategory === "high" ? "🟠" :
      "🟡";

    try {
      new Notification(`${categoryEmoji} VITAS · Alerta Riesgo Lesion`, {
        body: `${alert.playerName}: Riesgo ${alert.riskLevel}/100 (${alert.riskCategory}). ${alert.recommendation}`,
        icon: "/pwa-192x192.png",
        badge: "/pwa-64x64.png",
        tag: `injury-${alert.playerId}`,
        requireInteraction: alert.riskCategory === "critical",
      });
    } catch {
      // Notification failed — ignore
    }
  },

  /** Request notification permission (call from UI interaction) */
  requestPermission(): Promise<NotificationPermission> {
    if (!("Notification" in window)) return Promise.resolve("denied" as NotificationPermission);
    return Notification.requestPermission();
  },
};
