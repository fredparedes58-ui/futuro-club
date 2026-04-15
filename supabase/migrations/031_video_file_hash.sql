-- =====================================================================
-- 031: Deduplicación de videos — columna file_hash
-- SEGURO: Solo agrega columna NULLABLE. No modifica ni elimina nada.
-- Backward compatible: registros existentes sin hash siguen funcionando.
-- =====================================================================

-- ── Agregar columna nullable ─────────────────────────────────────────
-- SHA-256 en hex = 64 chars. Nullable para backward compat.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS file_hash text;

-- ── Índice para lookup rápido por (user_id, file_hash) ────────────────
-- Parcial: solo indexa rows con hash presente (ignora legacy sin hash).
CREATE INDEX IF NOT EXISTS idx_videos_user_file_hash
  ON public.videos(user_id, file_hash)
  WHERE file_hash IS NOT NULL;

-- ── Backfill opcional desde jsonb `data.fileHash` (por si el cliente
--    ya había empezado a guardarlo como payload). Solo migra donde esté vacío.
UPDATE public.videos
SET file_hash = data->>'fileHash'
WHERE file_hash IS NULL
  AND data ? 'fileHash'
  AND (data->>'fileHash') IS NOT NULL
  AND length(data->>'fileHash') = 64;

-- ── Actualizar trigger de sync para incluir file_hash ─────────────────
-- Mantiene la lógica de 025 + añade file_hash. Si la columna no existía
-- en el payload, NEW.file_hash queda como estuviera (NULL por default).
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
    NEW.file_hash       := COALESCE(NEW.file_hash, NEW.data->>'fileHash');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger ya existe desde 025; no hace falta recrearlo.

COMMENT ON COLUMN public.videos.file_hash IS
  'SHA-256 hex del archivo original. Usado para deduplicación. NULL = legacy/no calculado.';
