/**
 * VITAS · Telegram Coach Connect (Sprint B5 · día 1)
 *
 *   POST   /api/telegram/connect      → genera token onboarding + URL deep-link
 *   GET    /api/telegram/connect      → estado actual (vinculado o no)
 *   DELETE /api/telegram/connect      → desvincular (soft delete · unlinked_at)
 *
 * Envvars:
 *   TELEGRAM_BOT_USERNAME · ej. 'vitas_copilot_bot' (sin @)
 *
 * Auth: requiere usuario autenticado.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "vitas_copilot_bot";

const TOKEN_TTL_MS = 10 * 60 * 1000;     // 10 minutos

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default withHandler(
  {
    method: ["GET", "POST", "DELETE"],
    requireAuth: true,
    maxRequests: 30,
  },
  async ({ method, userId }) => {
    if (!userId) {
      return errorResponse({ code: "unauthorized", message: "Login requerido", status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Resolver tenant_id desde un player DEL PROPIO coach · fallback userId.
    // El cliente usa service_role (salta RLS), así que SIN .eq("user_id") esta
    // query cogería un player de CUALQUIER tenant → el tenant_id ajeno acabaría
    // en telegram_link_tokens y el bot quedaría scopeado al tenant equivocado
    // (fuga cross-tenant). El filtro por user_id ancla la resolución al coach.
    const { data: anyPlayer } = await supabase
      .from("players")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const tenantId = anyPlayer?.tenant_id ?? userId;

    // ── GET · estado del vínculo ─────────────────────────────
    if (method === "GET") {
      const { data: mapping } = await supabase
        .from("coach_telegram_mapping")
        .select("telegram_username, telegram_first_name, linked_at, last_active_at, conversation_count")
        .eq("user_id", userId)
        .is("unlinked_at", null)
        .maybeSingle();

      return successResponse({
        connected: !!mapping,
        botUsername: BOT_USERNAME,
        mapping: mapping ?? null,
      });
    }

    // ── DELETE · desvincular (soft) ──────────────────────────
    if (method === "DELETE") {
      const { error } = await supabase
        .from("coach_telegram_mapping")
        .update({ unlinked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("unlinked_at", null);

      if (error) {
        return errorResponse({ code: "unlink_failed", message: error.message, status: 500 });
      }
      return successResponse({ unlinked: true });
    }

    // ── POST · generar token + URL deep-link ─────────────────
    // Si ya hay mapping activo, no permitir crear otro hasta desvincular
    const { data: existing } = await supabase
      .from("coach_telegram_mapping")
      .select("telegram_username")
      .eq("user_id", userId)
      .is("unlinked_at", null)
      .maybeSingle();

    if (existing) {
      return errorResponse({
        code: "already_linked",
        message: `Ya estás vinculado a Telegram${existing.telegram_username ? ` (@${existing.telegram_username})` : ""}. Desvincula primero.`,
        status: 409,
      });
    }

    // Limpiar tokens viejos del usuario
    await supabase
      .from("telegram_link_tokens")
      .delete()
      .eq("user_id", userId)
      .or(`expires_at.lt.${new Date().toISOString()},consumed_at.not.is.null`);

    const token = uuid();
    const expiresAtMs = Date.now() + TOKEN_TTL_MS;

    const { error } = await supabase
      .from("telegram_link_tokens")
      .insert({
        token,
        user_id: userId,
        tenant_id: tenantId,
        expires_at: new Date(expiresAtMs).toISOString(),
      });

    if (error) {
      return errorResponse({ code: "token_create_failed", message: error.message, status: 500 });
    }

    const deepLink = `https://t.me/${BOT_USERNAME}?start=${token}`;
    return successResponse({
      token,
      deepLink,
      botUsername: BOT_USERNAME,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlSeconds: Math.floor(TOKEN_TTL_MS / 1000),
      instructions:
        "1. Abre el link · te lleva al bot en Telegram\n" +
        "2. Pulsa 'Iniciar' (o /start)\n" +
        "3. Recibirás un mensaje de confirmación\n\n" +
        "Si Telegram no está instalado, te pedirá descargarlo.",
    });
  }
);
