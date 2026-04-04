/**
 * POST /api/stripe/portal
 * Crea una sesión del Customer Portal de Stripe.
 *
 * Body: { customerId, returnUrl? }
 * Returns: { url }
 */

import Stripe from "stripe";
import { verifyAuth } from "../lib/auth";

export const config = { runtime: "edge" };

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
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2026-03-25.dahlia" as Stripe.LatestApiVersion,
  });

  let body: { returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { returnUrl } = body;

  // Resolve Stripe customerId from userId via Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const profiles = await profileRes.json() as Array<{ stripe_customer_id?: string }>;
  const customerId = profiles?.[0]?.stripe_customer_id;

  if (!customerId) {
    return new Response(JSON.stringify({ error: "No Stripe customer found for this user" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl ?? `${origin}/billing`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
