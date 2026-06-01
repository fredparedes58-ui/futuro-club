/**
 * VITAS · Transfer Market — Configuration constants
 *
 * Un único sitio donde tocar valores del módulo si las reglas de negocio
 * cambian. NO hardcodes en otros archivos — todo apunta aquí.
 */

// ── Listing types (sale/loan/trial). Añadir aquí + en SQL CHECK + en Zod enum.
export const LISTING_TYPES = ["sale", "loan", "trial"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTING_TYPE_LABELS: Record<ListingType, string> = {
  sale: "Traspaso",
  loan: "Cesión",
  trial: "Prueba",
};

// ── Listing status lifecycle
export const LISTING_STATUSES = [
  "draft",
  "active",
  "under_negotiation",
  "closed",
  "expired",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  under_negotiation: "En negociación",
  closed: "Cerrado",
  expired: "Expirado",
};

// ── Inquiry status
export const INQUIRY_STATUSES = [
  "new",
  "viewed",
  "in_progress",
  "declined",
  "accepted",
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "Nuevo",
  viewed: "Visto",
  in_progress: "En conversación",
  declined: "Rechazado",
  accepted: "Aceptado",
};

// ── Visibility
export const VISIBILITY_LEVELS = ["public", "private"] as const;
export type ListingVisibility = (typeof VISIBILITY_LEVELS)[number];

// ── Publisher roles (quién publica)
export const PUBLISHER_ROLES = ["club", "agent", "player"] as const;
export type PublisherRole = (typeof PUBLISHER_ROLES)[number];

export const PUBLISHER_ROLE_LABELS: Record<PublisherRole, string> = {
  club: "Club",
  agent: "Agente",
  player: "Jugador",
};

// ── Currency (extensible si añadimos USD, GBP, etc.)
export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

// ── Defaults
export const DEFAULTS = {
  /** Días de vida de un listing antes de expirar (configurable). */
  listingTtlDays: 90,
  /** Currency default. */
  currency: "EUR" as Currency,
  /** Visibility default al crear. */
  visibility: "public" as ListingVisibility,
  /** Max inquiries por listing por día por buyer (anti-spam). */
  maxInquiriesPerDay: 3,
  /** Score mínimo del match para mostrarse en "smart match" (0-100). */
  minMatchScore: 50,
  /** Cap de listings devueltos por query por defecto. */
  defaultPageSize: 20,
} as const;

// ── Pesos para el match scorer (configurable: ajustar pesos sin tocar lib)
export const MATCH_WEIGHTS = {
  position: 25,           // misma posición o secundaria
  ageWindow: 15,          // edad dentro del rango pedido
  vsiOverall: 20,         // VSI total cumple mínimo
  vsiDimensions: 10,      // por cada dimensión que cumple
  foot: 5,                // pie dominante
  phvAlignment: 10,       // PHV en zona deseada (juveniles)
  behavioralFit: 15,      // arquetipo conductual que casa
  budgetFit: 25,          // precio dentro de presupuesto
  recencyBonus: 5,        // listing reciente vence empate
} as const;
