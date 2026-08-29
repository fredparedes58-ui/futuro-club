-- =====================================================================
-- 060: Reconciliar `videos` con las columnas que usa el pipeline de vídeo
-- =====================================================================
-- CONTEXTO: el código (create-upload / finalize / webhook bunny-uploaded /
-- pipeline Gemini) lee y escribe columnas que EXISTEN en el Supabase de
-- producción (se añadieron a mano en su día) pero NO están en ninguna
-- migración → un entorno de cliente NUEVO daría 500 al subir un vídeo.
-- Esta migración las declara de forma IDEMPOTENTE (IF NOT EXISTS) → es un
-- no-op en el prod actual y deja los entornos nuevos a la par.
-- SEGURA: solo agrega columnas/índice y relaja un NOT NULL; no borra nada.
-- =====================================================================

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS bunny_video_id text,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS target_player_bbox jsonb,
  ADD COLUMN IF NOT EXISTS duration_sec numeric;

-- El webhook busca la fila por bunny_video_id (bunny-uploaded.ts) → índice.
-- Parcial (solo filas con guid) para no indexar los vídeos locales sin Bunny.
CREATE INDEX IF NOT EXISTS idx_videos_bunny_video_id
  ON public.videos(bunny_video_id)
  WHERE bunny_video_id IS NOT NULL;

-- create-upload / finalize / video-init insertan la fila SIN el blob `data`
-- (que 000_full_schema declaró NOT NULL). En prod ya está relajado —esto
-- reconcilia la paridad para entornos nuevos—. Los writes server-side dan un
-- stub `data` igualmente (belt-and-suspenders).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos'
      AND column_name = 'data' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.videos ALTER COLUMN data DROP NOT NULL;
  END IF;
END $$;

-- NOTA (follow-up, requiere verificar prod): un UNIQUE parcial en
-- analyses(video_id) WHERE status IN ('queued','processing','completed')
-- endurecería la idempotencia del encolado (webhook + finalize) y respaldaría
-- el onConflict:"video_id" de analyzeWithClientData. NO se aplica aquí para no
-- arriesgar datos existentes (puede haber múltiples analyses legítimos por
-- vídeo en prod); comprobar antes con:
--   select video_id, count(*) from public.analyses
--   where status in ('queued','processing','completed')
--   group by video_id having count(*) > 1;
