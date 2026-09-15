/**
 * Tests · ITEM #11 — planFromTier: mapeo tier de facturación → plan de autorización.
 *
 * El bug: el webhook escribía solo plan_tier (personal/pro/academia/agencia) y los
 * gates premium leen `plan` (free/pro/club) → quien pagaba por la UI quedaba en
 * 'free' y recibía 403. planFromTier es la única fuente de verdad de ese mapeo.
 */
import { describe, it, expect } from "vitest";
import { planFromTier } from "../stripe";

describe("planFromTier (tier de facturación → plan de autorización)", () => {
  it("pro → pro", () => {
    expect(planFromTier("pro")).toBe("pro");
  });

  it("academia → club", () => {
    expect(planFromTier("academia")).toBe("club");
  });

  it("agencia → club", () => {
    expect(planFromTier("agencia")).toBe("club");
  });

  it("personal → free (no está anunciado con endpoints pro/club)", () => {
    expect(planFromTier("personal")).toBe("free");
  });

  it("tier desconocido → free (fail-closed)", () => {
    expect(planFromTier("whatever")).toBe("free");
  });
});
