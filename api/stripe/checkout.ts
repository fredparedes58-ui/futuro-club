/**
 * POST /api/stripe/checkout
 * Crea una Stripe Checkout Session para suscripción.
 *
 * Body: { priceId, userId, email, successUrl?, cancelUrl? }
 * Returns: { url }
 */

import Stripe from "stripe";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });

  let body: { priceId?: string; userId?: string; email?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { priceId, userId, email, successUrl, cancelUrl } = body;

  if (!priceId || !userId || !email) {
    return new Response(JSON.stringify({ error: "Missing required fields: priceId, userId, email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl ?? `${origin}/billing?success=1`,
    cancel_url:  cancelUrl  ?? `${origin}/billing?canceled=1`,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
