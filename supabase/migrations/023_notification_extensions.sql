-- ─────────────────────────────────────────────────────────────
-- 023 · Notification Extensions
-- Adds scout_insights and team_updates preferences.
-- Adds notification_history table for in-app history.
-- ─────────────────────────────────────────────────────────────

-- Extend preferences with new notification types
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS scout_insights BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS team_updates   BOOLEAN NOT NULL DEFAULT true;

-- In-app notification history (separate from push delivery log)
CREATE TABLE IF NOT EXISTS public.notification_history (
  id          bigserial   primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text,
  player_id   text,
  read        boolean     not null default false,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_notif_history_user
  ON public.notification_history(user_id, created_at DESC);

ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification history"
  ON public.notification_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access notification history"
  ON public.notification_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);
