/**
 * VITAS — Supabase Client
 *
 * Env vars (Vite, prefijo VITE_):
 *   VITE_SUPABASE_URL       — Project URL, e.g. https://xyz.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — Public anon key (safe en frontend)
 *
 * Mientras no estén configuradas, el cliente crea una instancia vacía y
 * todas las llamadas devuelven error gracefully.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_CONFIGURED = !!(supabaseUrl && supabaseAnonKey);

// Si no hay credenciales, usamos placeholders para evitar crash en build.
// Todas las operaciones fallarán con error de red (controlado en AuthContext).
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key"
);

// Tipos de tabla
export interface DbPlayer {
  id: string;
  user_id: string;
  data: unknown; // Player JSON completo
  created_at: string;
  updated_at: string;
}
