/**
 * VITAS · Push Notifications hook
 *
 * Gestiona la suscripción a Web Push notifications usando VAPID keys
 * (ya configuradas en Vercel: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY).
 *
 * Soporte:
 *   ✅ Chrome/Edge Android · todas las versiones
 *   ✅ Chrome/Edge Desktop · todas las versiones
 *   ✅ Firefox · todas las versiones
 *   ✅ Safari iOS 16.4+ (requiere PWA instalada via "Añadir a inicio")
 *   ❌ Safari iOS <16.4 · no hay forma de activar push
 *
 * Uso:
 *   const { permission, subscribe, unsubscribe, isSupported } = usePushNotifications();
 */

import { useEffect, useState, useCallback } from "react";

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);

    if (!supported) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission as PushPermission);

    // Verificar si ya está suscrito
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async () => {
    setError(null);

    if (!isSupported) {
      setError("Tu navegador no soporta notificaciones push");
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      setError("Push no configurado en el servidor");
      return false;
    }

    try {
      // Pedir permiso
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return false;

      // Obtener service worker
      const reg = await navigator.serviceWorker.ready;

      // Suscribirse al push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Enviar al backend para guardar
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(subscription),
      });

      if (!res.ok) throw new Error("Error guardando suscripción");

      setIsSubscribed(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }, []);

  return {
    permission,
    isSubscribed,
    isSupported,
    error,
    subscribe,
    unsubscribe,
  };
}
