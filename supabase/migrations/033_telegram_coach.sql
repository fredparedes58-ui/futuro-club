-- =====================================================================
-- 033 · Telegram Coach Copilot (Sprint B5)
-- =====================================================================
-- Tablas para conectar el bot Telegram con usuarios autenticados de VITAS.
--
-- Flow:
--   1. Coach logged-in en web → POST /api/telegram/connect
--   2. Endpoint inserta fila en `telegram_link_tokens` (UUID + 10 min TTL)
--   3. Devuelve URL https://t.me/VitasCopilotBot?start=<token>
--   4. Coach abre link en Telegram → /start <token>
--   5. Webhook resuelve token → INSERT en `coach_telegram_mapping`
--      vinculando telegram_chat_id al user_id
--   6. Token consumido (single-use), bot saluda
--
-- RLS: aislada por user_id · service role bypass para el bot.
-- =====================================================================

-- ── Mapping persistente coach ↔ telegram chat ────────────────────
CREATE TABLE IF NOT EXISTS public.coach_telegram_mapping (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id         uuid,                                            -- snapshot al linkear
  telegram_chat_id  bigint      NOT NULL UNIQUE,                     -- 1 chat ↔ 1 user
  telegram_username text,                                            -- @username opcional
  telegram_first_name text,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  last_active_at    timestamptz,
  conversation_count integer    DEFAULT 0,
  unlinked_at       timestamptz,                                     -- soft delete cuando user revoca
  notes             text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_telegram_user
  ON public.coach_telegram_mapping(user_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_telegram_chat ON public.coach_telegram_mapping(telegram_chat_id);

-- ── Tokens efímeros para onboarding ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token         text        PRIMARY KEY,                              -- UUID v4 generado en endpoint
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz                                            -- single-use · NULL = pendiente
);

CREATE INDEX IF NOT EXISTS idx_tg_tokens_user    ON public.telegram_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tg_tokens_expires ON public.telegram_link_tokens(expires_at)
  WHERE consumed_at IS NULL;

-- ── Historial conversacional (memoria corta del bot) ─────────────
-- Solo guardamos los últimos N mensajes por usuario para context window.
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id bigint     NOT NULL,
  role            text        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text        NOT NULL,
  tool_used       text,                                                -- ej. 'get_player'
  tokens_in       integer,
  tokens_out      integer,
  cost_eur        numeric(10, 6),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_msgs_chat_time
  ON public.telegram_messages(telegram_chat_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.coach_telegram_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own telegram mapping" ON public.coach_telegram_mapping;
CREATE POLICY "Users own telegram mapping" ON public.coach_telegram_mapping
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role telegram mapping" ON public.coach_telegram_mapping;
CREATE POLICY "Service role telegram mapping" ON public.coach_telegram_mapping
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users own telegram tokens" ON public.telegram_link_tokens;
CREATE POLICY "Users own telegram tokens" ON public.telegram_link_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role telegram tokens" ON public.telegram_link_tokens;
CREATE POLICY "Service role telegram tokens" ON public.telegram_link_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users own telegram messages" ON public.telegram_messages;
CREATE POLICY "Users own telegram messages" ON public.telegram_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role telegram messages" ON public.telegram_messages;
CREATE POLICY "Service role telegram messages" ON public.telegram_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.coach_telegram_mapping IS 'Vincula usuarios VITAS con su chat Telegram. 1:1 mientras unlinked_at IS NULL.';
COMMENT ON TABLE public.telegram_link_tokens   IS 'Tokens efímeros para onboarding · single-use · 10 min TTL.';
COMMENT ON TABLE public.telegram_messages      IS 'Historial conversacional del bot. Cap N=50 por usuario en cliente para context window.';
