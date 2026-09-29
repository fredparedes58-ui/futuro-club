/**
 * VITAS · Team Report Agent (Sprint 8) — ruta HTTP "Informe sin vídeo (solo notas)"
 *
 * Genera un informe táctico de equipo a partir de métricas/notas aportadas (sin vídeo).
 * La lógica (prompt v1.1.0, llamada a Claude, validación, abstención honesta sin key)
 * vive en ./_teamReportCore.ts y la comparte el job de partido (inv #7). El informe
 * A-vs-B DESDE EL VÍDEO lo genera el job (api/match), con team-report.v2.
 *
 * Input: shared pipeline context + team metrics
 * Output: { report, promptVersion, source, model? } — `model` = modelo REAL de la respuesta.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { localeSchema } from "../../src/lib/shared/locale";
import { generateTeamReport } from "./_teamReportCore";

export const config = { runtime: "edge" };

const inputSchema = z.object({
  analysisId: z.string().optional(),
  teamMetrics: z.record(z.unknown()).optional(),
  homeFormation: z.string().optional(),
  awayFormation: z.string().optional(),
  possession: z.record(z.unknown()).optional(),
  pressing: z.record(z.unknown()).optional(),
  passNetwork: z.record(z.unknown()).optional(),
  playerContext: z.record(z.unknown()).optional(),
  locale: localeSchema.optional(),
}).passthrough();

export default withHandler(
  { schema: inputSchema, requireAuth: true, allowServiceToken: true, maxRequests: 100 },
  async ({ body }) => successResponse({ data: await generateTeamReport(body as z.infer<typeof inputSchema>) }),
);
