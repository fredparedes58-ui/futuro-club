-- 068 · Referencia del jugador en el vídeo: dorsal + color de equipación
--
-- La observación Gemini por jugador (api/agents/video-observation.ts, analysisScope
-- "player") solo puede dar al jugador por IDENTIFICADO si recibe un dorsal Y un color
-- de equipación de referencia. Hasta ahora el pipeline asíncrono (finalize → cron →
-- gemini-analyze) nunca los recibía → en un clip con varios jugadores el sistema se
-- abstenía siempre (correcto, pero inútil). El usuario los teclea por análisis; finalize
-- los valida (src/lib/shared/playerReference.ts) y los guarda:
--   · en `analyses` → los leen gemini-analyze y el fallback inline del cron para
--                     construir el contexto que se envía a Gemini;
--   · en `videos`   → los lee el webhook de Bunny (servidor-a-servidor, sin usuario)
--                     cuando es él quien encola el análisis del jugador ligado al vídeo.
--                     finalize los escribe ANTES de esperar a que Bunny termine de
--                     codificar (mismo patrón que `videos.locale`, mig 064): si no, el
--                     webhook ganaría la carrera y encolaría sin referencia.
--
-- Frontera legal (.claude/rules/identidad.md): la identidad de un menor se establece
-- SOLO por dorsal y color de equipación, NUNCA por la cara ni rasgos físicos. Estas
-- columnas son lo único que se guarda para identificarle.
--
-- Nullable a propósito: sin referencia (filas antiguas, campo vacío) = null, nunca un
-- valor por defecto. El código escribe/lee estas columnas de forma DEFENSIVA (reintenta
-- sin ellas / degrada si aún no existen), así que desplegar antes de aplicar esta
-- migración no rompe el encolado: solo mantiene la abstención actual.

alter table public.analyses
  add column if not exists jersey_number text
    check (jersey_number is null or jersey_number ~ '^[0-9]{1,3}$');
alter table public.analyses
  add column if not exists kit_color text
    check (kit_color is null or char_length(kit_color) between 1 and 30);

alter table public.videos
  add column if not exists jersey_number text
    check (jersey_number is null or jersey_number ~ '^[0-9]{1,3}$');
alter table public.videos
  add column if not exists kit_color text
    check (kit_color is null or char_length(kit_color) between 1 and 30);

comment on column public.analyses.jersey_number is
  'Dorsal de referencia del jugador en ESTE análisis (1-3 dígitos), tecleado por el usuario. Identidad solo por dorsal + color de equipación, nunca por la cara. Null = sin referencia.';
comment on column public.analyses.kit_color is
  'Color de la equipación del jugador en ESTE análisis, tecleado por el usuario (texto corto). Identidad solo por dorsal + color de equipación, nunca por la cara. Null = sin referencia.';
comment on column public.videos.jersey_number is
  'Dorsal que tecleó el usuario para el jugador ligado al vídeo (videos.player_id); lo lee el webhook de Bunny al encolar. Solo dorsal + color, nunca la cara. Null = sin referencia.';
comment on column public.videos.kit_color is
  'Color de equipación que tecleó el usuario para el jugador ligado al vídeo (videos.player_id); lo lee el webhook de Bunny al encolar. Solo dorsal + color, nunca la cara. Null = sin referencia.';
