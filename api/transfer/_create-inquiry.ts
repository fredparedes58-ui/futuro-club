/**
 * VITAS · POST /api/transfer/create-inquiry
 *
 * Un comprador expresa interés en un listing. Persiste + dispara push al
 * vendedor (si tiene subscription).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const CreateInquirySchema = z.object({
  listingId: z.string().uuid(),
  // buyerUserId / buyerTenantId ya NO se aceptan del caller: la identidad del
  // comprador se toma del JWT (no spoofable). buyerName es solo display.
  buyerName: z.string().min(2).max(100),
  message: z.string().min(10).max(2000),
  proposedPriceEur: z.number().nullable().optional(),
  proposedType: z.enum(["sale", "loan", "trial"]).nullable().optional(),
});

const uuid = (): string => crypto.randomUUID();

export default withHandler(
  { method: "POST", schema: CreateInquirySchema, optionalAuth: true, maxRequests: 60 },
  async ({ body, userId, tenantId }) => {
    // En PRODUCCIÓN (Supabase configurado) exige auth; en modo demo/offline sin
    // Supabase degrada al fallback client_only sin romper (invariante CLAUDE.md).
    if (SUPABASE_URL && SUPABASE_KEY && !userId) {
      return errorResponse("Unauthorized", 401);
    }
    const input = body as z.infer<typeof CreateInquirySchema>;

    const row = {
      id: uuid(),
      listing_id: input.listingId,
      // Identidad del comprador SIEMPRE desde el JWT (no spoofable por el caller).
      buyer_user_id: userId,
      buyer_name: input.buyerName,
      buyer_tenant_id: tenantId,
      message: input.message,
      status: "new",
      proposed_price_eur: input.proposedPriceEur ?? null,
      proposed_type: input.proposedType ?? null,
    };

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ inquiry: row, source: "client_only" });
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/transfer_inquiries`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return errorResponse(`Supabase insert failed: ${res.status} ${text.slice(0, 200)}`, 500);
      }

      const inserted = await res.json();
      const inquiry = Array.isArray(inserted) ? inserted[0] : inserted;

      // Fire-and-forget: notificar al vendedor del listing
      void fetch(`${PUBLIC_URL}/api/transfer/notify-seller`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: input.listingId, inquiryId: inquiry.id }),
      }).catch((err) => console.warn("[create-inquiry] notify failed:", err));

      return successResponse({ inquiry });
    } catch (err) {
      console.error("[create-inquiry] error:", err);
      return errorResponse("Internal error creating inquiry", 500);
    }
  },
);
