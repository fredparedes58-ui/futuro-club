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
  // sellerUserId / tenantId ya NO se aceptan del caller: la identidad del vendedor
  // se toma del JWT (no spoofable). sellerName es solo display.
  sellerName: z.string().optional(),
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
  { method: "POST", schema: CreateListingSchema, optionalAuth: true, maxRequests: 30 },
  async ({ body, userId, tenantId }) => {
    // En PRODUCCIÓN (Supabase configurado) exige auth; en modo demo/offline sin
    // Supabase degrada al fallback client_only sin romper (invariante de fallback,
    // CLAUDE.md). Nunca se persiste anónimo en la BD real.
    if (SUPABASE_URL && SUPABASE_KEY && !userId) {
      return errorResponse("Unauthorized", 401);
    }
    const input = body as z.infer<typeof CreateListingSchema>;

    // El listing debe ser sobre un jugador que GESTIONAS (tu user/tenant): no se
    // publica en el mercado a un menor ajeno (integridad + identidad, invariante #6).
    // Solo con Supabase + auth (en offline/client_only no hay BD que consultar).
    if (SUPABASE_URL && SUPABASE_KEY && userId) {
      const pr = await fetch(
        `${SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(input.playerId)}&select=user_id,tenant_id`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      );
      const rows = (await pr.json().catch(() => [])) as Array<{ user_id: string | null; tenant_id: string | null }>;
      const player = Array.isArray(rows) ? rows[0] : undefined;
      // Solo bloquea si el jugador EXISTE en Supabase y es de OTRO. Jugadores
      // local-only (onboarding/demo, aún no persistidos en BD) → el snapshot lo
      // aporta el caller, no hay fila que validar → se permite (no rompe el alta).
      if (player) {
        const ownsPlayer =
          (!!player.user_id && player.user_id === userId) ||
          (!!player.tenant_id && !!tenantId && player.tenant_id === tenantId);
        if (!ownsPlayer) return errorResponse("Forbidden: no gestionas este jugador", 403);
      }
    }

    const expiresInDays = input.expiresInDays ?? DEFAULTS.listingTtlDays;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      id: uuid(),
      player_id: input.playerId,
      // Identidad del vendedor SIEMPRE desde el JWT (no spoofable por el caller).
      seller_user_id: userId,
      seller_name: input.sellerName ?? null,
      tenant_id: tenantId,
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
