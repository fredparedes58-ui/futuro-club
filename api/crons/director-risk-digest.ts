/**
 * VITAS · Director Risk Digest (Sprint 3.7)
 * GET /api/crons/director-risk-digest  (serviceOnly · mensual, vercel.json)
 *
 * Envía a cada director de pago (plan pro/club, active|trialing) un email con los
 * jugadores cuya evaluación de riesgo de abandono es REAL y alta o crítica.
 *
 * P0 (menores · legal): antes este cron calculaba el riesgo con un HASH del id del
 * jugador (tercera copia del scorer) y enviaba por email NOMBRES de menores «en
 * riesgo alto/crítico» con cifras inventadas, tapadas con un aviso de «datos de
 * ejemplo». `.claude/rules/metricas.md` prohíbe derivar valores de un hash del id
 * aunque haya banner. Ahora:
 *   - El riesgo sale de la ÚNICA implementación de servidor
 *     (`api/_lib/dropoutAssessment.ts`), la misma del panel /wellbeing (inv #7).
 *   - Un jugador SOLO aparece si su evaluación es `source: "computed"` (hay al menos
 *     una señal real: asistencia, implicación o carga). `insufficient_data` ⇒ NO se
 *     lista. Aquí no existe ninguna ruta mock/hash/demo.
 *   - Si ningún jugador del director tiene una evaluación real alta o crítica, NO se
 *     envía nada: ni nombres ni un resumen «sin datos». Motivo: es lo más seguro
 *     (ningún dato sobre menores sale del sistema) y un correo «sin datos» mensual
 *     puede leerse como «nadie en riesgo», que tampoco es cierto.
 *   - El email declara procedencia (etiqueta canónica), confianza, cobertura
 *     (evaluados con datos reales / total) y los factores que aún no tienen señal.
 *   - Solo lectura: no persiste evaluaciones.
 * Fallback seguro: sin Supabase → no-op; sin Resend → sendEmail devuelve false.
 */

import { withHandler } from "../_lib/withHandler";
import { env } from "../_lib/env";
import { successResponse } from "../_lib/apiResponse";
import { sendEmail } from "../_lib/email";
import { esc } from "../_lib/demoAccess";
import {
  computeDropoutAssessment,
  dropoutRiskMetric,
  fetchDropoutSignals,
  makeRowSelector,
  type RowSelector,
  type SignalCoverage,
} from "../_lib/dropoutAssessment";
import { provenanceLabel } from "../../src/lib/metrics/provenanceLabel";
import type { Provenance } from "../../src/lib/metrics/MetricResult";

export const config = { runtime: "edge" };

/** Jugadores evaluados en paralelo (3 SELECT por jugador). */
const EVAL_CONCURRENCY = 5;

interface ListedPlayer {
  name: string;
  score: number;
  level: "high" | "critical";
  signals: SignalCoverage;
  provenance: Provenance;
  confidence: number;
}

export interface DirectorDigest {
  /** Jugadores con evaluación REAL alta o crítica (orden: riesgo desc). */
  listed: ListedPlayer[];
  /** Jugadores con evaluación real (cualquier nivel). */
  evaluated: number;
  /** Jugadores sin datos suficientes (nunca se nombran). */
  withoutData: number;
  total: number;
}

/**
 * Evalúa a los jugadores de UN director con el scorer canónico.
 * Pura salvo por las lecturas vía `select` (inyectable en tests).
 */
export async function buildDirectorDigest(
  players: Array<Record<string, unknown>>,
  select: RowSelector,
): Promise<DirectorDigest> {
  const listed: ListedPlayer[] = [];
  let evaluated = 0;
  let withoutData = 0;

  for (let i = 0; i < players.length; i += EVAL_CONCURRENCY) {
    const chunk = players.slice(i, i + EVAL_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (p) => {
        const id = typeof p.id === "string" && p.id ? p.id : null;
        if (!id) return null; // sin id no hay señales que leer → sin datos
        const result = computeDropoutAssessment(id, await fetchDropoutSignals(id, select));
        return { p, result };
      }),
    );

    for (const r of results) {
      if (!r || r.result.source !== "computed") {
        withoutData++;
        continue;
      }
      const metric = dropoutRiskMetric(r.result);
      // Defensa en profundidad: sin value (bloqueada) no se nombra a nadie.
      if (metric.value === null) {
        withoutData++;
        continue;
      }
      evaluated++;
      const level = r.result.assessment.riskLevel;
      if (level !== "high" && level !== "critical") continue;
      const data = (r.p.data ?? {}) as { name?: unknown };
      listed.push({
        name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Jugador sin nombre",
        score: metric.value,
        level,
        signals: r.result.signals,
        provenance: metric.provenance,
        confidence: metric.confidence,
      });
    }
  }

  listed.sort((a, b) => b.score - a.score);
  return { listed, evaluated, withoutData, total: players.length };
}

function signalsText(s: SignalCoverage): string {
  const parts: string[] = [];
  if (s.attendance) parts.push("asistencia");
  if (s.engagement) parts.push(s.motivation ? "implicación y motivación" : "implicación");
  if (s.fatigue) parts.push("carga (fatiga)");
  return parts.join(" · ");
}

export function digestSubject(d: DirectorDigest): string {
  const n = d.listed.length;
  return `VITAS · ${n} jugador${n === 1 ? "" : "es"} con riesgo de abandono alto o crítico (calculado)`;
}

