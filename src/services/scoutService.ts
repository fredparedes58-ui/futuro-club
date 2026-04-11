/**
 * VITAS Scout Service
 *
 * Lightweight client-side service. The real insight generation
 * now happens server-side via /api/scout/generate.
 * This file is kept for backward compatibility and utility functions.
 */

import { supabase } from "@/lib/supabase";

/**
 * Trigger insight generation for a specific player (post-analysis).
 * Called from usePlayerIntelligence after completing a video analysis.
 */
export async function triggerInsightForPlayer(playerId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;

    const res = await fetch("/api/scout/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ playerId }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get the count of unread insights for badge display.
 */
export async function getUnreadInsightCount(): Promise<number> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 0;

    const res = await fetch("/api/scout/insights?limit=1", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) return 0;
    const json = await res.json() as { data?: { unread?: number } };
    return json.data?.unread ?? 0;
  } catch {
    return 0;
  }
}
