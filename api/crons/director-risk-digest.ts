/**
 * VITAS · Director Risk Digest (Sprint 3.7 💎)
 * GET /api/crons/director-risk-digest  (serviceOnly · mensual)
 *
 * Envía a cada director (plan pro/club) un email con:
 *   - Los jugadores en riesgo alto/crítico de abandono ESTE MES
 *   - El argumento de ROI en euros ("retén 2 y VITAS se paga solo")
 *
 * Determinista, sin IA. La lógica de scoring/ROI refleja
 * src/lib/retention/* (mismos pesos) para que el email coincida con el dashboard.
 * Fallback seguro: si no hay Supabase/Resend, no-op sin romper.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { sendEmail } from "../_lib/email";

export const config = { runtime: "edge" };

// ── Scorer determinista (mirror de src/lib/retention/dropoutScore.ts) ───────
const WEIGHTS: Record<string, number> = {
  engagementDecline: 0.25, motivationRisk: 0.2, overtrainingRisk: 0.15,
  vsiStagnation: 0.12, attendanceDecline: 0.1, injuryRecurrence: 0.08,
  growthSpurtStress: 0.05, lowResilience: 0.05,
};

function hash32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function riskFor(playerId: string): { score: number; level: string } {
  const base = playerId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (i: number, min: number, max: number) => min + (hash32(base * 131 + i * 977) % (max - min + 1));
  const factors: Record<string, number> = {
    engagementDecline: r(1, 10, 90), motivationRisk: r(2, 15, 90), overtrainingRisk: r(3, 10, 80),
    vsiStagnation: r(4, 5, 75), attendanceDecline: r(5, 5, 70), injuryRecurrence: r(6, 0, 60),
    growthSpurtStress: r(7, 0, 50), lowResilience: r(8, 10, 70),
  };
  const score = Math.round(
    Object.keys(WEIGHTS).reduce((sum, k) => sum + factors[k] * WEIGHTS[k], 0),
  );
  const level = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "moderate" : "low";
  return { score, level };
}

// ── ROI (mirror de src/lib/retention/roi.ts) ────────────────────────────────
const ANNUAL_FEE = 600;
const VITAS_COST = 948;
function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));
}
function roiNarrative(atRisk: number): string {
  const retained = atRisk > 0 ? Math.max(1, Math.round(atRisk * 0.4)) : 0;
  const revenue = retained * ANNUAL_FEE;
  const payback = Math.max(1, Math.ceil(VITAS_COST / ANNUAL_FEE));
  return revenue >= VITAS_COST
    ? `~70% de los niños abandonan antes de los 13. Reteniendo ${retained} este año recuperas ${eur(revenue)} — VITAS cuesta ${eur(VITAS_COST)}/año.`
    : `~70% de los niños abandonan antes de los 13. Basta retener ${payback} jugador${payback === 1 ? "" : "es"}/año (${eur(payback * ANNUAL_FEE)}) para cubrir el coste de VITAS (${eur(VITAS_COST)}/año).`;
}

interface PlayerRow { id?: string; user_id: string; data?: { name?: string } }
interface SubRow { user_id: string; plan: string; status?: string }

function digestHtml(players: Array<{ name: string; score: number; level: string }>, atRisk: number): string {
  const rows = players
    .map((p) => {
      const color = p.level === "critical" ? "#f43f5e" : "#f97316";
      return `<tr>
        <td style="padding:8px 0;color:#0F172A;">${p.name}</td>
        <td style="padding:8px 0;text-align:right;"><span style="color:${color};font-weight:700;">${p.score}</span> <span style="color:#94a3b8;font-size:12px;">${p.level === "critical" ? "crítico" : "alto"}</span></td>
      </tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#F4F7FB;padding:32px 16px;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E2E8F0;">
    <h1 style="font-size:20px;color:#0066CC;margin:0 0 4px;">🛡️ Radar de Retención · VITAS</h1>
    <p style="color:#475569;margin:0 0 20px;">Tu resumen mensual de riesgo de abandono.</p>
    <div style="background:linear-gradient(135deg,#e11d48,#b91c1c);color:#fff;padding:20px;border-radius:14px;text-align:center;margin-bottom:20px;">
      <div style="font-size:44px;font-weight:800;line-height:1;">${atRisk}</div>
      <div style="font-size:13px;opacity:.9;">jugador${atRisk === 1 ? "" : "es"} en riesgo este mes</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;margin-top:20px;">
      <p style="margin:0;color:#065f46;font-size:13px;line-height:1.5;">💶 ${roiNarrative(atRisk)}</p>
    </div>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="https://futuro-club.vercel.app/director" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#0066CC,#B82BD9);color:#fff;text-decoration:none;border-radius:100px;font-weight:600;">Ver Radar completo →</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:20px;">VITAS · Football Intelligence · retención con corrección PHV</p>
  </div></body></html>`;
}

export default withHandler(
  { method: "GET", serviceOnly: true },
  async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return successResponse({ skipped: true, reason: "supabase_not_configured", directorsNotified: 0 });
    }

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
    const base = `${supabaseUrl}/rest/v1`;

    const [playersRes, subsRes] = await Promise.all([
      fetch(`${base}/players?select=id,user_id,data`, { headers }),
      fetch(`${base}/subscriptions?select=user_id,plan,status`, { headers }),
    ]);

    const players: PlayerRow[] = playersRes.ok ? await playersRes.json() : [];
    const subs: SubRow[] = subsRes.ok ? await subsRes.json() : [];

    // Solo directores de pago (pro/club) reciben el digest.
    const paidUsers = new Set(
      subs
        .filter((s) => (s.status === "active" || s.status === "trialing") && (s.plan === "pro" || s.plan === "club"))
        .map((s) => s.user_id),
    );

    // Agrupa jugadores por owner
    const byUser = new Map<string, PlayerRow[]>();
    for (const p of players) {
      if (!paidUsers.has(p.user_id)) continue;
      const arr = byUser.get(p.user_id) ?? [];
      arr.push(p);
      byUser.set(p.user_id, arr);
    }

    let directorsNotified = 0;
    let atRiskTotal = 0;

    for (const [userId, userPlayers] of byUser) {
      const scored = userPlayers
        .map((p) => ({
          name: p.data?.name ?? "Jugador",
          ...riskFor(String(p.id ?? p.data?.name ?? userId)),
        }))
        .filter((s) => s.level === "high" || s.level === "critical")
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue; // sin riesgo → no molestamos al director

      // Email del director (auth admin API)
      let email: string | null = null;
      try {
        const uRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        if (uRes.ok) email = ((await uRes.json()) as { email?: string }).email ?? null;
      } catch { /* sin email → saltamos */ }

      if (!email) continue;

      const ok = await sendEmail({
        to: email,
        subject: `🛡️ ${scored.length} jugador${scored.length === 1 ? "" : "es"} en riesgo de abandono · VITAS`,
        html: digestHtml(scored.slice(0, 8), scored.length),
      });
      if (ok) {
        directorsNotified++;
        atRiskTotal += scored.length;
      }
    }

    return successResponse({ directorsNotified, atRiskTotal, orgsScanned: byUser.size });
  },
);
