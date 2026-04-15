/**
 * Tests for Agent Response Cache
 * Validates hash determinism, TTL config, sortKeys helper, and cache operations.
 * NOTE: getCached/setCached/incrementHitCount depend on Supabase REST so we test
 * only the pure functions (hashInput, sortKeys behavior via hashInput).
 */
import { describe, it, expect } from "vitest";
import { hashInput } from "../../../api/_lib/agentCache";

describe("hashInput", () => {
  it("returns a 64-char hex string (SHA-256)", async () => {
    const hash = await hashInput("phv-calculator", "user1", { age: 14 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same hash", async () => {
    const input = { name: "Samu", age: 15, metrics: { speed: 70 } };
    const h1 = await hashInput("role-profile", "u1", input);
    const h2 = await hashInput("role-profile", "u1", input);
    expect(h1).toBe(h2);
  });

  it("key order does not affect hash (sortKeys)", async () => {
    const inputA = { b: 2, a: 1, c: 3 };
    const inputB = { a: 1, c: 3, b: 2 };
    const hA = await hashInput("test", "u1", inputA);
    const hB = await hashInput("test", "u1", inputB);
    expect(hA).toBe(hB);
  });

  it("nested object key order does not affect hash", async () => {
    const inputA = { player: { name: "X", metrics: { b: 2, a: 1 } } };
    const inputB = { player: { metrics: { a: 1, b: 2 }, name: "X" } };
    const hA = await hashInput("test", "u1", inputA);
    const hB = await hashInput("test", "u1", inputB);
    expect(hA).toBe(hB);
  });

  it("different agent names produce different hashes", async () => {
    const input = { age: 14 };
    const h1 = await hashInput("phv-calculator", "u1", input);
    const h2 = await hashInput("role-profile", "u1", input);
    expect(h1).not.toBe(h2);
  });

  it("different user IDs produce different hashes", async () => {
    const input = { age: 14 };
    const h1 = await hashInput("phv-calculator", "user1", input);
    const h2 = await hashInput("phv-calculator", "user2", input);
    expect(h1).not.toBe(h2);
  });

  it("different input values produce different hashes", async () => {
    const h1 = await hashInput("test", "u1", { age: 14 });
    const h2 = await hashInput("test", "u1", { age: 15 });
    expect(h1).not.toBe(h2);
  });

  it("handles null and undefined input", async () => {
    const h1 = await hashInput("test", "u1", null);
    const h2 = await hashInput("test", "u1", undefined);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h2).toMatch(/^[0-9a-f]{64}$/);
    // null and undefined should produce different hashes
    expect(h1).not.toBe(h2);
  });

  it("handles arrays deterministically", async () => {
    const h1 = await hashInput("test", "u1", [1, 2, 3]);
    const h2 = await hashInput("test", "u1", [1, 2, 3]);
    expect(h1).toBe(h2);
    // Different order = different hash (arrays are ordered)
    const h3 = await hashInput("test", "u1", [3, 2, 1]);
    expect(h1).not.toBe(h3);
  });

  it("handles empty objects", async () => {
    const hash = await hashInput("test", "u1", {});
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles deeply nested objects", async () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    const hash = await hashInput("test", "u1", deep);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
