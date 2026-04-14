-- =====================================================================
-- 025: Normalizar tabla videos — extraer campos del jsonb `data`
-- SEGURO: Solo agrega columnas nuevas. No modifica ni elimina nada.
-- La columna `data` jsonb permanece intacta como backup.
-- =====================================================================

-- ── Agregar columnas relacionales ─────────────────────────────────────
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS status_code int DEFAULT -1,
  ADD COLUMN IF NOT EXISTS encode_progress int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vid_width int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vid_height int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fps numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_size bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS embed_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS stream_url text,
  ADD COLUMN IF NOT EXISTS local_path text,
  ADD COLUMN IF NOT EXISTS date_uploaded timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_result jsonb;

-- ── Backfill desde jsonb existente ────────────────────────────────────
UPDATE public.videos SET
  title           = data->>'title',
  status          = COALESCE(data->>'status', 'unknown'),
  status_code     = COALESCE((data->>'statusCode')::int, -1),
  encode_progress = COALESCE((data->>'encodeProgress')::int, 0),
  duration        = COALESCE((data->>'duration')::numeric, 0),
  vid_width       = COALESCE((data->>'width')::int, 0),
  vid_height      = COALESCE((data->>'height')::int, 0),
  fps             = COALESCE((data->>'fps')::numeric, 0),
  storage_size    = COALESCE((data->>'storageSize')::bigint, 0),
  thumbnail_url   = data->>'thumbnailUrl',
  embed_url       = COALESCE(data->>'embedUrl', ''),
  stream_url      = data->>'streamUrl',
  local_path      = data->>'localPath',
  date_uploaded   = (data->>'dateUploaded')::timestamptz,
  analysis_result = data->'analysisResult'
WHERE title IS NULL;  -- solo filas no migradas aún

-- ── Indexes en columnas relacionales ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_title ON public.videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_date_uploaded ON public.videos(date_uploaded DESC);

-- ── Trigger: auto-sync columnas desde jsonb en INSERT/UPDATE ──────────
CREATE OR REPLACE FUNCTION sync_video_columns_from_jsonb()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data IS NOT NULL THEN
    NEW.title           := COALESCE(NEW.title, NEW.data->>'title');
    NEW.status          := COALESCE(NEW.status, NEW.data->>'status', 'unknown');
    NEW.status_code     := COALESCE(NEW.status_code, (NEW.data->>'statusCode')::int, -1);
    NEW.encode_progress := COALESCE(NEW.encode_progress, (NEW.data->>'encodeProgress')::int, 0);
    NEW.duration        := COALESCE(NEW.duration, (NEW.data->>'duration')::numeric, 0);
    NEW.vid_width       := COALESCE(NEW.vid_width, (NEW.data->>'width')::int, 0);
    NEW.vid_height      := COALESCE(NEW.vid_height, (NEW.data->>'height')::int, 0);
    NEW.fps             := COALESCE(NEW.fps, (NEW.data->>'fps')::numeric, 0);
    NEW.storage_size    := COALESCE(NEW.storage_size, (NEW.data->>'storageSize')::bigint, 0);
    NEW.thumbnail_url   := COALESCE(NEW.thumbnail_url, NEW.data->>'thumbnailUrl');
    NEW.embed_url       := COALESCE(NEW.embed_url, NEW.data->>'embedUrl', '');
    NEW.stream_url      := COALESCE(NEW.stream_url, NEW.data->>'streamUrl');
    NEW.local_path      := COALESCE(NEW.local_path, NEW.data->>'localPath');
    NEW.date_uploaded   := COALESCE(NEW.date_uploaded, (NEW.data->>'dateUploaded')::timestamptz);
    NEW.analysis_result := COALESCE(NEW.analysis_result, NEW.data->'analysisResult');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_columns ON public.videos;
CREATE TRIGGER trg_sync_video_columns
  BEFORE INSERT OR UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION sync_video_columns_from_jsonb();
