/**
 * VITAS · Subscription Status
 * GET /api/billing/status
 *
 * Devuelve el plan activo del usuario actual (si lo tiene).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const schema = z.object({});

export default withHandler(
  { schema, requireAuth: true, maxRequests: 100 },
  async ({ userId }) => {
    if (!userId) return successResponse({ subscription: null });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("user_active_subscription")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    return successResponse({ subscription: data ?? null });
  }
);
