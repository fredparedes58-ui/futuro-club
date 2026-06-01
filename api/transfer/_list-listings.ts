/**
 * VITAS · GET /api/transfer/list-listings
 *
 * Query params:
 *   - listingTypes (csv)
 *   - maxPriceEur
 *   - visibility
 *   - tags (csv)
 *   - text
 *   - limit (default 50, max 200)
 */

import { successResponse } from "../_lib/apiResponse";
import { DEFAULTS } from "../../src/lib/transfer/transferConfig";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return successResponse({ listings: [], source: "no_supabase" });
  }

  const filters: string[] = ["status=eq.active"];

  const listingTypes = params.get("listingTypes");
  if (listingTypes) filters.push(`listing_type=in.(${listingTypes})`);

  const maxPrice = params.get("maxPriceEur");
  if (maxPrice) filters.push(`asking_price_eur=lte.${maxPrice}`);

  const visibility = params.get("visibility") ?? "public";
  filters.push(`visibility=eq.${visibility}`);

  const tags = params.get("tags");
  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) filters.push(`tags=ov.{${tagList.join(",")}}`);
  }

  const limit = Math.min(parseInt(params.get("limit") ?? `${DEFAULTS.defaultPageSize}`, 10), 200);

  const queryString = filters.join("&") + `&order=created_at.desc&limit=${limit}`;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/transfer_listings?${queryString}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    const data = await res.json();

    // Client-side text filter (Supabase full-text search not configured yet)
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
    return successResponse({ listings: [], error: String(err) });
  }
}
