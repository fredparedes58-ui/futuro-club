/**
 * VITAS · GET /api/transfer/list-listings
 *
 * Requiere AUTH. `visibility=private` SOLO devuelve los listings del propio
 * vendedor (antes: `?visibility=private` exponía a cualquiera los listings
 * privados de MENORES — nombre/edad/valoración). Todos los filtros se validan
 * / codifican (antes se concatenaban crudos al filtro PostgREST = inyección).
 *
 * Query params: listingTypes (csv), maxPriceEur, visibility, tags (csv), text, limit.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { DEFAULTS } from "../../src/lib/transfer/transferConfig";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LISTING_TYPES = new Set(["sale", "loan", "trial"]);

export default withHandler(
  { method: "GET", requireAuth: true, maxRequests: 60 },
  async ({ req, userId }) => {
    const url = new URL(req.url);
    const params = url.searchParams;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ listings: [], source: "no_supabase" });
    }

    const filters: string[] = ["status=eq.active"];

    // visibility WHITELISTED. 'private' se restringe al propio vendedor: nunca
    // devuelve los privados de otros (era el IDOR principal).
    const visibility = params.get("visibility") === "private" ? "private" : "public";
    filters.push(`visibility=eq.${visibility}`);
    if (visibility === "private") {
      filters.push(`seller_user_id=eq.${encodeURIComponent(String(userId))}`);
    }

    // listingTypes: solo valores del enum conocido (sin inyección).
    const listingTypes = params.get("listingTypes");
    if (listingTypes) {
      const list = listingTypes.split(",").map((s) => s.trim()).filter((s) => LISTING_TYPES.has(s));
      if (list.length > 0) filters.push(`listing_type=in.(${list.join(",")})`);
    }

    // maxPriceEur: solo numérico.
    const maxPrice = params.get("maxPriceEur");
    if (maxPrice && /^\d+(\.\d+)?$/.test(maxPrice)) {
      filters.push(`asking_price_eur=lte.${maxPrice}`);
    }

    // tags: cada tag codificado.
    const tags = params.get("tags");
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean).map(encodeURIComponent);
      if (tagList.length > 0) filters.push(`tags=ov.{${tagList.join(",")}}`);
    }

    const limit = Math.min(
      parseInt(params.get("limit") ?? `${DEFAULTS.defaultPageSize}`, 10) || DEFAULTS.defaultPageSize,
      200,
    );
    const queryString = filters.join("&") + `&order=created_at.desc&limit=${limit}`;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/transfer_listings?${queryString}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();

      // Filtro de texto client-side (full-text search de Supabase aún sin configurar).
      let listings = Array.isArray(data) ? data : [];
      const text = params.get("text");
      if (text) {
        const needle = text.toLowerCase();
        listings = listings.filter((l: { description?: string; tags?: string[]; player_snapshot?: { name?: string } }) => {
          const hay = `${l.description ?? ""} ${(l.tags ?? []).join(" ")} ${l.player_snapshot?.name ?? ""}`.toLowerCase();
          return hay.includes(needle);
        });
      }

      return successResponse({ listings });
    } catch (err) {
      console.error("[list-listings] error:", err);
      return errorResponse("Failed to fetch listings", 500);
    }
  },
);
