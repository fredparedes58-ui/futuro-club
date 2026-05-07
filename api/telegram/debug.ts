/**
 * VITAS · Telegram Debug endpoint (TEMPORAL · borrar tras debug)
 * GET /api/telegram/debug?chatId=<id>
 *
 * Hace sendMessage al chatId proporcionado y devuelve el resultado en JSON
 * para diagnosticar problemas con la API de Telegram sin esperar logs.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

export default withHandler(
  { method: "GET", maxRequests: 30 },
  async ({ query }) => {
    const chatIdStr = query.chatId ?? "999999";
    const chatId = parseInt(chatIdStr, 10);

    const result: Record<string, unknown> = {
      hasBotToken: !!BOT_TOKEN,
      botTokenLen: BOT_TOKEN.length,
      chatId,
    };

    if (!BOT_TOKEN) {
      return successResponse({ ...result, error: "no_bot_token" });
    }

    try {
      const t0 = Date.now();
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Test ping desde VITAS debug endpoint",
        }),
      });
      const elapsed = Date.now() - t0;
      const body = await res.text().catch(() => "");

      return successResponse({
        ...result,
        sendMessage: {
          status: res.status,
          ok: res.ok,
          elapsedMs: elapsed,
          body: body.slice(0, 500),
        },
      });
    } catch (err) {
      return successResponse({
        ...result,
        sendMessage: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },
);