export function digestHtml(d: DirectorDigest, computedOn: string): string {
  const n = d.listed.length;
  // Todos los listados comparten procedencia/confianza (mismo modelo); se toman del
  // MetricResult, nunca se escriben a mano.
  const first = d.listed[0];
  const label = first ? provenanceLabel(first.provenance) ?? "" : "";
  const confidencePct = first ? Math.round(first.confidence * 100) : 0;
  const rows = d.listed
    .map((p) => {
      const color = p.level === "critical" ? "#be123c" : "#c2410c";
      return `<tr>
        <td style="padding:8px 0;color:#0F172A;border-bottom:1px solid #F1F5F9;">${esc(p.name)}</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #F1F5F9;"><span style="color:${color};font-weight:700;">${p.score}/100</span> <span style="color:#64748b;font-size:12px;">${p.level === "critical" ? "crítico" : "alto"}</span></td>
      </tr>
      <tr><td colspan="2" style="padding:0 0 8px;color:#64748b;font-size:12px;">Datos usados: ${esc(signalsText(p.signals))}</td></tr>`;
    })
    .join("");
  const notEvaluated = d.total - d.evaluated;
  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#F4F7FB;padding:32px 16px;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #E2E8F0;">
    <h1 style="font-size:20px;color:#0066CC;margin:0 0 4px;">Radar de Retención · VITAS</h1>
    <p style="color:#475569;margin:0 0 20px;">Resumen mensual de riesgo de abandono (calculado el ${esc(computedOn)}). Solo aparecen jugadores con una evaluación calculada a partir de datos registrados en VITAS.</p>
    <div style="background:#FFF1F2;border:1px solid #FECDD3;color:#9F1239;padding:20px;border-radius:14px;text-align:center;margin-bottom:12px;">
      <div style="font-size:40px;font-weight:800;line-height:1;">${n}</div>
      <div style="font-size:13px;">jugador${n === 1 ? "" : "es"} con riesgo alto o crítico</div>
    </div>
    <p style="color:#475569;font-size:13px;margin:0 0 16px;">Evaluados con datos reales: <strong>${d.evaluated} de ${d.total}</strong> jugadores.${notEvaluated > 0 ? ` Los otros ${notEvaluated} no tienen datos suficientes: no aparecen en este correo, y eso <strong>no</strong> significa que no tengan riesgo.` : ""}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:20px;">
      <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.5;"><strong>Procedencia: ${esc(label)}.</strong> Resultado de un modelo de 8 factores aplicado a los datos registrados (asistencia, implicación, carga). Es una señal orientativa para priorizar conversaciones, no un diagnóstico.</p>
      <p style="margin:0 0 8px;color:#334155;font-size:13px;line-height:1.5;"><strong>Confianza: ${confidencePct} % (orientativa).</strong> Los pesos y umbrales del modelo están pendientes de validar.</p>
      <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">Estancamiento de VSI, lesiones recurrentes y estrés de crecimiento aún no tienen señal y suman 0, así que el riesgo puede estar infravalorado. La resiliencia, sin datos, se excluye.</p>
    </div>
    <p style="text-align:center;margin:24px 0 0;">
      <a href="${env.publicUrl}/wellbeing" style="display:inline-block;padding:12px 28px;background:#0066CC;color:#fff;text-decoration:none;border-radius:100px;font-weight:600;">Ver Bienestar en VITAS</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:20px;">VITAS · Football Intelligence</p>
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

    const select = makeRowSelector(supabaseUrl, serviceKey);
    const subs = await select(`subscriptions?select=user_id,plan,status`);

    // Solo directores de pago (pro/club) reciben el digest.
    const paidUsers = [
      ...new Set(
        subs
          .filter((s) => (s.status === "active" || s.status === "trialing") && (s.plan === "pro" || s.plan === "club"))
          .map((s) => (typeof s.user_id === "string" ? s.user_id : ""))
          .filter(Boolean),
      ),
    ];

    const computedOn = new Date().toISOString().slice(0, 10);
    let directorsNotified = 0;
    let atRiskTotal = 0;
    let playersEvaluated = 0;
    let playersWithoutData = 0;

    for (const userId of paidUsers) {
      // Solo los jugadores de ESTE director (minimización: no se leen los de otros).
      const players = await select(`players?user_id=eq.${encodeURIComponent(userId)}&select=id,data`);
      if (players.length === 0) continue;

      const digest = await buildDirectorDigest(players, select);
      playersEvaluated += digest.evaluated;
      playersWithoutData += digest.withoutData;

      // Sin evaluación REAL alta/crítica → no se envía nada (ni nombres ni resumen).
      if (digest.listed.length === 0) continue;

      // Email del director (auth admin API)
      let email: string | null = null;
      try {
        const uRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        if (uRes.ok) email = ((await uRes.json()) as { email?: string }).email ?? null;
      } catch { /* sin email → saltamos */ }

      if (!email) continue;

      const ok = await sendEmail({
        to: email,
        subject: digestSubject(digest),
        html: digestHtml(digest, computedOn),
      });
      if (ok) {
        directorsNotified++;
        atRiskTotal += digest.listed.length;
      }
    }

    return successResponse({
      directorsNotified,
      atRiskTotal,
      orgsScanned: paidUsers.length,
      playersEvaluated,
      playersWithoutData,
    });
  },
);
