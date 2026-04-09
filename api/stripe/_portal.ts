/**
 * POST /api/stripe/portal
 * Crea una sesión del Customer Portal de Stripe.
 *
 * Body: { returnUrl? }
 * Returns: { url }
 */

import { z } from "zod";
import Stripe from "stripe";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

// Node.js runtime required — Stripe SDK uses Node-only APIs (Buffer, http)
// export const config = { runtime: "edge" };

const PortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

export default withHandler(
  { schema: PortalSchema, requireAuth: true, maxRequests: 10 },
  async ({ req, body, userId }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return errorResponse("Stripe not configured", 500);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
    });

    const { returnUrl } = body;

    // Resolve Stripe customerId from userId via Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const profiles = await profileRes.json() as Array<{ stripe_customer_id?: string }>;
    const customerId = profiles?.[0]?.stripe_customer_id;

    if (!customerId) {
      return errorResponse("No Stripe customer found for this user", 404);
    }

    const origin = new URL(req.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl ?? `${origin}/billing`,
    });

    return successResponse({ url: session.url });
  },
);
