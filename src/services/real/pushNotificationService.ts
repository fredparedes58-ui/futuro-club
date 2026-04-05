/**
 * VITAS — Push Notification Service
 * Gestiona suscripciones Web Push para notificaciones nativas.
 * Requiere: VITE_VAPID_PUBLIC_KEY en env vars.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export const PushNotificationService = {
  isSupported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  },

  async getPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return "denied";
    return Notification.permission;
  },

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    const permission = await Notification.requestPermission();
    return permission === "granted";
  },

  async subscribe(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null;
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith("placeholder")) {
      console.warn("[Push] VITE_VAPID_PUBLIC_KEY not configured");
      return null;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return existing;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Save subscription to backend
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      }).catch(() => {});

      return subscription;
    } catch (err) {
      console.warn("[Push] Subscribe failed:", err);
      return null;
    }
  },

  async unsubscribe(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
      }
      return true;
    } catch (err) {
      console.warn("[Push] Unsubscribe failed:", err);
      return false;
    }
  },

  /**
   * Show a local notification immediately (no server needed).
   * Useful for analysis completion events.
   */
  async showLocal(title: string, body: string, icon = "/pwa-192x192.png"): Promise<void> {
    if (!this.isSupported()) return;
    if (Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon,
        badge: "/pwa-64x64.png",
        vibrate: [200, 100, 200],
        data: { url: "/" },
      });
    } catch {
      // Fallback to browser notification
      new Notification(title, { body, icon });
    }
  },
};
