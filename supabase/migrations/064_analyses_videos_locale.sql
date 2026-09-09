-- 064 · Idioma del análisis (7 idiomas registry-driven, ver src/lib/shared/locale.ts)
--
-- El pipeline ASÍNCRONO de vídeo (finalize / webhook Bunny → cron → orquestador) no
-- tenía forma de conocer el idioma del usuario: el cron y el modal-callback solo
-- mandan { analysisId } y el orquestador caía a "es" → los 9 informes salían en
-- español para cualquier usuario no hispano, aunque la UI estuviera en su idioma.
--
-- Guardamos el idioma en el momento en que SÍ se conoce (finalize, con el usuario):
--   · en `videos`   → lo lee el webhook de Bunny (servidor-a-servidor, sin usuario)
--                     para encolar el análisis en el idioma correcto;
--   · en `analyses` → lo lee el orquestador cuando el body no trae locale.
--
-- Nullable a propósito: filas antiguas o sin idioma → el orquestador degrada a "es"
-- (comportamiento previo). El código escribe estas columnas de forma DEFENSIVA
-- (reintenta sin ellas si aún no existen), así que desplegar antes de aplicar esta
-- migración no rompe nada: solo mantiene el español hasta que se aplique.

alter table public.analyses add column if not exists locale text;
alter table public.videos   add column if not exists locale text;

comment on column public.analyses.locale is
  'Idioma pedido para los informes (código del LANGUAGE_REGISTRY: es, en, it, de, fr, nl, es-419). Null = default es.';
comment on column public.videos.locale is
  'Idioma de la UI del usuario al finalizar la subida; lo lee el webhook de Bunny para encolar el análisis en ese idioma.';
