/**
 * VITAS · Runner de evaluación en vivo de agentes LLM (MLOps · opt-in)
 *
 * Llama a cada agente del golden set con su input real y pasa la salida por los
 * validadores anti-alucinación (evaluateReport). Imprime un scorecard.
 *
 * A diferencia del test determinista (src/test/evals/*), esto SÍ gasta API y
 * necesita el servidor arriba → NO va en CI. Úsalo como gate de calidad
 * periódico o antes de cambiar prompts/modelos.
 *
 * Uso:
 *   EVAL_BASE_URL=https://futuro-club.vercel.app \
 *   EVAL_AUTH_TOKEN=<service token o INTERNAL_API_TOKEN> \
 *   npx tsx scripts/eval/run-llm-eval.ts
 *
 * Defaults: EVAL_BASE_URL=http://localhost:5200. Sin token, los agentes con
 * requireAuth devolverán 401 (se reporta como error del caso).
 */

import { GOLDEN_SET } from "../../src/lib/evals/goldenSet";
import { evaluateReport, type ReportLike } from "../../src/lib/evals/outputValidators";

const BASE_URL = process.env.EVAL_BASE_URL ?? "http://localhost:5200";
const AUTH = process.env.EVAL_AUTH_TOKEN ?? "";

/** Extrae el objeto reporte de las distintas formas de envoltura de la API. */
function extractReport(json: unknown): ReportLike {
  const j = json as Record<string, unknown>;
  const data = j?.data as Record<string, unknown> | undefined;
  const dataData = data?.data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    dataData?.report, data?.report, j?.report, dataData, data, j,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) return c as ReportLike;
  }
  return {};
}

async function runCase(gc: (typeof GOLDEN_SET)[number]) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH) headers.Authorization = `Bearer ${AUTH}`;
  try {
    const res = await fetch(`${BASE_URL}${gc.endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(gc.input),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { gc, ok: false, error: `HTTP ${res.status}`, result: null };
    }
    const report = extractReport(json);
    const source = (extractReport(json).source ?? (json as { data?: { data?: { source?: string } } })?.data?.data?.source) as string | undefined;
    const result = evaluateReport(report, { ...gc.ruleset, source });
    return { gc, ok: true, error: null, result };
  } catch (err) {
    return { gc, ok: false, error: err instanceof Error ? err.message : "fetch failed", result: null };
  }
}

async function main() {
  console.log(`\nVITAS · LLM eval · ${GOLDEN_SET.length} casos · base=${BASE_URL}${AUTH ? "" : " (SIN token → 401 esperable)"}\n`);
  let passed = 0, failed = 0, errored = 0, totalWarnings = 0;

  for (const gc of GOLDEN_SET) {
    const { ok, error, result } = await runCase(gc);
    if (!ok || !result) {
      errored++;
      console.log(`  ⚠️  ${gc.id.padEnd(24)} ERROR · ${error}`);
      continue;
    }
    totalWarnings += result.warnings;
    if (result.passed) {
      passed++;
      const w = result.warnings ? ` (${result.warnings} warnings)` : "";
      console.log(`  ✅ ${gc.id.padEnd(24)} PASS${w}`);
    } else {
      failed++;
      console.log(`  ❌ ${gc.id.padEnd(24)} FAIL · ${result.critical} críticas`);
    }
    for (const v of result.violations) {
      console.log(`       ${v.severity === "critical" ? "✖" : "•"} [${v.rule}] ${v.message}${v.evidence ? ` — "${v.evidence}"` : ""}`);
    }
  }

  console.log(`\n── Resumen ──`);
  console.log(`  PASS: ${passed} · FAIL: ${failed} · ERROR: ${errored} · warnings: ${totalWarnings}`);
  // Exit 1 si hay fallos críticos (útil como gate en un job manual/programado)
  process.exit(failed > 0 ? 1 : 0);
}

main();
