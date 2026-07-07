/**
 * VITAS · Test de aggregatePhvDistribution (FASE 5 · activación PHV)
 */
import { describe, it, expect } from "vitest";
import { aggregatePhvDistribution } from "@/lib/shared/phv";

describe("aggregatePhvDistribution", () => {
  it("devuelve undefined si no hay offsets", () => {
    expect(aggregatePhvDistribution([])).toBeUndefined();
    expect(aggregatePhvDistribution([{ phvOffset: null }, {}])).toBeUndefined();
  });

  it("clasifica pre/circa/post por offset (Mirwald)", () => {
    const dist = aggregatePhvDistribution([
      { phvOffset: -2 }, // pre
      { phvOffset: -1.5 }, // pre
      { phvOffset: 0 }, // circa
      { phvOffset: 1 }, // circa (límite)
      { phvOffset: 2 }, // post
    ]);
    expect(dist).toEqual({ prePhv: 40, circaPhv: 40, postPhv: 20 });
  });

  it("ignora offsets no numéricos y calcula % sobre los válidos", () => {
    const dist = aggregatePhvDistribution([
      { phvOffset: -2 },
      { phvOffset: 0 },
      { phvOffset: null },
      {},
    ]);
    // 2 válidos → 50/50/0
    expect(dist).toEqual({ prePhv: 50, circaPhv: 50, postPhv: 0 });
  });
});
