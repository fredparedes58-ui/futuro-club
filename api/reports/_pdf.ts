/**
 * VITAS · Server-Side PDF Report Generator
 * POST /api/reports/pdf
 *
 * Generates a player report PDF using HTML rendering.
 * Uses Vercel's Edge runtime with structured HTML output.
 * Returns PDF-ready HTML with print styles that the client
 * can convert via window.print() or receive as downloadable HTML.
 */
export const config = { runtime: "edge" };

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { errorResponse } from "../_lib/apiResponse";

const PdfRequestSchema = z.object({
  playerId: z.string(),
  type: z.enum(["player-report", "analysis-report", "evolution-report"]).default("player-report"),
});

export default withHandler(
  { schema: PdfRequestSchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };

    // 1. Fetch player data
    const playerRes = await fetch(
      `${supabaseUrl}/rest/v1/players?id=eq.${body.playerId}&user_id=eq.${userId}&select=data`,
      { headers }
    );

    if (!playerRes.ok) {
      return errorResponse("Failed to fetch player", 500);
    }

    const playerRows = await playerRes.json() as Array<{ data: Record<string, unknown> }>;
    if (playerRows.length === 0) {
      return errorResponse("Player not found", 404);
    }

    const player = playerRows[0].data as Record<string, unknown>;
    const metrics = (player.metrics ?? {}) as Record<string, number>;
    const name = (player.name as string) ?? "Jugador";
    const age = (player.age as number) ?? 0;
    const position = (player.position as string) ?? "";
    const vsi = (player.vsi as number) ?? 0;
    const foot = (player.foot as string) ?? "";
    const height = (player.height as number) ?? 0;
    const weight = (player.weight as number) ?? 0;
    const phvCategory = (player.phvCategory as string) ?? "";

    // 2. Fetch latest analysis if available
    let analysis: Record<string, unknown> | null = null;
    if (body.type !== "player-report") {
      const analysisRes = await fetch(
        `${supabaseUrl}/rest/v1/player_analyses?player_id=eq.${body.playerId}&user_id=eq.${userId}&select=report,created_at&order=created_at.desc&limit=1`,
        { headers }
      );
      if (analysisRes.ok) {
        const analysisRows = await analysisRes.json() as Array<{ report: Record<string, unknown>; created_at: string }>;
        if (analysisRows.length > 0) {
          analysis = analysisRows[0].report;
        }
      }
    }

    // 3. Generate HTML report
    const metricEntries = Object.entries(metrics).map(
      ([k, v]) => `<div class="metric"><span class="metric-label">${k}</span><div class="metric-bar"><div class="metric-fill" style="width:${v}%"></div></div><span class="metric-value">${v}</span></div>`
    ).join("");

    const analysisSection = analysis ? `
      <div class="section">
        <h2>Análisis Táctico</h2>
        <p>${(analysis as Record<string, Record<string, unknown>>)?.estadoActual?.resumenEjecutivo ?? "Sin análisis disponible"}</p>
      </div>
    ` : "";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>VITAS Report — ${name}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; line-height: 1.5; background: #fff; }
    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 24px 32px; border-radius: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header .vsi { font-size: 48px; font-weight: 800; }
    .header .vsi-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .info-card { background: #f8f9fa; border-radius: 8px; padding: 12px 16px; }
    .info-card .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-card .value { font-size: 18px; font-weight: 600; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #eee; }
    .metric { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .metric-label { width: 100px; font-size: 13px; font-weight: 500; text-transform: capitalize; }
    .metric-bar { flex: 1; height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden; }
    .metric-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 10px; transition: width 0.3s; }
    .metric-value { width: 40px; text-align: right; font-weight: 600; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 11px; color: #999; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${name}</h1>
      <p>${position} · ${age} años · ${foot === "right" ? "Diestro" : foot === "left" ? "Zurdo" : "Ambidiestro"}</p>
    </div>
    <div style="text-align:right">
      <div class="vsi-label">VITAS Score Index</div>
      <div class="vsi">${vsi.toFixed(1)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card"><div class="label">Altura</div><div class="value">${height} cm</div></div>
    <div class="info-card"><div class="label">Peso</div><div class="value">${weight} kg</div></div>
    <div class="info-card"><div class="label">Maduración</div><div class="value">${phvCategory === "ontme" ? "On-Time" : phvCategory === "early" ? "Temprana" : "Tardía"}</div></div>
    <div class="info-card"><div class="label">VSI</div><div class="value">${vsi.toFixed(1)}</div></div>
  </div>

  <div class="section">
    <h2>Métricas de Rendimiento</h2>
    ${metricEntries}
  </div>

  ${analysisSection}

  <div class="footer">
    <span>VITAS · Football Intelligence</span>
    <span>Generado: ${new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}</span>
  </div>
</body>
</html>`;

    // Return HTML with Content-Disposition for download
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="VITAS-Report-${name.replace(/\s+/g, "-")}.html"`,
        "Cache-Control": "no-cache",
      },
    });
  }
);
