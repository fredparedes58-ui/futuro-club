/**
 * Shared auth header utility for API calls.
 * Returns headers with JWT token from Supabase session.
 */
import { supabase } from "./supabase";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers["Authorization"] = `Bearer ${data.session.access_token}`;
    }
  } catch { /* no session */ }
  return headers;
}
