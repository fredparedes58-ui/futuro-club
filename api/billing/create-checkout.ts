/**
 * VITAS · Stripe Checkout Session
 * POST /api/billing/create-checkout
 *
 * Crea una sesión de Stripe Checkout y devuelve la URL para redirigir al usuario.
 *
 * Body:
 *   { planTier: 'personal' | 'pro' | 'academia' | 'agencia',
 *     userPersona: 'parent' | 'player' | 'coach' | 'scout' | 'academy_director' | 'agent' | 'club_director' | 'other',
 *     billingPeriod?: 'monthly' | 'annual' }
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PUBLIC_URL = process.env.VITAS_PUBLIC_URL ?? `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const PRICE_IDS: Record<string, { monthly: string; annual?: string }> = {
  personal: {
    monthly: process.env.STRIPE_PRICE_PERSONAL_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_PERSONAL_ANNUAL ?? "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  },
  academia: {
    monthly: process.env.STRIPE_PRICE_ACADEMIA_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_ACADEMIA_ANNUAL ?? "",
  },
  agencia: {
    monthly: process.env.STRIPE_PRICE_AGENCIA_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_AGENCIA_ANNUAL ?? "",
  },
};

const checkoutSchema = z.object({
  planTier: z.enum(["personal", "pro", "academia", "agencia"]),
  userPersona: z.enum([
    "parent",
    "player",
    "coach",
    "scout",
    "academy_director",
    "agent",
    "club_director",
    "other",
  ]),
  billingPeriod: z.enum(["monthly", "annual"]).default("monthly"),
});

export default withHandler(
  { schema: checkoutSchema, requireAuth: true, maxRequests: 20 },
  async ({ body, userId }) => {
    if (!STRIPE_KEY) {
      return errorResponse({
        code: "stripe_not_configured",
        message: "Stripe no está configurado",
        status: 503,
      });
    }
    if (!userId) {
      return errorResponse({ code: "unauthenticated", message: "Login requerido", status: 401 });
    }

    const input = body as z.infer<typeof checkoutSchema>;
    const priceConfig = PRICE_IDS[input.planTier];
    const priceId =
      input.billingPeriod === "annual" ? priceConfig.annual : priceConfig.monthly;

    if (!priceId) {
      return errorResponse({
        code: "price_not_configured",
        message: `Plan ${input.planTier} ${input.billingPeriod} sin price ID en Stripe`,
        status: 503,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Buscar email del usuario
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) {
      return errorResponse({ code: "user_not_found", message: "Email no encontrado", status: 404 });
    }

    // Buscar customer existente
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, tenant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Crear sesión Stripe
    const formData = new URLSearchParams();
    formData.append("mode", "subscription");
    formData.append("line_items[0][price]", priceId);
    formData.append("line_items[0][quantity]", "1");
    formData.append("success_url", `${PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`);
    formData.append("cancel_url", `${PUBLIC_URL}/billing/cancel`);
    formData.append("client_reference_id", userId);
    formData.append("metadata[user_id]", userId);
    formData.append("metadata[plan_tier]", input.planTier);
    formData.append("metadata[user_persona]", input.userPersona);
    formData.append("subscription_data[metadata][user_id]", userId);
    formData.append("subscription_data[metadata][plan_tier]", input.planTier);
    formData.append("subscription_data[metadata][user_persona]", input.userPersona);
    formData.append("allow_promotion_codes", "true");

    if (existingSub?.stripe_customer_id) {
      formData.append("customer", existingSub.stripe_customer_id);
    } else {
      formData.append("customer_email", email);
    }

    try {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        return errorResponse({
          code: "stripe_error",
          message: `Stripe API error: ${errText}`,
          status: 502,
        });
      }
      const session = await res.json();
      return successResponse({ url: session.url, sessionId: session.id });
    } catch (err) {
      return errorResponse({
        code: "stripe_failed",
        message: err instanceof Error ? err.message : "Stripe call failed",
        status: 500,
      });
    }
  }
);
