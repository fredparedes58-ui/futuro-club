/**
 * GET /api/notifications/cron
 * Cron diario (09:00 UTC) — detecta triggers y envía Web Push.
 *
 * Triggers:
 * 1. VSI bajo (< 50) — primer análisis por debajo del umbral
 * 2. Inactividad 30 días — sin análisis ni eventos
 * 3. Límite de plan al 90% — jugadores o análisis
 *
 * Node.js runtime required — web-push needs Node crypto for VAPID signing.
 */

// Node.js runtime (NOT edge) — web-push requires crypto module
// export const config = { runtime: "edge" };

import webpush from "web-push";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

interface PushSub {
  user_id: string;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}

interface Player {
  user_id: string;
  name: string;
  metrics: Record<string, number>;
  updated_at: string;
}

interface Subscription {
  user_id: string;
  plan: string;
}

export default withHandler(
  { method: "GET", serviceOnly: true },
  async () => {
    const supabaseUrl  = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic  = process.env.VITE_VAPID_PUBLIC_KEY ?? "";
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";
    const vapidEmail   = process.env.VAPID_MAILTO ?? "mailto:admin@vitas.app";

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    if (!vapidPublic || !vapidPrivate) {
      return errorResponse("VAPID keys not configured — push disabled", 503);
    }

    // Configure web-push with VAPID credentials
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

    const headers = {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const base = `${supabaseUrl}/rest/v1`;
    const notifications: Array<{ userId: string; title: string; body: string }> = [];

    // 1. Jugadores con VSI bajo
    const playersRes = await fetch(`${base}/players?select=user_id,name,metrics,updated_at`, { headers });
    const players: Player[] = await playersRes.json();

    // VSI weights must match MetricsService.calculateVSI()
    const VSI_WEIGHTS: Record<string, number> = {
      speed: 0.18, shooting: 0.13, vision: 0.20,
      technique: 0.22, defending: 0.12, stamina: 0.15,
    };

    for (const p of players) {
      const m = p.metrics ?? {};
      const keys = Object.keys(m);
      if (keys.length === 0) continue;

      let vsi: number;
      const hasWeights = keys.some(k => k in VSI_WEIGHTS);
      if (hasWeights) {
        let sum = 0;
        for (const [k, w] of Object.entries(VSI_WEIGHTS)) {
          if (k in m) { sum += (m[k] as number) * w; }
        }
        vsi = Math.round(sum);
      } else {
        const values = Object.values(m) as number[];
        vsi = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      }

      if (vsi < 50) {
        notifications.push({
          userId: p.user_id,
          title: "Alerta de rendimiento",
          body: `${p.name} tiene un VSI de ${vsi}. Revisa su perfil.`,
        });
      }
    }

    // 2. Jugadores inactivos (30 días sin actualizar)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const inactiveRes = await fetch(
      `${base}/players?select=user_id,name,updated_at&updated_at=lt.${thirtyDaysAgo}`,
      { headers },
    );
    const inactive: Player[] = await inactiveRes.json();
    for (const p of inactive) {
      notifications.push({
        userId: p.user_id,
        title: "Jugador inactivo",
        body: `${p.name} lleva más de 30 días sin nuevos datos.`,
      });
    }

    // 3. Límite de plan al 90%
    const subsRes = await fetch(`${base}/subscriptions?select=user_id,plan`, { headers });
    const subs: Subscription[] = await subsRes.json();

    for (const sub of subs) {
      if (sub.plan === "free") {
        const playerCount = players.filter((p) => p.user_id === sub.user_id).length;
        if (playerCount >= 4) {
          notifications.push({
            userId: sub.user_id,
            title: "Límite de jugadores",
            body: `Tienes ${playerCount}/5 jugadores. Actualiza a Pro para añadir más.`,
          });
        }
      }
    }

    // Obtener suscripciones push
    const pushRes = await fetch(`${base}/push_subscriptions?select=user_id,subscription`, { headers });
    const pushSubs: PushSub[] = await pushRes.json();

    let sent = 0;
    let failed = 0;
    for (const notif of notifications) {
      const pushSub = pushSubs.find((s) => s.user_id === notif.userId);
      if (pushSub) {
        try {
          await webpush.sendNotification(
            pushSub.subscription,
            JSON.stringify({ title: notif.title, body: notif.body, url: "/" }),
          );
          sent++;
        } catch (err) {
          failed++;
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410) {
            await fetch(
              `${base}/push_subscriptions?endpoint=eq.${encodeURIComponent(pushSub.subscription.endpoint)}`,
              { method: "DELETE", headers },
            ).catch(() => {});
          }
        }
      }
    }

    return successResponse({ success: true, notifications: notifications.length, sent, failed });
  },
);
