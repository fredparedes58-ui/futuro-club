/**
 * VITAS · Mercado de traspasos — PHV del snapshot solo si el servidor lo marcó
 * fiable (gate único · regla del owner 28-sep).
 *
 * Antes (origin/main): CreateListingForm.tsx:73-74 congelaba el phvCategory/offset
 * que tuviera el jugador (naive para un menor sin medidas) y ListingCard,
 * ListingDetailPage, matchScorer, transferFilters y el prompt de smart-match lo
 * mostraban/usaban tal cual. Ahora solo cuenta con `phvTrusted: true`, que pone
 * api/transfer/_create-listing.ts copiando las columnas gateadas de players.
 */
import { describe, it, expect } from "vitest";
import { trustedSnapshotPhv } from "@/lib/phv/phvGate";
import { scoreListingAgainstQuery } from "@/lib/transfer/matchScorer";
import { applyFiltersInMemory } from "@/lib/transfer/transferFilters";
import type { TransferListing } from "@/lib/transfer/transferTypes";

function listing(snap: TransferListing["playerSnapshot"]): TransferListing {
  return {
    id: "l1", playerId: "p1", publisherRole: "club", listingType: "sale", status: "active",
    askingPriceEur: null, currency: "EUR", valuationEurAi: null, acceptsOffers: true,
    visibility: "public", description: null, highlightVideoId: null, tags: [],
    playerSnapshot: snap, expiresAt: "2027-01-01", createdAt: "2026-09-01", updatedAt: "2026-09-01",
  } as TransferListing;
}

describe("trustedSnapshotPhv", () => {
  it("snapshot antiguo / aportado por el cliente (sin phvTrusted) ⇒ sin PHV", () => {
    expect(trustedSnapshotPhv({ phvCategory: "early", phvOffset: -1.2 })).toEqual({ phvCategory: null, phvOffset: null });
    expect(trustedSnapshotPhv(null)).toEqual({ phvCategory: null, phvOffset: null });
  });
  it("marcado por el servidor ⇒ se usa", () => {
    expect(trustedSnapshotPhv({ phvCategory: "late", phvOffset: 1.4, phvTrusted: true })).toEqual({ phvCategory: "late", phvOffset: 1.4 });
  });
});

describe("matchScorer / filtros ignoran el PHV no fiable", () => {
  it("un «early» sin phvTrusted no suma alineación PHV ni se lista como coincidencia", () => {
    const r = scoreListingAgainstQuery(listing({ phvCategory: "early", phvOffset: -1.2 }), { phvCategory: ["early"] });
    expect(r.matched.some((m) => m.startsWith("PHV"))).toBe(false);
    const trusted = scoreListingAgainstQuery(listing({ phvCategory: "early", phvOffset: -1.2, phvTrusted: true }), { phvCategory: ["early"] });
    expect(trusted.matched).toContain("PHV early");
    expect(trusted.score).toBeGreaterThan(r.score);
  });

  it("el filtro por PHV no descarta por un «late» no fiable", () => {
    const out = applyFiltersInMemory([listing({ phvCategory: "late" })], { phvCategory: ["early"] });
    expect(out).toHaveLength(1);
    const outTrusted = applyFiltersInMemory([listing({ phvCategory: "late", phvTrusted: true })], { phvCategory: ["early"] });
    expect(outTrusted).toHaveLength(0);
  });
});
