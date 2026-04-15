#!/usr/bin/env node
/**
 * VITAS · API Router Guard
 *
 * Detecta directorios bajo `api/` que tienen archivos con prefijo `_`
 * (handlers individuales ignorados por Vercel file-based routing)
 * pero NO tienen un `[action].ts` que los exponga como endpoints públicos.
 *
 * Objetivo: Evitar que un `_handler.ts` huérfano se quede sin router y
 * el frontend devuelva 404 silenciosos en producción (bug típico de
 * VITAS cuando se añade un endpoint y se olvida el routing).
 *
 * Uso:
 *   node scripts/check-api-routers.mjs
 *
 * Integrado en `npm run lint` (ver package.json).
 * Falla con exit code 1 si hay directorios huérfanos.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const API_ROOT = resolve(__dirname, "..", "api");

/**
 * Directorios que NO necesitan router porque son infraestructura interna
 * (no se exponen como endpoints HTTP públicos).
 */
const INTERNAL_DIRS = new Set([
  "_lib", // utilidades compartidas (withHandler, apiResponse, env, etc.)
  "data", // módulos de datos estáticos importados por otros endpoints (no handlers)
]);

/**
 * Archivos `_*.ts` que son intencionalmente internos y no se exponen
 * como endpoints HTTP directos (ej. webhooks con URL propia, crons).
 * Se permiten sin estar en el router.
 */
const INTENTIONAL_INTERNAL_HANDLERS = new Set([
  // Webhook de Stripe: configurado con URL propia en Stripe Dashboard,
  // no se llama desde el frontend.
  "stripe/_webhook.ts",
  // Cron job de notificaciones: invocado por Vercel Cron, no frontend.
  "notifications/_cron.ts",
]);

/**
 * Lista subdirectorios inmediatos de api/
 */
function listSubdirs(rootPath) {
  return readdirSync(rootPath)
    .filter(name => {
      const full = join(rootPath, name);
      return statSync(full).isDirectory() && !INTERNAL_DIRS.has(name);
    });
}

/**
 * Lista archivos `_*.ts` en un directorio (handlers individuales).
 */
function listUnderscoreHandlers(dir) {
  return readdirSync(dir)
    .filter(name =>
      name.startsWith("_") &&
      name.endsWith(".ts") &&
      !name.endsWith(".d.ts")
    );
}

/**
 * Comprueba si un directorio tiene `[action].ts` (router) o `[...path].ts` (catch-all).
 */
function hasRouter(dir) {
  return existsSync(join(dir, "[action].ts")) ||
         existsSync(join(dir, "[...path].ts"));
}

// ────────────────────────────────────────────────────────────────────────────

if (!existsSync(API_ROOT)) {
  console.error("❌ api/ directory not found at", API_ROOT);
  process.exit(1);
}

const problems = [];
const subdirs = listSubdirs(API_ROOT);

for (const sub of subdirs) {
  const dir = join(API_ROOT, sub);
  const handlers = listUnderscoreHandlers(dir);

  if (handlers.length === 0) continue; // No hay handlers → no necesita router

  // Filtrar handlers intencionalmente internos
  const exposedHandlers = handlers.filter(
    h => !INTENTIONAL_INTERNAL_HANDLERS.has(`${sub}/${h}`)
  );

  if (exposedHandlers.length === 0) continue;

  if (!hasRouter(dir)) {
    problems.push({
      dir: sub,
      handlers: exposedHandlers,
    });
  }
}

if (problems.length === 0) {
  console.log("✅ API router check: todos los directorios con handlers _*.ts tienen [action].ts");
  process.exit(0);
}

console.error("\n❌ API ROUTER GUARD: se detectaron directorios huérfanos\n");
console.error("   Los siguientes directorios tienen handlers con prefijo `_`");
console.error("   pero NO tienen `[action].ts` que los exponga como endpoints.");
console.error("   Resultado: el frontend recibirá 404 al intentar llamarlos.\n");

for (const p of problems) {
  console.error(`   📁 api/${p.dir}/`);
  for (const h of p.handlers) {
    console.error(`      - ${h}`);
  }
  console.error(`      ⚠️  Falta: api/${p.dir}/[action].ts\n`);
}

console.error("   Cómo solucionarlo:");
console.error("   Crear api/<dir>/[action].ts siguiendo el patrón de otros routers");
console.error("   (ej. api/upload/[action].ts o api/legal/[action].ts).\n");

process.exit(1);
