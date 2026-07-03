/**
 * VITAS · Smoke Test post-activación (Sprint 0.8)
 *
 * Verifica, contra producción, que lo esencial responde y que el gating de auth
 * (Sprint 3.3) está vivo. NO cubre el E2E completo (subida de vídeo real, RLS con
 * 2 cuentas) — eso es manual (ver checklist Sprint 0).
 *
 * Uso:
 *   npx tsx scripts/smoke-test.ts                       # contra producción
 *   BASE_URL=http://localhost:5200 npx tsx scripts/smoke-test.ts
 */

const BASE = process.env.BASE_URL ?? "https://futuro-club.vercel.app";

type Check = { name: string; run: () => Promise<{ ok: boolean; detail: string }> };

async function status(path: string, init?: RequestInit): Promise<number> {
  const res = await fetch(`${BASE}${path}`, init);
  return res.status;
}

const checks: Check[] = [
  {
    name: "Sitio arriba (GET /)",
    run: async () => {
      const s = await status("/");
      return { ok: s === 200, detail: `HTTP ${s}` };
    },
  },
  {
    name: "Auth enforcement · injury-risk-calculator sin token → 401 (Sprint 3.3)",
    run: async () => {
      const s = await status("/api/agents/injury-risk-calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "smoke" }),
      });
      return { ok: s === 401, detail: `HTTP ${s} (esperado 401)` };
    },
  },
  {
    name: "Auth enforcement · behavioral/compute-profile sin token → 401",
    run: async () => {
      const s = await status("/api/behavioral/compute-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "smoke" }),
      });
      return { ok: s === 401, detail: `HTTP ${s} (esperado 401)` };
    },
  },
  {
    name: "Auth enforcement · idp/generate-plan sin token → 401",
    run: async () => {
      const s = await status("/api/idp/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { ok: s === 401, detail: `HTTP ${s} (esperado 401)` };
    },
  },
  {
    name: "Telegram webhook endpoint",
    run: async () => {
      const s = await status("/api/telegram/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // 503 = falta TELEGRAM_BOT_TOKEN ; 401 = secret mismatch ; 200 = activo
      const map: Record<number, string> = {
        503: "❗ falta TELEGRAM_BOT_TOKEN en Vercel",
        401: "❗ TELEGRAM_WEBHOOK_SECRET no coincide (o falta secret en la petición)",
        200: "✅ activo",
      };
      return { ok: s === 200 || s === 401, detail: `HTTP ${s} — ${map[s] ?? "revisar"}` };
    },
  },
  {
    name: "CORS/preflight OPTIONS responde (endpoint edge vivo)",
    run: async () => {
      const s = await status("/api/agents/injury-risk-calculator", { method: "OPTIONS" });
      return { ok: s === 200 || s === 204, detail: `HTTP ${s}` };
    },
  },
];

async function main() {
  console.log(`\n🔎 VITAS smoke test → ${BASE}\n`);
  let pass = 0;
  for (const c of checks) {
    try {
      const r = await c.run();
      console.log(`${r.ok ? "✅" : "❌"} ${c.name} — ${r.detail}`);
      if (r.ok) pass++;
    } catch (err) {
      console.log(`❌ ${c.name} — error: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\n${pass}/${checks.length} checks OK\n`);
  console.log("Pendiente manual (no automatizable aquí):");
  console.log("  • Login real + subida de vídeo a Bunny + análisis E2E");
  console.log("  • RLS con 2 cuentas: ver supabase/verify-rls.sql + checklist Sprint 0");
  process.exit(pass === checks.length ? 0 : 1);
}

main();
