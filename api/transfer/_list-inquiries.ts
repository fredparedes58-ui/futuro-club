/**
 * VITAS · GET /api/transfer/list-inquiries?listingId=...|buyerUserId=...
 */

import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const listingId = url.searchParams.get("listingId");
  const buyerUserId = url.searchParams.get("buyerUserId");

  if (!listingId && !buyerUserId) {
    return errorResponse("listingId or buyerUserId required", 400);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return successResponse({ inquiries: [], source: "no_supabase" });
  }

  let filter = "";
  if (listingId) filter = `listing_id=eq.${listingId}`;
  else if (buyerUserId) filter = `buyer_user_id=eq.${buyerUserId}`;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/transfer_inquiries?${filter}&order=created_at.desc&limit=100`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    const data = await res.json();
    return successResponse({ inquiries: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error("[list-inquiries] error:", err);
    return successResponse({ inquiries: [], error: String(err) });
  }
}
