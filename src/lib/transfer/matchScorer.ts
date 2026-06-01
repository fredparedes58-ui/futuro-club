/**
 * VITAS · Transfer Match Scorer
 *
 * Calcula un score 0-100 entre un listing y una query de búsqueda usando
 * los pesos configurables en `transferConfig.ts`. Es la versión heurística
 * (determinística, sin IA) que usa el frontend para ordenar listings y el
 * agente como fallback.
 *
 * Cuando montemos el RAG (Sprint A-C en backlog), la firma del scorer no
 * cambia — solo la implementación interna pasará a semantic search.
 */

import { MATCH_WEIGHTS } from "./transferConfig";
import type { TransferListing, TransferSearchQuery, MatchScore } from "./transferTypes";

interface ScoringResult {
  score: number;
  matched: string[];
  missing: string[];
}

export function scoreListingAgainstQuery(
  listing: TransferListing,
  query: TransferSearchQuery,
): ScoringResult {
  let score = 0;
  let maxScore = 0;
  const matched: string[] = [];
  const missing: string[] = [];

  const snap = listing.playerSnapshot ?? {};

  // 1. Position
  if (query.positions && query.positions.length > 0) {
    maxScore += MATCH_WEIGHTS.position;
    if (snap.position && query.positions.includes(snap.position)) {
      score += MATCH_WEIGHTS.position;
      matched.push(`Posición ${snap.position}`);
    } else {
      missing.push(`Posición no coincide (${snap.position ?? "?"} vs ${query.positions.join("/")})`);
    }
  }

  // 2. Age window
  if (query.minAge != null || query.maxAge != null) {
    maxScore += MATCH_WEIGHTS.ageWindow;
    const age = snap.age;
    if (age == null) {
      missing.push("Edad no disponible");
    } else {
      const inRange =
        (query.minAge == null || age >= query.minAge) &&
        (query.maxAge == null || age <= query.maxAge);
      if (inRange) {
        score += MATCH_WEIGHTS.ageWindow;
        matched.push(`Edad ${age} en rango`);
      } else {
        missing.push(`Edad ${age} fuera de rango [${query.minAge ?? "-"}, ${query.maxAge ?? "-"}]`);
      }
    }
  }

  // 3. Foot
  if (query.foot) {
    maxScore += MATCH_WEIGHTS.foot;
    if (snap.foot === query.foot || query.foot === "both") {
      score += MATCH_WEIGHTS.foot;
      matched.push(`Pie ${snap.foot ?? query.foot}`);
    } else {
      missing.push(`Pie ${snap.foot ?? "?"} (pedido: ${query.foot})`);
    }
  }

  // 4. VSI overall
  if (query.minVSI != null) {
    maxScore += MATCH_WEIGHTS.vsiOverall;
    if (typeof snap.vsi === "number" && snap.vsi >= query.minVSI) {
      score += MATCH_WEIGHTS.vsiOverall;
      matched.push(`VSI ${snap.vsi} ≥ ${query.minVSI}`);
    } else {
      missing.push(`VSI ${snap.vsi ?? "?"} < ${query.minVSI}`);
    }
  }

  // 5. VSI per dimension (snapshot may not have breakdown — degrade gracefully)
  if (query.vsiMinByDimension) {
    const breakdown = (snap as Record<string, unknown>).vsiBreakdown as
      | Record<string, number>
      | undefined;
    for (const [dim, min] of Object.entries(query.vsiMinByDimension)) {
      maxScore += MATCH_WEIGHTS.vsiDimensions;
      if (breakdown && typeof breakdown[dim] === "number" && breakdown[dim] >= (min as number)) {
        score += MATCH_WEIGHTS.vsiDimensions;
        matched.push(`VSI ${dim} ≥ ${min}`);
      } else if (breakdown) {
        missing.push(`VSI ${dim} ${breakdown[dim] ?? "?"} < ${min}`);
      }
    }
  }

  // 6. PHV category alignment (relevante en juveniles)
  if (query.phvCategory && query.phvCategory.length > 0) {
    maxScore += MATCH_WEIGHTS.phvAlignment;
    if (snap.phvCategory && query.phvCategory.includes(snap.phvCategory as "early" | "on-time" | "late")) {
      score += MATCH_WEIGHTS.phvAlignment;
      matched.push(`PHV ${snap.phvCategory}`);
    } else if (snap.phvCategory) {
      missing.push(`PHV ${snap.phvCategory} (pedido: ${query.phvCategory.join("/")})`);
    }
  }

  // 7. Listing type
  if (query.listingTypes && query.listingTypes.length > 0) {
    if (!query.listingTypes.includes(listing.listingType)) {
      missing.push(`Tipo ${listing.listingType} no en filtros`);
      // Hard filter: if type doesn't match, score plummets
      return { score: 0, matched, missing };
    }
  }

  // 8. Budget
  if (query.maxPriceEur != null) {
    maxScore += MATCH_WEIGHTS.budgetFit;
    if (listing.askingPriceEur == null) {
      // negociable — partial credit
      score += MATCH_WEIGHTS.budgetFit * 0.6;
      matched.push("Precio negociable");
    } else if (listing.askingPriceEur <= query.maxPriceEur) {
      score += MATCH_WEIGHTS.budgetFit;
      matched.push(`Precio ${listing.askingPriceEur} ≤ ${query.maxPriceEur}`);
    } else {
      missing.push(`Precio ${listing.askingPriceEur} > ${query.maxPriceEur}`);
    }
  }

  // 9. Tags overlap
  if (query.tags && query.tags.length > 0) {
    const overlap = query.tags.filter((t) => listing.tags.includes(t));
    if (overlap.length > 0) {
      score += overlap.length * 3;
      matched.push(`Tags: ${overlap.join(", ")}`);
    }
  }

  // 10. Free-text search (basic substring on description + tags)
  if (query.text) {
    const haystack = `${listing.description ?? ""} ${listing.tags.join(" ")} ${snap.name ?? ""}`.toLowerCase();
    const terms = query.text.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const hits = terms.filter((t) => haystack.includes(t));
    if (hits.length > 0) {
      score += hits.length * 2;
      matched.push(`Texto: ${hits.join(", ")}`);
    }
  }

  // 11. Recency bonus (recent listings get a small boost)
  const ageDays = (Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 7) {
    score += MATCH_WEIGHTS.recencyBonus;
    matched.push("Listing reciente");
  }

  // Normalise to 0-100
  // If no criteria were specified, maxScore is 0 → default to a moderate score
  const normalised = maxScore > 0
    ? Math.min(100, Math.round((score / maxScore) * 100))
    : 50;

  return { score: normalised, matched, missing };
}

/**
 * Aplica un scorer a una lista de listings y devuelve `MatchScore[]`
 * ordenados desc por score.
 */
export function rankListings(
  listings: TransferListing[],
  query: TransferSearchQuery,
): MatchScore[] {
  return listings
    .map((listing) => {
      const result = scoreListingAgainstQuery(listing, query);
      return {
        listingId: listing.id,
        score: result.score,
        reasoning: `Match heurístico: ${result.matched.slice(0, 3).join(" · ") || "criterios mínimos"}`,
        matchedCriteria: result.matched,
        missingCriteria: result.missing,
      } satisfies MatchScore;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Hash determinista de una query (para cachear scores en BD).
 */
export function hashQuery(query: TransferSearchQuery): string {
  const stable = JSON.stringify(query, Object.keys(query).sort());
  // Simple FNV-1a hash — sufficient for cache key purposes
  let h = 2166136261;
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
