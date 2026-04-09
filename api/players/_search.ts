/**
 * GET /api/players/search
 * Busca jugadores en la tabla players_indexed (StatsBomb/FBref).
 * Params: q, position, league, limit
 */

import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

export default withHandler(
  { method: "GET", maxRequests: 30 },
  async ({ req }) => {
    const url        = new URL(req.url);
    const q          = url.searchParams.get("q") ?? "";
    const position   = url.searchParams.get("position") ?? "";
    const league     = url.searchParams.get("league") ?? "";
    const limitParam = url.searchParams.get("limit") ?? "20";
    const limit      = Math.min(parseInt(limitParam) || 20, 50);

    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("players_indexed")
      .select("id,name,short_name,position,age,nationality,club,league,season,metric_speed,metric_shooting,metric_vision,metric_technique,metric_defending,metric_stamina,vsi_estimated,source")
      .order("vsi_estimated", { ascending: false })
      .limit(limit);

    if (q)        query = query.ilike("name", `%${q}%`);
    if (position) query = query.eq("position", position);
    if (league)   query = query.eq("league", league);

    const { data, error } = await query;

    if (error) {
      return errorResponse(error.message, 500);
    }

    return successResponse({ players: data ?? [], total: data?.length ?? 0 });
  },
);
