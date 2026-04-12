/**
 * VITAS · Health Check & Env Diagnostic
 * GET /api/health — reports which env vars are configured (no values exposed)
 */

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const check = (name: string) => !!process.env[name];

  const status = {
    ok: true,
    timestamp: new Date().toISOString(),
    env: {
      // Supabase
      VITE_SUPABASE_URL: check("VITE_SUPABASE_URL"),
      SUPABASE_URL: check("SUPABASE_URL"),
      VITE_SUPABASE_ANON_KEY: check("VITE_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: check("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_JWT_SECRET: check("SUPABASE_JWT_SECRET"),

      // Bunny Stream
      BUNNY_STREAM_LIBRARY_ID: check("BUNNY_STREAM_LIBRARY_ID"),
      BUNNY_STREAM_API_KEY: check("BUNNY_STREAM_API_KEY"),
      BUNNY_CDN_HOSTNAME: check("BUNNY_CDN_HOSTNAME"),
      BUNNY_API_KEY: check("BUNNY_API_KEY"), // legacy name check

      // Bunny Storage
      BUNNY_STORAGE_ZONE: check("BUNNY_STORAGE_ZONE"),
      BUNNY_STORAGE_API_KEY: check("BUNNY_STORAGE_API_KEY"),
      BUNNY_STORAGE_CDN_URL: check("BUNNY_STORAGE_CDN_URL"),

      // AI
      ANTHROPIC_API_KEY: check("ANTHROPIC_API_KEY"),
      GEMINI_API_KEY: check("GEMINI_API_KEY"),
      GOOGLE_AI_API_KEY: check("GOOGLE_AI_API_KEY"),
      VOYAGE_API_KEY: check("VOYAGE_API_KEY"),

      // Stripe
      STRIPE_SECRET_KEY: check("STRIPE_SECRET_KEY"),
      STRIPE_WEBHOOK_SECRET: check("STRIPE_WEBHOOK_SECRET"),

      // Notifications
      VAPID_PRIVATE_KEY: check("VAPID_PRIVATE_KEY"),
      VAPID_PUBLIC_KEY: check("VITE_VAPID_PUBLIC_KEY") || check("VAPID_PUBLIC_KEY"),

      // Rate limiting
      UPSTASH_REDIS_REST_URL: check("UPSTASH_REDIS_REST_URL"),

      // Other
      ALLOWED_ORIGIN: check("ALLOWED_ORIGIN"),
      FOOTBALL_DATA_API_KEY: check("FOOTBALL_DATA_API_KEY"),
      RESEND_API_KEY: check("RESEND_API_KEY"),
      TURNSTILE_SECRET_KEY: check("TURNSTILE_SECRET_KEY"),
    },
  };

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "https://futuro-club.vercel.app",
    },
  });
}
