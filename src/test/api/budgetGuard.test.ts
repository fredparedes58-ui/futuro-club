/**
 * Tests del tripwire de presupuesto (budgetGuard, migración 054).
 * Cubre el núcleo puro (umbral + desactivación) y el contrato FAIL-OPEN:
 * sin config de Supabase NO debe bloquear ni lanzar.
 */

import { describe, it, expect } from "vitest";
import {
  isOverBudgetAmount,
  getMonthlySpendUsd,
  isOverBudget,
  recordSpendUsd,
  budgetExceededResponse,
  SPEND_ESTIMATES_USD,
} from "../../../api/_lib/budgetGuard";

describe("budgetGuard · isOverBudgetAmount (núcleo puro)", () => {
  it("bloquea cuando el gasto alcanza o supera el presupuesto", () => {
    expect(isOverBudgetAmount(10, 10)).toBe(true);   // igual → bloquea
    expect(isOverBudgetAmount(12.5, 10)).toBe(true);
    expect(isOverBudgetAmount(9.99, 10)).toBe(false);
    expect(isOverBudgetAmount(0, 10)).toBe(false);
  });

  it("presupuesto <= 0 o no finito → tripwire DESACTIVADO (nunca bloquea)", () => {
    expect(isOverBudgetAmount(999, 0)).toBe(false);
    expect(isOverBudgetAmount(999, -5)).toBe(false);
    expect(isOverBudgetAmount(999, Number.NaN)).toBe(false);
    expect(isOverBudgetAmount(999, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("budgetGuard · FAIL-OPEN sin config de Supabase", () => {
  // En el entorno de test no hay SUPABASE_URL/SERVICE_ROLE_KEY → getSupabaseConfig
  // devuelve null → todo debe degradar a "permitir" sin lanzar.
  it("getMonthlySpendUsd → 0 (no revienta)", async () => {
    await expect(getMonthlySpendUsd()).resolves.toBe(0);
  });

  it("isOverBudget → false (no bloquea por un fallo de infraestructura)", async () => {
    await expect(isOverBudget()).resolves.toBe(false);
  });

  it("recordSpendUsd → resuelve sin lanzar (no-bloqueante)", async () => {
    await expect(recordSpendUsd("modal-track-async")).resolves.toBeUndefined();
  });
});

describe("budgetGuard · estimaciones y respuesta de corte", () => {
  it("todas las estimaciones son positivas y finitas", () => {
    for (const [k, v] of Object.entries(SPEND_ESTIMATES_USD)) {
      expect(v, k).toBeGreaterThan(0);
      expect(Number.isFinite(v), k).toBe(true);
    }
  });

  it("Modal async es la estimación más cara (mayor riesgo de runaway)", () => {
    const max = Math.max(...Object.values(SPEND_ESTIMATES_USD));
    expect(SPEND_ESTIMATES_USD["modal-track-async"]).toBe(max);
  });

  it("budgetExceededResponse: 429 + code BUDGET_EXCEEDED", async () => {
    const res = budgetExceededResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get("X-Budget-Exceeded")).toBe("1");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("BUDGET_EXCEEDED");
  });
});
