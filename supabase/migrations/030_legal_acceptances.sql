-- =====================================================================
-- 030: Legal Acceptances — Tracking de aceptación de términos/privacidad
-- GDPR compliance: registra versión, timestamp, IP de cada aceptación.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document    text NOT NULL,          -- "terms" | "privacy" | "parental_consent"
  version     text NOT NULL,          -- "2026-04-12" (fecha del documento)
  ip_address  text,                   -- IP al momento de aceptar
  user_agent  text,                   -- User-Agent del navegador
  accepted_at timestamptz DEFAULT now(),
  revoked_at  timestamptz             -- null = vigente, timestamp = revocado
);

-- Índice principal: buscar última aceptación del usuario por documento
CREATE INDEX IF NOT EXISTS idx_legal_user_doc
  ON public.legal_acceptances(user_id, document, accepted_at DESC);

-- Índice para auditoría: todas las aceptaciones de un documento
CREATE INDEX IF NOT EXISTS idx_legal_doc_version
  ON public.legal_acceptances(document, version);

-- RLS
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Usuarios leen sus propias aceptaciones
CREATE POLICY "users_read_own_acceptances" ON public.legal_acceptances
  FOR SELECT USING (user_id = auth.uid());

-- Service role puede insertar (desde API endpoint)
CREATE POLICY "service_role_full_legal" ON public.legal_acceptances
  FOR ALL USING (true) WITH CHECK (true);
