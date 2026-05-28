/**
 * VITAS · POST /api/injuries/save
 * Upsert player injury records to Supabase `player_injuries` table.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const injuryEntrySchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  severity: z.enum(["mild", "moderate", "severe"]),
  bodyPart: z.string().min(1),
  date: z.string(),
  daysOut: z.number().nullable().optional(),
  mechanism: z.string().optional(),
  notes: z.string().optional(),
  isRecurrent: z.boolean().optional().default(false),
});

const InjurySaveSchema = z.object({
  playerId: z.string(),
  injuries: z.array(injuryEntrySchema),
});

export default withHandler(
  { method: "POST", schema: InjurySaveSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const { playerId, injuries } = body;

    // Get tenant_id from player
    const playerRes = await fetch(
      `${supabaseUrl}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&select=tenant_id`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    const players = await playerRes.json();
    const tenantId = players?.[0]?.tenant_id ?? userId;

    // Upsert each injury
    const rows = injuries.map((inj) => ({
      player_id: playerId,
      tenant_id: tenantId,
      injury_type: inj.type,
      severity: inj.severity,
      body_part: inj.bodyPart,
      injury_date: inj.date,
      days_out: inj.daysOut ?? null,
      mechanism: inj.mechanism ?? null,
      notes: inj.notes ?? null,
      is_recurrent: inj.isRecurrent ?? false,
      reported_by: userId,
      gdpr_consent: true, // consent collected in UI
    }));

    // Delete existing injuries for this player (replace strategy)
    await fetch(
      `${supabaseUrl}/rest/v1/player_injuries?player_id=eq.${encodeURIComponent(playerId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    // Insert all
    if (rows.length > 0) {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/player_injuries`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(rows),
      });

      if (!insertRes.ok) {
        const err = await insertRes.text().catch(() => "error");
        console.error("[injuries/save] Insert error:", err);
        return errorResponse(`Supabase error: ${err}`, 500);
      }

      const inserted = await insertRes.json();
      return successResponse({ saved: inserted.length, injuries: inserted });
    }

    return successResponse({ saved: 0, injuries: [] });
  },
);
