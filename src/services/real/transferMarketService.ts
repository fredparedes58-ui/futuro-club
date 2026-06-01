/**
 * VITAS · Transfer Market Service (Supabase + localStorage hybrid)
 *
 * CRUD para los 4 entities del módulo (listings, inquiries, saved_searches,
 * match_scores). Mismo patrón offline-first que IDP/Tactical.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { applyFiltersInMemory } from "@/lib/transfer/transferFilters";
import type {
  TransferInquiry,
  TransferListing,
  TransferSavedSearch,
  TransferSearchQuery,
} from "@/lib/transfer/transferTypes";

const LISTINGS_KEY = "vitas_transfer_listings";
const INQUIRIES_KEY = "vitas_transfer_inquiries";
const SAVED_SEARCHES_KEY = "vitas_transfer_saved_searches";

const uuid = (): string => crypto.randomUUID();

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, 500)));
  } catch (err) {
    console.error(`[transferMarketService] cache write failed (${key})`, err);
  }
}

// ── DB row mappers ────────────────────────────────────────────────────
interface DbListing {
  id: string;
  player_id: string;
  seller_user_id: string | null;
  seller_name: string | null;
  tenant_id: string | null;
  publisher_role: TransferListing["publisherRole"];
  listing_type: TransferListing["listingType"];
  status: TransferListing["status"];
  asking_price_eur: number | null;
  currency: TransferListing["currency"];
  valuation_eur_ai: number | null;
  accepts_offers: boolean;
  visibility: TransferListing["visibility"];
  description: string | null;
  highlight_video_id: string | null;
  tags: string[];
  player_snapshot: TransferListing["playerSnapshot"];
  expires_at: string;
  created_at: string;
  updated_at: string;
}

function rowToListing(r: DbListing): TransferListing {
  return {
    id: r.id,
    playerId: r.player_id,
    sellerUserId: r.seller_user_id ?? undefined,
    sellerName: r.seller_name ?? undefined,
    tenantId: r.tenant_id ?? undefined,
    publisherRole: r.publisher_role,
    listingType: r.listing_type,
    status: r.status,
    askingPriceEur: r.asking_price_eur,
    currency: r.currency,
    valuationEurAi: r.valuation_eur_ai,
    acceptsOffers: r.accepts_offers,
    visibility: r.visibility,
    description: r.description,
    highlightVideoId: r.highlight_video_id,
    tags: r.tags ?? [],
    playerSnapshot: r.player_snapshot ?? {},
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function listingToRow(l: TransferListing): Partial<DbListing> {
  return {
    id: l.id?.length === 36 ? l.id : undefined,
    player_id: l.playerId,
    seller_user_id: l.sellerUserId ?? null,
    seller_name: l.sellerName ?? null,
    tenant_id: l.tenantId ?? null,
    publisher_role: l.publisherRole,
    listing_type: l.listingType,
    status: l.status,
    asking_price_eur: l.askingPriceEur,
    currency: l.currency,
    valuation_eur_ai: l.valuationEurAi,
    accepts_offers: l.acceptsOffers,
    visibility: l.visibility,
    description: l.description,
    highlight_video_id: l.highlightVideoId,
    tags: l.tags,
    player_snapshot: l.playerSnapshot,
    expires_at: l.expiresAt,
  };
}

interface DbInquiry {
  id: string;
  listing_id: string;
  buyer_user_id: string | null;
  buyer_name: string | null;
  buyer_tenant_id: string | null;
  message: string;
  status: TransferInquiry["status"];
  proposed_price_eur: number | null;
  proposed_type: TransferInquiry["proposedType"];
  created_at: string;
  viewed_at: string | null;
  responded_at: string | null;
}

function rowToInquiry(r: DbInquiry): TransferInquiry {
  return {
    id: r.id,
    listingId: r.listing_id,
    buyerUserId: r.buyer_user_id ?? undefined,
    buyerName: r.buyer_name ?? undefined,
    buyerTenantId: r.buyer_tenant_id ?? undefined,
    message: r.message,
    status: r.status,
    proposedPriceEur: r.proposed_price_eur,
    proposedType: r.proposed_type,
    createdAt: r.created_at,
    viewedAt: r.viewed_at ?? undefined,
    respondedAt: r.responded_at ?? undefined,
  };
}

function inquiryToRow(i: TransferInquiry): Partial<DbInquiry> {
  return {
    id: i.id?.length === 36 ? i.id : undefined,
    listing_id: i.listingId,
    buyer_user_id: i.buyerUserId ?? null,
    buyer_name: i.buyerName ?? null,
    buyer_tenant_id: i.buyerTenantId ?? null,
    message: i.message,
    status: i.status,
    proposed_price_eur: i.proposedPriceEur,
    proposed_type: i.proposedType,
    viewed_at: i.viewedAt ?? null,
    responded_at: i.respondedAt ?? null,
  };
}

// ── Public service ────────────────────────────────────────────────────
export const TransferMarketService = {
  // ── Listings ──
  async listListings(query?: TransferSearchQuery): Promise<TransferListing[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        let req = supabase
          .from("transfer_listings")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(200);

        if (query?.listingTypes?.length) {
          req = req.in("listing_type", query.listingTypes);
        }
        if (query?.visibility) {
          req = req.eq("visibility", query.visibility);
        }
        if (query?.maxPriceEur != null) {
          req = req.lte("asking_price_eur", query.maxPriceEur);
        }

        const { data, error } = await req;
        if (error) throw error;
        const listings = (data as DbListing[]).map(rowToListing);
        // Apply remaining JSONB filters client-side
        return query ? applyFiltersInMemory(listings, query) : listings;
      } catch (err) {
        console.warn("[transferMarketService] supabase listListings failed:", err);
      }
    }
    // Cache fallback
    const cached = read<TransferListing>(LISTINGS_KEY).filter((l) => l.status === "active");
    return query ? applyFiltersInMemory(cached, query) : cached;
  },

  async getListing(id: string): Promise<TransferListing | null> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("transfer_listings")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (data) return rowToListing(data as DbListing);
      } catch (err) {
        console.warn("[transferMarketService] getListing failed:", err);
      }
    }
    return read<TransferListing>(LISTINGS_KEY).find((l) => l.id === id) ?? null;
  },

  async saveListing(listing: TransferListing): Promise<TransferListing> {
    const next: TransferListing = {
      ...listing,
      id: listing.id || uuid(),
      createdAt: listing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const all = read<TransferListing>(LISTINGS_KEY).filter((l) => l.id !== next.id);
    all.unshift(next);
    write(LISTINGS_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("transfer_listings")
          .upsert(listingToRow(next), { onConflict: "id" });
      } catch (err) {
        console.warn("[transferMarketService] saveListing failed:", err);
      }
    }
    return next;
  },

  async updateListingStatus(id: string, status: TransferListing["status"]): Promise<void> {
    const all = read<TransferListing>(LISTINGS_KEY);
    const idx = all.findIndex((l) => l.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], status, updatedAt: new Date().toISOString() };
      write(LISTINGS_KEY, all);
    }
    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("transfer_listings")
          .update({ status })
          .eq("id", id);
      } catch (err) {
        console.warn("[transferMarketService] updateListingStatus failed:", err);
      }
    }
  },

  async deleteListing(id: string): Promise<void> {
    write(LISTINGS_KEY, read<TransferListing>(LISTINGS_KEY).filter((l) => l.id !== id));
    write(INQUIRIES_KEY, read<TransferInquiry>(INQUIRIES_KEY).filter((i) => i.listingId !== id));
    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("transfer_listings").delete().eq("id", id);
      } catch (err) {
        console.warn("[transferMarketService] deleteListing failed:", err);
      }
    }
  },

  // ── Inquiries ──
  async listInquiriesForListing(listingId: string): Promise<TransferInquiry[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("transfer_inquiries")
          .select("*")
          .eq("listing_id", listingId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as DbInquiry[]).map(rowToInquiry);
      } catch (err) {
        console.warn("[transferMarketService] listInquiriesForListing failed:", err);
      }
    }
    return read<TransferInquiry>(INQUIRIES_KEY)
      .filter((i) => i.listingId === listingId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listInquiriesByBuyer(buyerUserId: string): Promise<TransferInquiry[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("transfer_inquiries")
          .select("*")
          .eq("buyer_user_id", buyerUserId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as DbInquiry[]).map(rowToInquiry);
      } catch (err) {
        console.warn("[transferMarketService] listInquiriesByBuyer failed:", err);
      }
    }
    return read<TransferInquiry>(INQUIRIES_KEY)
      .filter((i) => i.buyerUserId === buyerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveInquiry(inquiry: TransferInquiry): Promise<TransferInquiry> {
    const next: TransferInquiry = {
      ...inquiry,
      id: inquiry.id || uuid(),
      createdAt: inquiry.createdAt || new Date().toISOString(),
    };
    const all = read<TransferInquiry>(INQUIRIES_KEY).filter((i) => i.id !== next.id);
    all.unshift(next);
    write(INQUIRIES_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase
          .from("transfer_inquiries")
          .upsert(inquiryToRow(next), { onConflict: "id" });
      } catch (err) {
        console.warn("[transferMarketService] saveInquiry failed:", err);
      }
    }
    return next;
  },

  async updateInquiryStatus(id: string, status: TransferInquiry["status"]): Promise<void> {
    const patch: Partial<DbInquiry> = { status };
    if (status === "viewed") patch.viewed_at = new Date().toISOString();
    if (status === "accepted" || status === "declined") {
      patch.responded_at = new Date().toISOString();
    }

    const all = read<TransferInquiry>(INQUIRIES_KEY);
    const idx = all.findIndex((i) => i.id === id);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        status,
        viewedAt: patch.viewed_at ?? all[idx].viewedAt,
        respondedAt: patch.responded_at ?? all[idx].respondedAt,
      };
      write(INQUIRIES_KEY, all);
    }

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("transfer_inquiries").update(patch).eq("id", id);
      } catch (err) {
        console.warn("[transferMarketService] updateInquiryStatus failed:", err);
      }
    }
  },

  // ── Saved searches ──
  async listSavedSearches(userId: string): Promise<TransferSavedSearch[]> {
    if (SUPABASE_CONFIGURED) {
      try {
        const { data, error } = await supabase
          .from("transfer_saved_searches")
          .select("*")
          .eq("user_id", userId);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          id: r.id,
          userId: r.user_id,
          tenantId: r.tenant_id ?? undefined,
          label: r.label,
          query: r.query,
          notifyOnMatch: r.notify_on_match,
          createdAt: r.created_at,
        }));
      } catch (err) {
        console.warn("[transferMarketService] listSavedSearches failed:", err);
      }
    }
    return read<TransferSavedSearch>(SAVED_SEARCHES_KEY).filter((s) => s.userId === userId);
  },

  async saveSavedSearch(search: TransferSavedSearch): Promise<TransferSavedSearch> {
    const next: TransferSavedSearch = {
      ...search,
      id: search.id || uuid(),
      createdAt: search.createdAt || new Date().toISOString(),
    };
    const all = read<TransferSavedSearch>(SAVED_SEARCHES_KEY).filter((s) => s.id !== next.id);
    all.unshift(next);
    write(SAVED_SEARCHES_KEY, all);

    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("transfer_saved_searches").upsert(
          {
            id: next.id,
            user_id: next.userId,
            tenant_id: next.tenantId ?? null,
            label: next.label,
            query: next.query,
            notify_on_match: next.notifyOnMatch,
          },
          { onConflict: "id" },
        );
      } catch (err) {
        console.warn("[transferMarketService] saveSavedSearch failed:", err);
      }
    }
    return next;
  },

  async deleteSavedSearch(id: string): Promise<void> {
    write(SAVED_SEARCHES_KEY, read<TransferSavedSearch>(SAVED_SEARCHES_KEY).filter((s) => s.id !== id));
    if (SUPABASE_CONFIGURED) {
      try {
        await supabase.from("transfer_saved_searches").delete().eq("id", id);
      } catch (err) {
        console.warn("[transferMarketService] deleteSavedSearch failed:", err);
      }
    }
  },
};
