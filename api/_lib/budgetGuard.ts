/**
 * VITAS · Budget Guard — tripwire de presupuesto mensual GLOBAL (anti runaway-cost)
 *
 * Red de seguridad EN CÓDIGO: acumula el gasto ESTIMADO del mes (Claude / Gemini /
 * Modal) en Supabase (tabla ai_spend_ledger, migración 054) y, antes de cada llamada
 * de pago, comprueba si el mes ya superó GLOBAL_MONTHLY_BUDGET_USD (default $10). Si
 * lo supera → corta la llamada (429 BUDGET_EXCEEDED) en vez de gastar.
 *
 * ⚠️ Esto NO sustituye al tope duro del proveedor (Modal/Anthropic dashboard). Es
 * defensa en profundidad; el hard-cap del dashboard es el backstop real.
 *
 * FAIL-OPEN por diseño: si no se puede leer el ledger (Supabase caído / sin config),
 * NO bloquea (getMonthlySpendUsd → 0). Preferimos no romper la app por un fallo
 * transitorio; el hard-cap del dashboard sigue protegiendo la cartera.
 *
 * Los importes son ESTIMACIONES conservadoras (ligeramente altas) para un tripwire,
 * NO facturación exacta. Sobre-contar hace que salte antes = más seguro.
 */

// ── Presupuesto (env, default $10) ───────────────────────────────────────────

const DEFAULT_BUDGET_USD = 10;

function budgetUsd(): number {
  const raw = process.env.GLOBAL_MONTHLY_BUDGET_USD;
  if (raw === undefined || raw === "") return DEFAULT_BUDGET_USD;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_BUDGET_USD;
}

// ── Estimaciones de coste por llamada (USD) ──────────────────────────────────
// Deliberadamente conservadoras. Ajustables sin tocar la lógica.

export const SPEND_ESTIMATES_USD = {
  "claude-haiku":       0.01,
  "claude-sonnet":      0.05,
  "claude-opus":        0.08,
  "gemini-video":       0.10,  // sube el clip + analiza (tokens altos)
  "gemini-text":        0.04,
  "modal-track-sync":   0.15,  // GPU T4, job corto
  "modal-track-async":  0.60,  // GPU T4, vídeo largo (hasta 60 min)
  "modal-compute":      0.30,
} as const;

export type SpendEstimateKey = keyof typeof SPEND_ESTIMATES_USD;

/** Servicio (para el ledger) a partir de la clave de estimación. */
function serviceOf(key: SpendEstimateKey): string {
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  return "modal";
}

// ── Supabase (fetch, edge-safe; mismo patrón que usageGuard) ─────────────────

function getSupabaseConfig() {
  const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return null;
  return {
    url: sbUrl,
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
    },
  };
}

// ── Núcleo puro (testeable sin red) ──────────────────────────────────────────

/**
 * ¿El gasto del mes supera el presupuesto? Presupuesto <= 0 o no finito =
 * tripwire DESACTIVADO (nunca bloquea).
 */
export function isOverBudgetAmount(spentUsd: number, budget = budgetUsd()): boolean {
  if (!Number.isFinite(budget) || budget <= 0) return false; // desactivado
  return spentUsd >= budget;
}

// ── Lectura / escritura del ledger ───────────────────────────────────────────

/** Gasto total del mes en curso. FAIL-OPEN: 0 ante cualquier error/sin config. */
export async function getMonthlySpendUsd(): Promise<number> {
  const sb = getSupabaseConfig();
  if (!sb) return 0;
  try {
    const res = await fetch(`${sb.url}/rest/v1/rpc/get_ai_spend_month`, {
      method: "POST",
      headers: sb.headers,
      body: "{}",
    });
    if (!res.ok) return 0;
    const val = await res.json();
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0; // fail-open
  }
}

/** ¿Bloquear? Combina lectura del ledger (fail-open) + umbral. */
export async function isOverBudget(): Promise<boolean> {
  return isOverBudgetAmount(await getMonthlySpendUsd());
}

/**
 * Contabiliza el gasto estimado de una llamada. No-bloqueante: swallow de errores
 * (nunca rompe la ruta principal por un fallo del ledger).
 */
export async function recordSpendUsd(key: SpendEstimateKey): Promise<void> {
  const sb = getSupabaseConfig();
  if (!sb) return;
  try {
    await fetch(`${sb.url}/rest/v1/rpc/record_ai_spend`, {
      method: "POST",
      headers: sb.headers,
      body: JSON.stringify({ p_service: serviceOf(key), p_amount: SPEND_ESTIMATES_USD[key] }),
    });
  } catch {
    /* no-blocking */
  }
}

// ── Respuesta de corte ────────────────────────────────────────────────────────

export function budgetExceededResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error:
        "Presupuesto mensual de IA alcanzado. Llamadas de pago pausadas para evitar sobrecoste. " +
        "Sube GLOBAL_MONTHLY_BUDGET_USD o espera al próximo mes.",
      code: "BUDGET_EXCEEDED",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-Budget-Exceeded": "1",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
