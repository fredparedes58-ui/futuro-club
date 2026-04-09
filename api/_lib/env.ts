/**
 * VITAS · Environment Variable Validation
 *
 * Provee acceso tipado a env vars y falla rápido con mensajes claros
 * si una variable requerida no está configurada.
 *
 * Uso:
 *   import { env } from "../_lib/env";
 *   const url = env.supabaseUrl; // string garantizado
 */

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[env] Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Supabase URL — acepta SUPABASE_URL o VITE_SUPABASE_URL */
function supabaseUrl(): string {
  const val = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!val) throw new Error("[env] Missing SUPABASE_URL or VITE_SUPABASE_URL");
  return val;
}

/** Supabase key — acepta SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY */
function supabaseKey(): string {
  const val = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!val) throw new Error("[env] Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY");
  return val;
}

/**
 * Lazy env accessor — solo valida al momento de acceder, no al importar.
 * Esto permite que endpoints que no necesitan ciertas vars funcionen sin ellas.
 */
export const env = {
  // ─── Supabase ───
  get supabaseUrl() { return supabaseUrl(); },
  get supabaseKey() { return supabaseKey(); },
  get supabaseJwtSecret() { return required("SUPABASE_JWT_SECRET"); },
  get supabaseServiceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },

  // ─── AI Providers ───
  get anthropicApiKey() { return required("ANTHROPIC_API_KEY"); },
  get voyageApiKey() { return required("VOYAGE_API_KEY"); },
  get geminiApiKey() { return required("GEMINI_API_KEY"); },

  // ─── Bunny CDN ───
  get bunnyStreamLibraryId() { return required("BUNNY_STREAM_LIBRARY_ID"); },
  get bunnyStreamApiKey() { return required("BUNNY_STREAM_API_KEY"); },
  get bunnyCdnHostname() { return optional("BUNNY_CDN_HOSTNAME", optional("VITE_BUNNY_CDN_HOSTNAME")); },
  get bunnyStorageZone() { return required("BUNNY_STORAGE_ZONE"); },
  get bunnyStorageApiKey() { return required("BUNNY_STORAGE_API_KEY"); },
  get bunnyStorageCdnUrl() { return required("BUNNY_STORAGE_CDN_URL"); },

  // ─── Stripe ───
  get stripeSecretKey() { return required("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return required("STRIPE_WEBHOOK_SECRET"); },
  get stripeProPriceId() { return optional("STRIPE_PRO_PRICE_ID", optional("VITE_STRIPE_PRO_PRICE_ID")); },
  get stripeClubPriceId() { return optional("STRIPE_CLUB_PRICE_ID", optional("VITE_STRIPE_CLUB_PRICE_ID")); },

  // ─── Notifications ───
  get vapidPublicKey() { return optional("VITE_VAPID_PUBLIC_KEY"); },
  get vapidPrivateKey() { return required("VAPID_PRIVATE_KEY"); },
  get vapidMailto() { return optional("VAPID_MAILTO", "mailto:admin@vitas.app"); },

  // ─── External APIs ───
  get footballDataApiKey() { return required("FOOTBALL_DATA_API_KEY"); },
  get resendApiKey() { return required("RESEND_API_KEY"); },

  // ─── Rate Limiting ───
  get upstashRedisUrl() { return optional("UPSTASH_REDIS_REST_URL"); },
  get upstashRedisToken() { return optional("UPSTASH_REDIS_REST_TOKEN"); },

  // ─── Security ───
  get cronSecret() { return optional("CRON_SECRET"); },
  get adminSecret() { return optional("ADMIN_SECRET"); },
  get allowedOrigin() { return optional("ALLOWED_ORIGIN", "https://futuro-club.vercel.app"); },

  // ─── Roboflow (legacy) ───
  get roboflowApiKey() { return optional("ROBOFLOW_API_KEY"); },
  get roboflowWorkspace() { return optional("ROBOFLOW_WORKSPACE"); },
  get roboflowProject() { return optional("ROBOFLOW_PROJECT"); },
};
