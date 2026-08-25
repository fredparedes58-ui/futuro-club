/**
 * VITAS · Transfer Market Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TransferMarketService } from "@/services/real/transferMarketService";
import { getAuthHeaders } from "@/lib/apiAuth";
import type {
  CreateListingInput,
  MatchScore,
  TransferInquiry,
  TransferListing,
  TransferSearchQuery,
} from "@/lib/transfer/transferTypes";

const STALE = 1000 * 60 * 2;
const apiBase = "/api/transfer";

export const transferKeys = {
  all: ["transfer"] as const,
  listings: (q?: TransferSearchQuery) =>
    [...transferKeys.all, "listings", JSON.stringify(q ?? {})] as const,
  listing: (id: string) => [...transferKeys.all, "listing", id] as const,
  inquiriesForListing: (listingId: string) =>
    [...transferKeys.all, "inquiries", "listing", listingId] as const,
  inquiriesByBuyer: (buyerId: string) =>
    [...transferKeys.all, "inquiries", "buyer", buyerId] as const,
};

// ── Listings ───────────────────────────────────────────────────────
export function useListings(query?: TransferSearchQuery) {
  return useQuery<TransferListing[]>({
    queryKey: transferKeys.listings(query),
    queryFn: () => TransferMarketService.listListings(query),
    staleTime: STALE,
  });
}

export function useListing(id: string | undefined) {
  return useQuery<TransferListing | null>({
    queryKey: transferKeys.listing(id ?? "none"),
    queryFn: () => (id ? TransferMarketService.getListing(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation<
    TransferListing,
    Error,
    CreateListingInput & {
      sellerName?: string;
      sellerUserId?: string;
      tenantId?: string;
      valuationEurAi?: number | null;
      playerSnapshot?: TransferListing["playerSnapshot"];
      status?: TransferListing["status"];
    }
  >({
    mutationFn: async (input) => {
      const res = await fetch(`${apiBase}/create-listing`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`create-listing ${res.status}: ${text.slice(0, 200)}`);
      }
      const payload = (await res.json()) as { data: { listing: TransferListing } };
      const listing = payload.data.listing;

      // Save locally too for offline cache
      await TransferMarketService.saveListing(listing);
      return listing;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useUpdateListingStatus() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; status: TransferListing["status"] }
  >({
    mutationFn: ({ id, status }) => TransferMarketService.updateListingStatus(id, status),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: transferKeys.listing(vars.id) });
      qc.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => TransferMarketService.deleteListing(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: transferKeys.all });
    },
  });
}

// ── Inquiries ──────────────────────────────────────────────────────
export function useInquiriesForListing(listingId: string | undefined) {
  return useQuery<TransferInquiry[]>({
    queryKey: transferKeys.inquiriesForListing(listingId ?? "none"),
    queryFn: () =>
      listingId
        ? TransferMarketService.listInquiriesForListing(listingId)
        : Promise.resolve([]),
    enabled: Boolean(listingId),
    staleTime: STALE,
  });
}

export function useInquiriesByBuyer(buyerUserId: string | undefined) {
  return useQuery<TransferInquiry[]>({
    queryKey: transferKeys.inquiriesByBuyer(buyerUserId ?? "none"),
    queryFn: () =>
      buyerUserId
        ? TransferMarketService.listInquiriesByBuyer(buyerUserId)
        : Promise.resolve([]),
    enabled: Boolean(buyerUserId),
    staleTime: STALE,
  });
}

interface CreateInquiryInput {
  listingId: string;
  buyerUserId?: string;
  buyerName: string;
  buyerTenantId?: string;
  message: string;
  proposedPriceEur?: number | null;
  proposedType?: TransferListing["listingType"] | null;
}

export function useCreateInquiry() {
  const qc = useQueryClient();
  return useMutation<TransferInquiry, Error, CreateInquiryInput>({
    mutationFn: async (input) => {
      const res = await fetch(`${apiBase}/create-inquiry`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`create-inquiry ${res.status}: ${text.slice(0, 200)}`);
      }
      const payload = (await res.json()) as { data: { inquiry: TransferInquiry } };
      const inquiry = payload.data.inquiry;
      await TransferMarketService.saveInquiry(inquiry);
      return inquiry;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: transferKeys.inquiriesForListing(vars.listingId) });
      if (vars.buyerUserId) {
        qc.invalidateQueries({ queryKey: transferKeys.inquiriesByBuyer(vars.buyerUserId) });
      }
    },
  });
}

export function useUpdateInquiryStatus() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; status: TransferInquiry["status"]; listingId?: string }
  >({
    mutationFn: ({ id, status }) => TransferMarketService.updateInquiryStatus(id, status),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: transferKeys.all });
      if (vars.listingId) {
        qc.invalidateQueries({ queryKey: transferKeys.inquiriesForListing(vars.listingId) });
      }
    },
  });
}

// ── Smart match ────────────────────────────────────────────────────
interface SmartMatchInput {
  buyerNeed: {
    description: string;
    query?: TransferSearchQuery;
    buyerContext?: {
      teamLevel?: "weak" | "average" | "strong" | "elite";
      formation?: string;
      currentRoster?: string[];
    };
  };
  maxCandidates?: number;
}

interface SmartMatchResultEnvelope {
  topMatches: MatchScore[];
  summary: string;
  candidatesEvaluated: number;
  source: string;
  model: string;
}

export function useSmartMatch() {
  return useMutation<SmartMatchResultEnvelope, Error, SmartMatchInput>({
    mutationFn: async (input) => {
      const res = await fetch(`${apiBase}/smart-match`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`smart-match ${res.status}: ${text.slice(0, 200)}`);
      }
      const payload = (await res.json()) as { data: SmartMatchResultEnvelope };
      return payload.data;
    },
  });
}
