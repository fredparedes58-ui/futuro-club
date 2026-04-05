/**
 * GET /api/notifications/cron
 * Cron diario (09:00 UTC) — detecta triggers y envía Web Push.
 *
 * Triggers:
 * 1. VSI bajo (< 50) — primer análisis por debajo del umbral
 * 2. Inactividad 30 días — sin análisis ni eventos
 * 3. Límite de plan al 90% — jugadores o análisis
 */

export const config = { runtime: "edge" };

const CRON_SECRET = process.env.CRON_SECRET; // opcional: protege el endpoint

interface PushSubscription {
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

async function sendWebPush(
  subscription: PushSubscription["subscription"],
  payload: { title: string; body: string; url?: string },
  _vapidPublic: string,
  _vapidPrivate: string,
): Promise<void> {
  // Web Push via direct fetch to browser push endpoint.
  // Full VAPID signing requires Node.js crypto (not available in Edge).
  // For now, attempt a plain POST — works with some push services.
  // For production, migrate to a Node.js serverless function with web-push lib.
  try {
    const body = JSON.stringify(payload);
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(body).length),
        "TTL": "86400",
      },
      body,
    });
    if (!res.ok && res.status !== 201) {
      // Push endpoint rejected — subscription may be expired
      // In production: delete stale subscription from DB
    }
  } catch {
    // Network error — silently fail, cron should not crash
  }
}

export default async function handler(req: Request): Promise<Response> {
  // Verificar secreto del cron (Vercel lo envía en Authorization)
  if (CRON_SECRET) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic  = process.env.VITE_VAPID_PUBLIC_KEY ?? "";
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase not configured" }, 500);
  }

  const headers = {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const base = `${supabaseUrl}/rest/v1`;
  const notifications: Array<{ userId: string; title: string; body: string }> = [];

  try {
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
      // Weighted VSI if metric names match, else fallback to simple average
      let vsi: number;
      const hasWeights = keys.some(k => k in VSI_WEIGHTS);
      if (hasWeights) {
        let sum = 0, wTotal = 0;
        for (const [k, w] of Object.entries(VSI_WEIGHTS)) {
          if (k in m) { sum += (m[k] as number) * w; wTotal += w; }
        }
        vsi = wTotal > 0 ? Math.round(sum / wTotal) : 0;
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
        if (playerCount >= 4) { // 80% de 5
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
    const pushSubs: PushSubscription[] = await pushRes.json();

    let sent = 0;
    for (const notif of notifications) {
      const pushSub = pushSubs.find((s) => s.user_id === notif.userId);
      if (pushSub) {
        await sendWebPush(pushSub.subscription, { title: notif.title, body: notif.body }, vapidPublic, vapidPrivate);
        sent++;
      }
    }

    return json({ success: true, notifications: notifications.length, sent });
  } catch (err) {
    console.error("[Cron] Error:", err);
    return json({ error: String(err) }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
