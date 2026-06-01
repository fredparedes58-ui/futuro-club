/**
 * VITAS · Transfer Market Router
 *
 *   POST /api/transfer/create-listing
 *   GET  /api/transfer/list-listings (filters via query params)
 *   POST /api/transfer/create-inquiry
 *   GET  /api/transfer/list-inquiries
 *   POST /api/transfer/smart-match (Claude Sonnet)
 *   POST /api/transfer/notify-seller (internal)
 */

import { errorResponse } from "../_lib/apiResponse";
import createListing from "./_create-listing";
import listListings from "./_list-listings";
import createInquiry from "./_create-inquiry";
import listInquiries from "./_list-inquiries";
import smartMatch from "./_smart-match";
import notifySeller from "./_notify-seller";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "create-listing": createListing,
  "list-listings": listListings,
  "create-inquiry": createInquiry,
  "list-inquiries": listInquiries,
  "smart-match": smartMatch,
  "notify-seller": notifySeller,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Transfer action "${action}" not found`, 404);
  return fn(req);
}
