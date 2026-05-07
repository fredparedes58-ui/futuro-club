/**
 * VITAS · Telegram Webhook (Sprint B5 · día 2-3)
 * POST /api/telegram/webhook
 *
 * Recibe los Update de Telegram, identifica al usuario por telegram_chat_id,
 * y responde usando Claude con tool use sobre la data del coach.
 *
 * Flujo:
 *   1. Telegram POST update {message: {chat: {id}, text}}
 *   2. Verificar secret_token header (configurado al setWebhook)
 *   3. Si /start <token> → vincular chat_id ↔ user_id
 *   4. Si /help, /jugadores, etc. → respuesta canned
 *   5. Si texto libre → Claude Haiku con tool use
 *      tools: get_player, list_players, get_latest_analysis,
 *             get_team_stats, get_drill_plan, get_benchmark
 *   6. Persistir mensaje en telegram_messages para context window
 *
 * Sin TELEGRAM_BOT_TOKEN configurado → endpoint devuelve 503 health
 * pero NO crashea (permite que Vercel lo deploye sin romper).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "vitas_copilot_bot";

// ─── Telegram API helpers ────────────────────────────────────────

async function sendMessage(chatId: number, text: string, opts: {
  parseMode?: "Markdown" | "HTML";
  replyMarkup?: Record<string, unknown>;
} = {}): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!BOT_TOKEN) {
    console.error("[telegram] BOT_TOKEN missing · cannot send");
    return { ok: false, status: 0, error: "no_bot_token" };
  }
  const useParseMode = opts.parseMode === "HTML" ? "HTML" : undefined;
  const cleanText = useParseMode
    ? text
    : text.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1");

  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: cleanText,
      reply_markup: opts.replyMarkup,
    };
    if (useParseMode) payload.parse_mode = useParseMode;

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] sendMessage failed ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telegram] sendMessage exception:", msg);
    return { ok: false, status: 0, error: msg };
  }
}

async function sendTyping(chatId: number): Promise<void> {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => null);
}

// ─── Tools para Claude ──────────────────────────────────────────

const TOOLS = [
  {
    name: "list_players",
    description: "Lista todos los jugadores del coach con sus stats principales (VSI, edad, posición, fase PHV). Usa cuando el coach pregunta '¿cómo va el equipo?', 'jugadores', 'mi plantilla'.",
    input_schema: {
      type: "object",
      properties: {
        sort_by: { type: "string", enum: ["vsi", "name", "age"], description: "Ordenar por (default vsi desc)" },
        limit: { type: "integer", default: 20 },
      },
    },
  },
  {
    name: "get_player",
    description: "Detalle de un jugador específico: VSI, métricas, PHV, fase, último análisis si existe. Usa cuando el coach menciona un nombre.",
    input_schema: {
      type: "object",
      required: ["name_query"],
      properties: {
        name_query: { type: "string", description: "Nombre o parcial del jugador (ej. 'Samu')" },
      },
    },
  },
  {
    name: "get_latest_match",
    description: "Resumen del último partido en directo registrado: score, MVP, eventos clave, stats por jugador.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_team_stats",
    description: "Stats agregadas del equipo: VSI promedio, distribución PHV, número de jugadores activos, talentos en P90.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_drill_recommendations",
    description: "Drills recomendados para entrenar una debilidad específica (ej. 'lectura defensiva', 'pase impreciso').",
    input_schema: {
      type: "object",
      required: ["weakness"],
      properties: {
        weakness: { type: "string", description: "Debilidad o área a trabajar" },
        player_age: { type: "integer", description: "Edad del jugador (afecta drill apropiado)" },
        phv_phase: { type: "string", enum: ["pre_phv", "in_phv", "post_phv"], description: "Fase PHV opcional" },
      },
    },
  },
  {
    name: "get_phv_advice",
    description: "Consejo específico para entrenar a un jugador según su fase PHV. Usa cuando se pregunta sobre cargas, riesgos, ventana neuromotora.",
    input_schema: {
      type: "object",
      required: ["name_query"],
      properties: {
        name_query: { type: "string" },
      },
    },
  },
] as const;

// ─── Tool implementations ────────────────────────────────────────

interface ToolContext {
  userId: string;
  tenantId: string;
  chatId: number;
}

type SupabaseClient = ReturnType<typeof createClient>;

async function execTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case "list_players": {
      const sortBy = (input.sort_by as string) ?? "vsi";
      const limit = Math.min(20, (input.limit as number) ?? 10);
      const { data } = await supabase
        .from("players")
        .select("id, name, age, position, vsi, phv_category")
        .eq("user_id", ctx.userId)
        .order(sortBy === "vsi" ? "vsi" : sortBy === "age" ? "age" : "name", { ascending: sortBy !== "vsi" })
        .limit(limit);

      if (!data || data.length === 0) return "Sin jugadores registrados.";
      return JSON.stringify(data, null, 2);
    }

    case "get_player": {
      const q = ((input.name_query as string) ?? "").toLowerCase().trim();
      const { data: matches } = await supabase
        .from("players")
        .select("id, name, age, position, foot, height_cm, weight_kg, vsi, vsi_history, phv_category, phv_offset, metric_speed, metric_technique, metric_vision, metric_stamina, metric_shooting, metric_defending")
        .eq("user_id", ctx.userId)
        .ilike("name", `%${q}%`)
        .limit(3);

      if (!matches || matches.length === 0) return `No encontré jugador con "${q}".`;
      if (matches.length === 1) {
        // Buscar último análisis del jugador
        const { data: lastAnalysis } = await supabase
          .from("analyses")
          .select("id, status, vsi, completed_at")
          .eq("player_id", matches[0].id)
          .in("status", ["completed", "completed_partial"])
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return JSON.stringify({ player: matches[0], lastAnalysis }, null, 2);
      }
      return `Múltiples coincidencias: ${matches.map((m: { name: string }) => m.name).join(", ")}. Especifica más.`;
    }

    case "get_latest_match": {
      const { data: match } = await supabase
        .from("live_matches")
        .select("id, team_name, opponent_name, status, started_at, ended_at, duration_seconds, score_home, score_away, analysis_result")
        .eq("user_id", ctx.userId)
        .eq("status", "finished")
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!match) return "Sin partidos finalizados aún. Usa /api/live/matches para empezar uno.";
      return JSON.stringify(match, null, 2);
    }

    case "get_team_stats": {
      const { data: players } = await supabase
        .from("players")
        .select("vsi, phv_category, age")
        .eq("user_id", ctx.userId);
      if (!players || players.length === 0) return "Sin jugadores.";

      const n = players.length;
      const avgVsi = players.reduce((a: number, p: { vsi?: number }) => a + Number(p.vsi || 0), 0) / n;
      const phvDist = {
        early: players.filter((p: { phv_category?: string }) => p.phv_category === "early").length,
        ontime: players.filter((p: { phv_category?: string }) => p.phv_category === "ontime" || p.phv_category === "ontme").length,
        late: players.filter((p: { phv_category?: string }) => p.phv_category === "late").length,
        unknown: players.filter((p: { phv_category?: string }) => !p.phv_category).length,
      };
      const elite = players.filter((p: { vsi?: number }) => Number(p.vsi || 0) >= 70).length;
      return JSON.stringify({
        teamSize: n,
        avgVsi: Number(avgVsi.toFixed(1)),
        phvDistribution: phvDist,
        eliteCount: elite,
      }, null, 2);
    }

    case "get_drill_recommendations": {
      const weakness = (input.weakness as string) ?? "";
      const phase = input.phv_phase as string | undefined;
      const lower = weakness.toLowerCase();
      // Lookup en knowledge base local · 6 áreas comunes
      const drills: Record<string, string[]> = {
        "lectura defensiva":   ["TAC-001 Posicionamiento táctico", "TAC-002 Pressing coordinado"],
        "pase":                ["TEC-002 Circuito de pases", "TAC-004 Posesión 5v5+2"],
        "primer toque":        ["TEC-001 Rondo 4v2", "TEC-005 Recepción bajo presión"],
        "regate":              ["TEC-003 Circuito 1v1", "POS-WG-001 Desborde y centro"],
        "velocidad":           ["FIS-001 Sprints con cambio dirección", "FIS-004 Velocidad de reacción"],
        "resistencia":         ["FIS-003 HIIT fútbol", "FIS-005 Fuerza preventiva"],
      };
      let recommended: string[] = [];
      for (const [key, val] of Object.entries(drills)) {
        if (lower.includes(key)) { recommended = val; break; }
      }
      if (recommended.length === 0) {
        recommended = ["TEC-001 Rondo 4v2 (versátil)", "TAC-001 Posicionamiento táctico"];
      }
      return JSON.stringify({ weakness, phase: phase ?? "no_indicada", drills: recommended });
    }

    case "get_phv_advice": {
      const q = ((input.name_query as string) ?? "").toLowerCase();
      const { data: p } = await supabase
        .from("players")
        .select("name, age, phv_category, phv_offset, height_cm, weight_kg")
        .eq("user_id", ctx.userId)
        .ilike("name", `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!p) return `No encontré jugador "${q}".`;
      const phase = p.phv_category;
      const advice = phase === "early"
        ? "PRE-PHV (pre-estirón). Ventana neuromotora abierta. Carga: bajo volumen + alta variabilidad técnica. EVITAR gym pesado. Foco: coordinación y técnica."
        : phase === "late"
        ? "POST-PHV (post-estirón). Ventana de fuerza. Incorporar gym progresivo + HIIT con balón. Buen momento para potencia."
        : phase === "ontime" || phase === "ontme"
        ? "EN PHV (estirón). Período sensible. BAJAR intensidad cognitiva, gestionar cargas para evitar Osgood-Schlatter. Mantener técnica básica."
        : "Sin PHV calculado. Registra antropometría primero.";
      return JSON.stringify({ name: p.name, age: p.age, phv: phase, advice }, null, 2);
    }

    default:
      return `Tool ${toolName} no implementado.`;
  }
}

// ─── Claude con tool use ────────────────────────────────────────

const SYSTEM_PROMPT = `Eres VITAS Copilot, asistente conversacional para coaches de fútbol juvenil
en Telegram. Hablas en español natural y conciso (máximo 4-5 líneas por respuesta).

CONTEXTO: el coach te pregunta sobre sus jugadores y equipo. Tienes herramientas
para consultar la base de datos (list_players, get_player, get_latest_match,
get_team_stats, get_drill_recommendations, get_phv_advice).

ESTILO:
- Lenguaje claro · sin jerga excesiva
- Emojis con moderación (1-2 por respuesta · 🏆 ⚽ 📈 ⚠️ 🌱)
- Markdown ligero: *negrita* _cursiva_
- Datos concretos · números siempre que puedas
- Si necesitas datos, USA HERRAMIENTAS · no inventes

LIMITACIONES:
- No puedes crear/modificar/borrar nada · solo leer y aconsejar
- Si el coach pide acciones (iniciar partido, generar reporte), dile que las
  haga desde la app web/PWA · no las hagas tú
- Si la pregunta no tiene sentido o falta contexto, pide clarificación

Saluda solo cuando el coach inicia conversación con /start o "hola".`;

async function callClaudeWithTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ctx: ToolContext,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ text: string; toolsUsed: string[]; tokensIn: number; tokensOut: number }> {
  if (!ANTHROPIC_API_KEY) {
    return { text: "_(Bot no configurado · falta ANTHROPIC_API_KEY)_", toolsUsed: [], tokensIn: 0, tokensOut: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const toolsUsed: string[] = [];
  let totalIn = 0, totalOut = 0;

  // Loop hasta 3 iteraciones de tool use
  for (let i = 0; i < 3; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      }),
    });
    if (!res.ok) {
      return { text: `_(Error Claude ${res.status})_`, toolsUsed, tokensIn: totalIn, tokensOut: totalOut };
    }
    const data = await res.json();
    totalIn += data.usage?.input_tokens ?? 0;
    totalOut += data.usage?.output_tokens ?? 0;

    const content = data.content as Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    const textBlocks = content.filter((b) => b.type === "text").map((b) => b.text).filter(Boolean) as string[];
    const toolUses = content.filter((b) => b.type === "tool_use");

    if (toolUses.length === 0) {
      // No más tools · respuesta final
      return { text: textBlocks.join("\n\n").trim() || "_(sin respuesta)_", toolsUsed, tokensIn: totalIn, tokensOut: totalOut };
    }

    // Ejecutar tools y preparar respuesta
    messages.push({ role: "assistant", content });
    const toolResults = [];
    for (const tu of toolUses) {
      const result = await execTool(supabase, ctx, tu.name!, tu.input ?? {});
      toolsUsed.push(tu.name!);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { text: "_(Demasiados pasos · simplifica la pregunta)_", toolsUsed, tokensIn: totalIn, tokensOut: totalOut };
}

// ─── Webhook handler ────────────────────────────────────────────

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

export default withHandler(
  { method: "POST", maxRequests: 600 },         // sin auth · webhook público
  async ({ req, body }) => {
    if (!BOT_TOKEN) {
      return errorResponse({ code: "bot_not_configured", message: "TELEGRAM_BOT_TOKEN missing", status: 503 });
    }

    // Verificar secret_token (Telegram lo pasa en header si lo setteamos)
    if (WEBHOOK_SECRET) {
      const got = req.headers.get("x-telegram-bot-api-secret-token");
      if (got !== WEBHOOK_SECRET) {
        return errorResponse({ code: "unauthorized_webhook", message: "Bad secret", status: 401 });
      }
    }

    const debugSteps: string[] = [];
    const log = (step: string, extra: Record<string, unknown> = {}) => {
      const entry = `${step}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`;
      debugSteps.push(entry);
      console.log(JSON.stringify({ level: "debug", msg: `[tg] ${step}`, ...extra }));
    };

    log("webhook_hit", {
      hasBotToken: !!BOT_TOKEN,
      botTokenLen: BOT_TOKEN.length,
      hasAnthropicKey: !!ANTHROPIC_API_KEY,
      hasSecret: !!WEBHOOK_SECRET,
      botUsername: BOT_USERNAME,
    });

    // Debug mode: si chatId es 0, devuelve los pasos en la response
    const isDebug = req.headers.get("x-vitas-debug") === "1";

    // withHandler ya consumió el body via req.text() · usar ctx.body, no req.json()
    const update = (body ?? null) as TelegramUpdate | null;
    log("parsed", { hasMsg: !!update?.message, hasText: !!update?.message?.text });
    if (!update?.message?.text || !update.message.chat?.id) {
      return successResponse({ ok: true });           // ignorar updates sin texto
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const tgUsername = update.message.from?.username;
    const tgFirstName = update.message.from?.first_name;
    log("got_message", { chatId, text: text.slice(0, 40), tgFirstName });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── /start con token · vincular ───────────────────────────
    if (text.startsWith("/start ")) {
      const token = text.slice(7).trim();
      const { data: linkRow } = await supabase
        .from("telegram_link_tokens")
        .select("user_id, tenant_id, expires_at, consumed_at")
        .eq("token", token)
        .maybeSingle();

      if (!linkRow || linkRow.consumed_at || new Date(linkRow.expires_at) < new Date()) {
        await sendMessage(chatId,
          "❌ *Link inválido o expirado*\n\nVuelve a la web VITAS → Ajustes → Conectar Telegram para generar uno nuevo (válido 10 min).");
        return successResponse({ ok: true });
      }

      // Crear mapping (upsert por chat_id)
      const { error: mErr } = await supabase
        .from("coach_telegram_mapping")
        .upsert({
          user_id: linkRow.user_id,
          tenant_id: linkRow.tenant_id,
          telegram_chat_id: chatId,
          telegram_username: tgUsername,
          telegram_first_name: tgFirstName,
          linked_at: new Date().toISOString(),
          unlinked_at: null,
        }, { onConflict: "telegram_chat_id" });

      if (mErr) {
        await sendMessage(chatId, `❌ Error vinculando: ${mErr.message}`);
        return successResponse({ ok: true });
      }

      // Consumir token
      await supabase
        .from("telegram_link_tokens")
        .update({ consumed_at: new Date().toISOString() })
        .eq("token", token);

      await sendMessage(chatId,
        `✅ *Vinculado correctamente*\n\nHola ${tgFirstName ?? "coach"} 👋\n\nSoy *VITAS Copilot*. Pregúntame sobre tus jugadores y equipo:\n\n• "¿cómo va el equipo?"\n• "Samu"\n• "drills para lectura defensiva"\n• "fase PHV de Marcos"\n\n/help para ver más comandos.`);
      return successResponse({ ok: true });
    }

    // ── Identificar usuario por chat_id ──────────────────────
    log("checking_mapping", { chatId });
    const { data: mapping, error: mappingErr } = await supabase
      .from("coach_telegram_mapping")
      .select("user_id, tenant_id")
      .eq("telegram_chat_id", chatId)
      .is("unlinked_at", null)
      .maybeSingle();
    log("mapping_check_done", { hasMapping: !!mapping, err: mappingErr?.message });

    if (!mapping) {
      log("no_mapping_sending_welcome", { chatId });
      const r = await sendMessage(chatId,
        "👋 No estás vinculado a una cuenta VITAS.\n\nVe a la web → Ajustes → Conectar Telegram y abre el link que te genere.\n\n(Si lo hiciste y no funciona, vuelve a generar el token · expira a los 10 min)");
      log("welcome_sent", { chatId, ok: r.ok, status: r.status, err: r.error });
      return successResponse(isDebug ? { ok: true, debug: debugSteps } : { ok: true });
    }

    // ── Comandos canned ──────────────────────────────────────
    if (text === "/start") {
      await sendMessage(chatId,
        `Hola 👋 Ya estabas vinculado.\n\nPregúntame lo que quieras: "¿cómo va el equipo?", un nombre de jugador, drills, fases PHV…\n\n/help para más.`);
      return successResponse({ ok: true });
    }

    if (text === "/help") {
      await sendMessage(chatId,
        `*Comandos*\n\n/jugadores · listado top VSI\n/equipo · stats agregadas\n/ultimo · resumen último partido\n/help · este mensaje\n/desvincular · cerrar conexión\n\n*O escribe en lenguaje natural*:\n• "¿cómo va Samu?"\n• "drills para pase"\n• "fase PHV de Marcos"\n• "¿qué entreno hoy?"`);
      return successResponse({ ok: true });
    }

    if (text === "/desvincular") {
      await supabase
        .from("coach_telegram_mapping")
        .update({ unlinked_at: new Date().toISOString() })
        .eq("telegram_chat_id", chatId);
      await sendMessage(chatId, "🔓 Desvinculado. Tus mensajes se borran. Hasta otra coach 👋");
      return successResponse({ ok: true });
    }

    // ── Pregunta libre · Claude con tool use ─────────────────
    await sendTyping(chatId);

    // Cargar historial reciente (últimos 8 turnos)
    const { data: historyRows } = await supabase
      .from("telegram_messages")
      .select("role, content")
      .eq("telegram_chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(8);

    const history = (historyRows ?? []).reverse() as Array<{ role: "user" | "assistant"; content: string }>;

    // Persistir mensaje del user
    await supabase.from("telegram_messages").insert({
      user_id: mapping.user_id,
      telegram_chat_id: chatId,
      role: "user",
      content: text,
    });

    const result = await callClaudeWithTools(
      supabase,
      { userId: mapping.user_id, tenantId: mapping.tenant_id ?? mapping.user_id, chatId },
      text,
      history,
    );

    // Persistir respuesta + métricas
    const costEur = (result.tokensIn / 1_000_000) * 0.8 + (result.tokensOut / 1_000_000) * 4; // Haiku 4.5 pricing aprox
    await supabase.from("telegram_messages").insert({
      user_id: mapping.user_id,
      telegram_chat_id: chatId,
      role: "assistant",
      content: result.text,
      tool_used: result.toolsUsed[0] ?? null,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_eur: costEur,
    });

    // Update last_active + counter
    await supabase
      .from("coach_telegram_mapping")
      .update({
        last_active_at: new Date().toISOString(),
        conversation_count: (await supabase
          .from("coach_telegram_mapping")
          .select("conversation_count")
          .eq("telegram_chat_id", chatId)
          .single()).data?.conversation_count + 1 || 1,
      })
      .eq("telegram_chat_id", chatId);

    await sendMessage(chatId, result.text);
    return successResponse({ ok: true });
  }
);
