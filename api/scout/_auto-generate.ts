/**
 * VITAS · Scout Auto-Generate Cron
 * GET /api/scout/auto-generate
 *
 * Runs automatically (Vercel cron) to generate insights for all players
 * that have new analyses since their last insight.
 * Protected: serviceOnly (CRON_SECRET).
 */
export const config = { runtime: "edge" };

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export default withHandler(
  { method: "GET", serviceOnly: true, maxRequests: 5 },
  async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // 1. Find users who have players with recent analyses (last 24h)
    //    but no scout_insights generated in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const analysesRes = await fetch(
      `${supabaseUrl}/rest/v1/player_analyses?created_at=gte.${since}&select=user_id,player_id&order=created_at.desc`,
      { headers }
    );

    if (!analysesRes.ok) {
      return errorResponse("Failed to fetch recent analyses", 500);
    }

    const analyses = await analysesRes.json() as Array<{ user_id: string; player_id: string }>;

    if (analyses.length === 0) {
      return successResponse({ message: "No recent analyses to process", generated: 0 });
    }

    // 2. Deduplicate by user_id + player_id
    const unique = new Map<string, { userId: string; playerId: string }>();
    for (const a of analyses) {
      const key = `${a.user_id}:${a.player_id}`;
      if (!unique.has(key)) {
        unique.set(key, { userId: a.user_id, playerId: a.player_id });
      }
    }

    // 3. Check which ones already have recent insights
    const recentInsightsRes = await fetch(
      `${supabaseUrl}/rest/v1/scout_insights?created_at=gte.${since}&select=user_id,player_id`,
      { headers }
    );

    const recentInsights = recentInsightsRes.ok
      ? await recentInsightsRes.json() as Array<{ user_id: string; player_id: string }>
      : [];

    const alreadyGenerated = new Set(
      recentInsights.map(i => `${i.user_id}:${i.player_id}`)
    );

    // 4. Filter to only those needing insights
    const toGenerate = [...unique.values()].filter(
      u => !alreadyGenerated.has(`${u.userId}:${u.playerId}`)
    );

    if (toGenerate.length === 0) {
      return successResponse({ message: "All recent analyses already have insights", generated: 0 });
    }

    // 5. Generate insights (max 10 per cron run to avoid timeout)
    const batch = toGenerate.slice(0, 10);
    let generated = 0;
    const errors: string[] = [];
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://futuro-club.vercel.app";

    for (const { userId, playerId } of batch) {
      try {
        // Call the existing generate endpoint internally
        const genRes = await fetch(`${baseUrl}/api/scout/generate`, {
          method: "POST",
          headers: {
            ...headers,
            // Pass user context for the generate endpoint
            "X-User-Id": userId,
          },
          body: JSON.stringify({ playerId }),
        });

        if (genRes.ok) {
          generated++;
        } else {
          const errText = await genRes.text().catch(() => "");
          errors.push(`Player ${playerId}: ${genRes.status} ${errText.slice(0, 100)}`);
        }
      } catch (err) {
        errors.push(`Player ${playerId}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return successResponse({
      message: `Auto-generated ${generated} insights`,
      generated,
      skipped: toGenerate.length - batch.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
);
