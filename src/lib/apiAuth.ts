/**
 * Shared auth header utility for API calls.
 * Returns headers with JWT token from Supabase session.
 * Automatically refreshes expired tokens before returning.
 */
import { supabase } from "./supabase";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;

    // If session exists but token is expired (or about to expire in 60s), refresh
    if (data.session) {
      const expiresAt = data.session.expires_at ?? 0; // epoch seconds
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSec < 60) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          token = refreshed.session.access_token;
        }
      }
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch { /* no session */ }
  return headers;
}
