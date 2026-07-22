#!/usr/bin/env node
/**
 * VITAS · Typecheck con baseline (guardarraíl de tipos honesto)
 *
 * Por qué existe: el paso de CI corría `tsc --noEmit` con el tsconfig RAÍZ
 * (files:[] + references) → en modo no-build chequea 0 ficheros y SIEMPRE pasa
 * (falso verde). Este script corre el typecheck REAL sobre `tsconfig.app.json`
 * y lo compara contra un baseline de errores conocidos, de modo que CI falla
 * solo ante errores NETOS-NUEVOS. La deuda existente (ver baseline) se quema
 * de forma incremental sin bloquear el desarrollo; los errores nuevos se atajan.
 *
 * Uso:
 *   node scripts/typecheck-baseline.mjs           # verifica (exit 1 si hay net-new)
 *   node scripts/typecheck-baseline.mjs --update  # regenera el baseline
 *
 * Normalización: cada error se indexa por `fichero::TScode::mensaje` (SIN
 * línea:columna) para tolerar desplazamientos de línea. Se cuentan repeticiones.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "typecheck-baseline.json");
const TSC_CMD = "npx tsc -p tsconfig.app.json --noEmit";
const ERROR_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

function runTsc() {
  try {
    execSync(TSC_CMD, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return ""; // exit 0 → sin errores
  } catch (e) {
    // tsc sale != 0 cuando hay errores; la salida va a stdout
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

/** Parsea la salida de tsc a un mapa { "file::code::message": count }. */
function parseErrors(output) {
  const counts = {};
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(ERROR_RE);
    if (!m) continue;
    const file = m[1].trim().replace(/\\/g, "/"); // normaliza separador Windows
    const code = m[4];
    const message = m[5].trim();
    const key = `${file}::${code}::${message}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function total(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

const isUpdate = process.argv.includes("--update");
const output = runTsc();
const current = parseErrors(output);
const currentTotal = total(current);

if (isUpdate) {
  const baseline = {
    _comment:
      "Baseline de errores tsc conocidos (tsconfig.app.json). NO editar a mano: regenerar con `node scripts/typecheck-baseline.mjs --update`. Objetivo: que solo baje. Ver scripts/typecheck-baseline.mjs.",
    total: currentTotal,
    errors: current,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`✅ Baseline actualizado: ${currentTotal} errores conocidos → ${BASELINE_PATH}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error("❌ No existe el baseline. Genera uno con: node scripts/typecheck-baseline.mjs --update");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const baselineErrors = baseline.errors ?? {};

// Errores NETOS-NUEVOS: claves cuyo conteo supera el del baseline.
const netNew = [];
for (const [key, count] of Object.entries(current)) {
  const allowed = baselineErrors[key] ?? 0;
  if (count > allowed) netNew.push({ key, count, allowed });
}

// Info: errores del baseline ya resueltos (para animar a bajar el baseline).
let fixed = 0;
for (const [key, allowed] of Object.entries(baselineErrors)) {
  const count = current[key] ?? 0;
  if (count < allowed) fixed += allowed - count;
}

console.log(`Typecheck (tsconfig.app.json): ${currentTotal} errores · baseline ${baseline.total}`);

if (netNew.length > 0) {
  console.error(`\n❌ ${netNew.length} error(es) de tipo NUEVO(s) (no en el baseline):\n`);
  for (const { key } of netNew) {
    const [file, code, message] = key.split("::");
    console.error(`  ${file}: ${code}: ${message}`);
  }
  console.error(
    "\nArregla el error nuevo. Si es deuda legítima e inevitable, regenera el baseline con `node scripts/typecheck-baseline.mjs --update` (y justifícalo en el PR).",
  );
  process.exit(1);
}

if (fixed > 0) {
  console.log(`\n✨ ${fixed} error(es) del baseline ya resuelto(s). Baja el baseline: node scripts/typecheck-baseline.mjs --update`);
}
console.log("\n✅ Sin errores de tipo nuevos.");
process.exit(0);
