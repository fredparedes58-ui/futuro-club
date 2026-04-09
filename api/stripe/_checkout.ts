/**
 * POST /api/stripe/checkout
 * Crea una Stripe Checkout Session para suscripción.
 *
 * Body: { priceId, email, successUrl?, cancelUrl? }
 * Returns: { url }
 */

import Stripe from "stripe";
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const CheckoutSchema = z.object({
  priceId: z.string().min(1, "priceId es requerido"),
  email: z.string().email("Email inválido"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

// Node.js runtime required — Stripe SDK uses Node-only APIs (Buffer, http)
// export const config = { runtime: "edge" };

export default withHandler(
  { schema: CheckoutSchema, requireAuth: true, maxRequests: 5 },
  async ({ req, body, userId }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes("REEMPLAZA")) {
      return errorResponse("Stripe not configured", 500);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
    });

    const { priceId, email, successUrl, cancelUrl } = body;
    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl ?? `${origin}/billing?success=1`,
      cancel_url:  cancelUrl  ?? `${origin}/billing?canceled=1`,
      metadata: { userId: userId! },
      subscription_data: { metadata: { userId: userId! } },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
    });

    return successResponse({ url: session.url });
  },
);
