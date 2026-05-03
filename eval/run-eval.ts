/**
 * VITAS · Eval Harness Runner
 *
 * Ejecuta los 12 golden tests contra los agentes LLM y reporta:
 *   - % de tests que pasaron
 *   - Output JSON de cada uno (para diffs)
 *   - Latencia y coste estimado
 *
 * Run:
 *   $env:VITAS_PUBLIC_URL="http://localhost:3000"
 *   $env:INTERNAL_API_TOKEN="..."
 *   npm run eval
 *
 * Exit code:
 *   0 = todos los tests pasaron (o >=90%)
 *   1 = regresión detectada (<90%)
 *
 * En CI: bloquea deploys si exit code != 0.
 */

import { GOLDEN_TESTS, type GoldenTest, type TestExpectation } from "./golden-tests";

const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  process.env.VITAS_API_BASE_URL ??
  "http://localhost:3000";
const TOKEN = process.env.INTERNAL_API_TOKEN ?? process.env.CRON_SECRET ?? "";
const PASS_THRESHOLD_PCT = 90;

interface TestResult {
  id: string;
  passed: boolean;
  errors: string[];
  latencyMs: number;
  output: unknown;
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function checkExpectation(output: unknown, exp: TestExpectation): { ok: boolean; reason?: string } {
  const value = getNestedValue(output, exp.path);

  switch (exp.type) {
    case "key_exists":
      return value !== undefined && value !== null
        ? { ok: true }
        : { ok: false, reason: `path "${exp.path}" missing or null` };

    case "key_contains": {
      if (typeof value !== "string") {
        return { ok: false, reason: `path "${exp.path}" not a string` };
      }
      const pattern = exp.pattern ?? (typeof exp.value === "string" ? exp.value : "");
      return value.toLowerCase().includes(pattern.toLowerCase())
        ? { ok: true }
        : { ok: false, reason: `path "${exp.path}" does not contain "${pattern}"` };
    }

    case "key_in_range":
      if (typeof value !== "number") {
        return { ok: false, reason: `path "${exp.path}" not a number` };
      }
      if (exp.min !== undefined && value < exp.min) {
        return { ok: false, reason: `${exp.path}=${value} < min ${exp.min}` };
      }
      if (exp.max !== undefined && value > exp.max) {
        return { ok: false, reason: `${exp.path}=${value} > max ${exp.max}` };
      }
      return { ok: true };

    case "structure":
      // Espera array no vacío o objeto con keys
      if (Array.isArray(value)) {
        return value.length > 0
          ? { ok: true }
          : { ok: false, reason: `array "${exp.path}" is empty` };
      }
      if (value && typeof value === "object") {
        return Object.keys(value as Record<string, unknown>).length > 0
          ? { ok: true }
          : { ok: false, reason: `object "${exp.path}" has no keys` };
      }
      return { ok: false, reason: `path "${exp.path}" is not array nor object` };

    default:
      return { ok: false, reason: `unknown expectation type: ${exp.type}` };
  }
}

async function runTest(test: GoldenTest): Promise<TestResult> {
  const t0 = Date.now();
  const errors: string[] = [];

  try {
    const res = await fetch(`${PUBLIC_URL}${test.agentEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(test.input),
    });

    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text();
      errors.push(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { id: test.id, passed: false, errors, latencyMs, output: null };
    }

    const body = await res.json();
    const output = body?.data ?? body;

    // Verificar todas las expectations
    for (const exp of test.expectations) {
      const check = checkExpectation(output, exp);
      if (!check.ok) {
        errors.push(`${exp.type}(${exp.path}): ${check.reason ?? "FAILED"}`);
      }
    }

    return {
      id: test.id,
      passed: errors.length === 0,
      errors,
      latencyMs,
      output,
    };
  } catch (err) {
    return {
      id: test.id,
      passed: false,
      errors: [`Exception: ${err instanceof Error ? err.message : "unknown"}`],
      latencyMs: Date.now() - t0,
      output: null,
    };
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  VITAS · Eval Harness                    ║");
  console.log(`║  ${GOLDEN_TESTS.length} golden tests · target: ${PASS_THRESHOLD_PCT}%             ║`);
  console.log(`║  url: ${PUBLIC_URL.padEnd(35)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  if (!TOKEN) {
    console.error("❌ INTERNAL_API_TOKEN not set · cannot run");
    process.exit(1);
  }

  const results: TestResult[] = [];
  for (const test of GOLDEN_TESTS) {
    process.stdout.write(`  ⏳ ${test.id.padEnd(32)} `);
    const result = await runTest(test);
    results.push(result);
    if (result.passed) {
      console.log(`✅ ${result.latencyMs}ms`);
    } else {
      console.log(`❌ ${result.latencyMs}ms`);
      for (const err of result.errors) {
        console.log(`     · ${err}`);
      }
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const passPct = (passed / total) * 100;
  const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / total;

  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║  Pasados: ${passed}/${total} (${passPct.toFixed(1)}%)`.padEnd(43) + "║");
  console.log(`║  Latencia media: ${avgLatency.toFixed(0)}ms`.padEnd(43) + "║");
  console.log(`║  Threshold: ${PASS_THRESHOLD_PCT}%`.padEnd(43) + "║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (passPct < PASS_THRESHOLD_PCT) {
    console.log(`❌ REGRESIÓN DETECTADA · ${passPct.toFixed(1)}% < ${PASS_THRESHOLD_PCT}%`);
    process.exit(1);
  } else {
    console.log(`✅ EVAL PASSED · ${passPct.toFixed(1)}% >= ${PASS_THRESHOLD_PCT}%`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Eval harness crashed:", err);
  process.exit(1);
});
