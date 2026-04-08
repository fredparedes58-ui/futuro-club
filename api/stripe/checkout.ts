/**
 * POST /api/stripe/checkout
 * Crea una Stripe Checkout Session para suscripción.
 *
 * Body: { priceId, userId, email, successUrl?, cancelUrl? }
 * Returns: { url }
 */

import Stripe from "stripe";
import { verifyAuth } from "../lib/auth";
import { z } from "zod";

const CheckoutSchema = z.object({
  priceId: z.string().min(1, "priceId es requerido"),
  email: z.string().email("Email inválido"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// Node.js runtime required — Stripe SDK uses Node-only APIs (Buffer, http)
// export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify JWT — userId comes from token, not body
  const { userId, error: authError } = await verifyAuth(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: authError ?? "No autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.includes("REEMPLAZA")) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = CheckoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(JSON.stringify({
      error: "Datos inválidos",
      details: parsed.error.errors.map(e => ({ path: e.path.join("."), message: e.message })),
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { priceId, email, successUrl, cancelUrl } = parsed.data;

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
