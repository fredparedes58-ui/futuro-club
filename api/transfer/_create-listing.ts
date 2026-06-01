/**
 * VITAS · POST /api/transfer/create-listing
 *
 * Crea un listing en estado `draft` (el vendedor decide cuándo activarlo via
 * update-listing). Snapshot del jugador se construye desde el playerId que
 * el caller provee (futuro: leer de players table; hoy: caller manda snapshot).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { DEFAULTS } from "../../src/lib/transfer/transferConfig";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CreateListingSchema = z.object({
  playerId: z.string(),
  sellerUserId: z.string().optional(),
  sellerName: z.string().optional(),
  tenantId: z.string().optional(),
  publisherRole: z.enum(["club", "agent", "player"]).default("club"),
  listingType: z.enum(["sale", "loan", "trial"]),
  askingPriceEur: z.number().nullable().optional(),
  currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
  valuationEurAi: z.number().nullable().optional(),
  acceptsOffers: z.boolean().default(true),
  visibility: z.enum(["public", "private"]).default("public"),
  description: z.string().max(2000).optional(),
  highlightVideoId: z.string().optional(),
  tags: z.array(z.string()).max(15).default([]),
  playerSnapshot: z.record(z.unknown()).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  status: z.enum(["draft", "active"]).default("draft"),
});

const uuid = (): string => crypto.randomUUID();

export default withHandler(
  { method: "POST", schema: CreateListingSchema, requireAuth: false, maxRequests: 30 },
  async ({ body, userId }) => {
    const input = body as z.infer<typeof CreateListingSchema>;
    const expiresInDays = input.expiresInDays ?? DEFAULTS.listingTtlDays;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      id: uuid(),
      player_id: input.playerId,
      seller_user_id: input.sellerUserId ?? userId ?? null,
      seller_name: input.sellerName ?? null,
      tenant_id: input.tenantId ?? null,
      publisher_role: input.publisherRole,
      listing_type: input.listingType,
      status: input.status,
      asking_price_eur: input.askingPriceEur ?? null,
      currency: input.currency,
      valuation_eur_ai: input.valuationEurAi ?? null,
      accepts_offers: input.acceptsOffers,
      visibility: input.visibility,
      description: input.description ?? null,
      highlight_video_id: input.highlightVideoId ?? null,
      tags: input.tags,
      player_snapshot: input.playerSnapshot ?? {},
      expires_at: expiresAt,
    };

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ listing: row, source: "client_only" });
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/transfer_listings`, {
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
      return successResponse({ listing: Array.isArray(inserted) ? inserted[0] : inserted });
    } catch (err) {
      console.error("[create-listing] error:", err);
      return errorResponse("Internal error creating listing", 500);
    }
  },
);
