/**
 * VITAS · Stripe Customer Portal
 * POST /api/billing/portal
 *
 * Crea sesión del Customer Portal de Stripe (gestionar/cancelar suscripción).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PUBLIC_URL = process.env.VITAS_PUBLIC_URL ?? `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const portalSchema = z.object({});

export default withHandler(
  { schema: portalSchema, requireAuth: true, maxRequests: 20 },
  async ({ userId }) => {
    if (!STRIPE_KEY) {
      return errorResponse({ code: "stripe_not_configured", message: "Stripe missing", status: 503 });
    }
    if (!userId) {
      return errorResponse({ code: "unauthenticated", message: "Login requerido", status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return errorResponse({
        code: "no_customer",
        message: "No tienes suscripción activa",
        status: 404,
      });
    }

    const formData = new URLSearchParams();
    formData.append("customer", sub.stripe_customer_id);
    formData.append("return_url", `${PUBLIC_URL}/account/billing`);

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });
    if (!res.ok) {
      return errorResponse({ code: "stripe_error", message: await res.text(), status: 502 });
    }
    const session = await res.json();
    return successResponse({ url: session.url });
  }
);
