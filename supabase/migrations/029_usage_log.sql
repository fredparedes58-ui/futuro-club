-- =====================================================================
-- 029: Usage Log — Registro granular de cada llamada AI
-- Permite analytics de consumo por endpoint, usuario, y mes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.usage_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,          -- e.g. "scout-insight", "video-intelligence"
  month       text NOT NULL,          -- "YYYY-MM"
  org_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

-- Índices para queries de analytics
CREATE INDEX IF NOT EXISTS idx_usage_log_user_month ON public.usage_log(user_id, month);
CREATE INDEX IF NOT EXISTS idx_usage_log_endpoint ON public.usage_log(endpoint);
CREATE INDEX IF NOT EXISTS idx_usage_log_org ON public.usage_log(org_id);

-- RLS
ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_usage" ON public.usage_log
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_role_full_access_usage" ON public.usage_log
  FOR ALL USING (true) WITH CHECK (true);
