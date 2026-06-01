/**
 * VITAS · Transfer Market — Shared types
 *
 * Reusable types for the marketplace module. All enums live in
 * transferConfig.ts (single source of truth).
 *
 * Mirrors supabase/migrations/049_transfer_market.sql.
 */

import type {
  ListingType,
  ListingStatus,
  InquiryStatus,
  ListingVisibility,
  PublisherRole,
  Currency,
} from "./transferConfig";

// ── Listing entities ──────────────────────────────────────────────────

export interface TransferListing {
  id: string;
  playerId: string;
  sellerUserId?: string;
  sellerName?: string; // snapshot at listing time
  tenantId?: string;
  publisherRole: PublisherRole;

  listingType: ListingType;
  status: ListingStatus;

  /** Manually set by seller (nullable when "negotiable"). */
  askingPriceEur: number | null;
  currency: Currency;
  /** Auto-computed by valuationModel — for reference / nudge. */
  valuationEurAi: number | null;
  /** True if the listing accepts offers below askingPrice. */
  acceptsOffers: boolean;

  visibility: ListingVisibility;
  description: string | null;
  /** ID of a video showcasing the player. */
  highlightVideoId: string | null;
  /** Tags libres definidos por el seller: ["goleador", "creativo", ...]. */
  tags: string[];

  /** Snapshot del jugador en el momento del listing (para sobrevivir a updates). */
  playerSnapshot: {
    name?: string;
    age?: number;
    position?: string;
    foot?: string;
    vsi?: number;
    phvOffset?: number;
    phvCategory?: string;
  };

  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferInquiry {
  id: string;
  listingId: string;
  buyerUserId?: string;
  buyerName?: string;       // snapshot
  buyerTenantId?: string;

  message: string;
  status: InquiryStatus;

  /** Buyer's counter-offer (null = aceptan precio del listing o pedir negociar). */
  proposedPriceEur: number | null;
  proposedType: ListingType | null;

  createdAt: string;
  viewedAt?: string;
  respondedAt?: string;
}

/**
 * Una búsqueda guardada por un club comprador. Si `notifyOnMatch=true`,
 * el cron diario evalúa listings nuevos contra esta query y dispara push.
 */
export interface TransferSavedSearch {
  id: string;
  userId: string;
  tenantId?: string;
  label: string;
  query: TransferSearchQuery;
  notifyOnMatch: boolean;
  createdAt: string;
}

// ── Search / filter query ─────────────────────────────────────────────

export interface TransferSearchQuery {
  positions?: string[];
  minAge?: number;
  maxAge?: number;
  foot?: "left" | "right" | "both";
  minVSI?: number;
  /** Por dimensión: vsi_technical >= n, etc. */
  vsiMinByDimension?: {
    technical?: number;
    tactical?: number;
    physical?: number;
    mental?: number;
  };
  phvCategory?: ("early" | "on-time" | "late")[];
  listingTypes?: ListingType[];
  maxPriceEur?: number;
  visibility?: ListingVisibility;
  tags?: string[];
  /** Free-text search en description + tags + player name. */
  text?: string;
}

// ── Smart Match (output of the agent) ─────────────────────────────────

export interface MatchScore {
  listingId: string;
  score: number;          // 0-100
  reasoning: string;      // 1-2 sentences explaining the fit
  matchedCriteria: string[];
  missingCriteria: string[];
}

export interface SmartMatchResult {
  query: TransferSearchQuery;
  matches: MatchScore[];
  modelVersion: string;
  /** Source: agent / heuristic-fallback. */
  source: string;
}

// ── Listing creation input (for forms) ────────────────────────────────

export interface CreateListingInput {
  playerId: string;
  publisherRole: PublisherRole;
  listingType: ListingType;
  askingPriceEur?: number | null;
  currency?: Currency;
  acceptsOffers?: boolean;
  visibility?: ListingVisibility;
  description?: string;
  highlightVideoId?: string;
  tags?: string[];
  expiresInDays?: number;
}
