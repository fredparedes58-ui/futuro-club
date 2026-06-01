/**
 * VITAS · Transfer Filters
 *
 * Builders for filtering listings either against Supabase (PostgREST query
 * params) or against an in-memory array (offline fallback).
 *
 * Same query shape (`TransferSearchQuery`) drives both paths.
 */

import type { TransferListing, TransferSearchQuery } from "./transferTypes";

/**
 * Apply filter in-memory (used in offline-first cache fallback).
 */
export function applyFiltersInMemory(
  listings: TransferListing[],
  query: TransferSearchQuery,
): TransferListing[] {
  return listings.filter((l) => {
    const snap = l.playerSnapshot ?? {};

    if (query.positions?.length && !query.positions.includes(snap.position ?? "")) {
      return false;
    }
    if (query.minAge != null && (snap.age ?? 0) < query.minAge) return false;
    if (query.maxAge != null && (snap.age ?? 999) > query.maxAge) return false;
    if (query.foot && query.foot !== "both" && snap.foot && snap.foot !== query.foot) {
      return false;
    }
    if (query.minVSI != null && (snap.vsi ?? 0) < query.minVSI) return false;
    if (query.phvCategory?.length && snap.phvCategory && !query.phvCategory.includes(snap.phvCategory as "early" | "on-time" | "late")) {
      return false;
    }
    if (query.listingTypes?.length && !query.listingTypes.includes(l.listingType)) {
      return false;
    }
    if (query.maxPriceEur != null && l.askingPriceEur != null && l.askingPriceEur > query.maxPriceEur) {
      return false;
    }
    if (query.tags?.length) {
      const overlap = query.tags.some((t) => l.tags.includes(t));
      if (!overlap) return false;
    }
    if (query.text) {
      const haystack = `${l.description ?? ""} ${l.tags.join(" ")} ${snap.name ?? ""}`.toLowerCase();
      if (!haystack.includes(query.text.toLowerCase())) return false;
    }
    return true;
  });
}

/**
 * Build PostgREST query string for Supabase. Returns a flat object compatible
 * with `supabase.from('transfer_listings').select().match({})` patterns.
 *
 * Note: complex predicates (vsiBreakdown, text search) still done client-side
 * after initial server fetch.
 */
export function buildSupabaseFilter(query: TransferSearchQuery): Record<string, string> {
  const out: Record<string, string> = {};

  if (query.listingTypes?.length) {
    out["listing_type"] = `in.(${query.listingTypes.join(",")})`;
  }
  if (query.maxPriceEur != null) {
    out["asking_price_eur"] = `lte.${query.maxPriceEur}`;
  }
  if (query.visibility) {
    out["visibility"] = `eq.${query.visibility}`;
  }
  if (query.tags?.length) {
    // ARRAY OVERLAP via PostgREST: `tags=ov.{tag1,tag2}`
    out["tags"] = `ov.{${query.tags.join(",")}}`;
  }

  // Position/age/VSI live in player_snapshot JSONB → filtered client-side
  return out;
}
