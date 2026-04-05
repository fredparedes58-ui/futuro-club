/**
 * POST /api/stripe/webhook
 * Procesa eventos de Stripe y actualiza el plan en Supabase.
 *
 * Eventos manejados:
 *   checkout.session.completed       → activa plan
 *   customer.subscription.updated    → actualiza plan/status
 *   customer.subscription.deleted    → degrada a free
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Node.js runtime required — Stripe SDK uses Node-only APIs (Buffer, http)
// export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl   = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !webhookSecret || stripeKey.includes("REEMPLAZA") || webhookSecret.includes("REEMPLAZA")) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature header", { status: 400 });

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature failed: ${(err as Error).message}`, { status: 400 });
  }

  // Supabase admin (service role) para bypass RLS
  const sb = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey)
    : null;

  const resolvePlan = (priceId: string): "pro" | "club" => {
    if (priceId === process.env.STRIPE_CLUB_PRICE_ID) return "club";
    if (priceId === process.env.STRIPE_PRO_PRICE_ID)  return "pro";
    return "pro"; // fallback
  };

  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId || !sb || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = resolvePlan(priceId);

      await sb.from("subscriptions").upsert({
        user_id: userId,
        plan,
        status: sub.status,
        stripe_customer_id:     session.customer as string,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(
          (sub as unknown as { current_period_end: number }).current_period_end * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId || !sb) break;

      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = resolvePlan(priceId);

      await sb.from("subscriptions").upsert({
        user_id: userId,
        plan,
        status: sub.status,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(
          (sub as unknown as { current_period_end: number }).current_period_end * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId || !sb) break;

      await sb.from("subscriptions").upsert({
        user_id: userId,
        plan: "free",
        status: "canceled",
        stripe_subscription_id: sub.id,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
