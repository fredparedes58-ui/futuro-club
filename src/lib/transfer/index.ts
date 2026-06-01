/**
 * VITAS · Transfer Market module — public API
 */
export type {
  TransferListing,
  TransferInquiry,
  TransferSavedSearch,
  TransferSearchQuery,
  MatchScore,
  SmartMatchResult,
  CreateListingInput,
} from "./transferTypes";

export {
  LISTING_TYPES,
  LISTING_TYPE_LABELS,
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABELS,
  VISIBILITY_LEVELS,
  PUBLISHER_ROLES,
  PUBLISHER_ROLE_LABELS,
  CURRENCIES,
  DEFAULTS,
  MATCH_WEIGHTS,
} from "./transferConfig";

export type {
  ListingType,
  ListingStatus,
  InquiryStatus,
  ListingVisibility,
  PublisherRole,
  Currency,
} from "./transferConfig";

export { scoreListingAgainstQuery, rankListings, hashQuery } from "./matchScorer";
export { applyFiltersInMemory, buildSupabaseFilter } from "./transferFilters";
export {
  buildTransferMatchPrompt,
  TRANSFER_PROMPT_VERSION,
} from "./transferMatchPrompt";
export { seedDemoListings, clearMockListings } from "./mockSeeder";
