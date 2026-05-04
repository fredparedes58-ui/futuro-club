/**
 * VITAS · Stripe Webhook
 * POST /api/webhooks/stripe
 *
 * Recibe eventos de Stripe y sincroniza estado en `subscriptions` table.
 *
 * Eventos críticos manejados:
 *   - checkout.session.completed       → activar suscripción
 *   - customer.subscription.updated    → cambio de plan / renovación
 *   - customer.subscription.deleted    → cancelación
 *   - invoice.payment_succeeded        → renovación exitosa
 *   - invoice.payment_failed           → grace period
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_end: number | null;
  items: { data: Array<{ price: { id: string } }> };
  metadata: Record<string, string>;
}

async function verifyStripeSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET || !signature) return false;
  // Stripe uses format: t=timestamp,v1=signature
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const sig = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature_buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(signature_buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSig === sig;
}

function tierFromPriceId(priceId: string): string | null {
  if (priceId === process.env.STRIPE_PRICE_PERSONAL_MONTHLY || priceId === process.env.STRIPE_PRICE_PERSONAL_ANNUAL) return "personal";
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY || priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ACADEMIA_MONTHLY || priceId === process.env.STRIPE_PRICE_ACADEMIA_ANNUAL) return "academia";
  if (priceId === process.env.STRIPE_PRICE_AGENCIA_MONTHLY || priceId === process.env.STRIPE_PRICE_AGENCIA_ANNUAL) return "agencia";
  return null;
}

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  sub: StripeSubscription
) {
  const userId = sub.metadata?.user_id;
  const planTier = tierFromPriceId(sub.items.data[0]?.price?.id ?? "");
  const userPersona = sub.metadata?.user_persona ?? "other";

  if (!userId || !planTier) {
    console.warn("[VITAS] Stripe webhook missing user_id or plan_tier", sub.id);
    return;
  }

  // Get tenant_id from existing user data
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("tenant_id, id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tenantId = existing?.tenant_id ?? "00000000-0000-0000-0000-000000000001";

  await supabase.from("subscriptions").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      stripe_price_id: sub.items.data[0]?.price?.id ?? null,
      plan_tier: planTier,
      user_persona: userPersona,
      status: sub.status,
      current_period_start: sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    },
    { onConflict: "stripe_subscription_id" }
  );
}

export default async function handler(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  // Verificar firma (en prod) · skip en dev sin secret
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, signature);
    if (!valid) {
      return errorResponse({ code: "invalid_signature", message: "Firma Stripe inválida", status: 401 });
    }
  }

  const event = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subId = event.data.object.subscription ?? event.data.object.id;
        if (!subId) break;

        // Para checkout.session.completed, hacer fetch a la subscription
        let subscription: StripeSubscription;
        if (event.type === "checkout.session.completed") {
          const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
            headers: { Authorization: `Bearer ${STRIPE_KEY}` },
          });
          if (!subRes.ok) break;
          subscription = await subRes.json();
        } else {
          subscription = event.data.object;
        }

        await upsertSubscription(supabase, subscription);
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const subId = event.data.object.subscription;
        if (!subId) break;

        // Actualizar status (Stripe ya cambia el status de la subscription)
        const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
          headers: { Authorization: `Bearer ${STRIPE_KEY}` },
        });
        if (!subRes.ok) break;
        const subscription: StripeSubscription = await subRes.json();
        await upsertSubscription(supabase, subscription);
        break;
      }

      default:
        console.log(`[VITAS] Stripe event ignored: ${event.type}`);
    }

    return successResponse({ received: true, type: event.type });
  } catch (err) {
    console.error("[VITAS] Stripe webhook error:", err);
    return errorResponse({
      code: "webhook_error",
      message: err instanceof Error ? err.message : "unknown",
      status: 500,
    });
  }
}
