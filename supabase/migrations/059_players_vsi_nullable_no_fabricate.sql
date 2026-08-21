-- =====================================================================
-- 059 · players.vsi: dejar de fabricar un VSI de ficha (0) para jugadores
--        SIN evaluación real
-- =====================================================================
-- Invariante #2 (CLAUDE.md): ante dato ausente se BLOQUEA, nunca se estima.
-- El VSI de FICHA es la evaluación del entrenador (las 6 barras). Un alta rápida
-- (onboarding/wizard) NO evalúa ⇒ el jugador nace sin métricas y su VSI de ficha
-- es NULL ("sin evaluar"). Un 0 en su lugar es un número inventado — y peor que
-- inventado: se ordena/promedia como si fuera una evaluación real.
--
-- Dos puntos de la capa de BD seguían coaccionando ese hueco a 0, igual que el
-- assume-male que corrigió la 058 para `gender`:
--   1) El TRIGGER sync_player_columns_from_jsonb() (024/058, línea vsi):
--        NEW.vsi := COALESCE(NEW.vsi, (NEW.data->>'vsi')::numeric, 0);
--      → un INSERT con vsi NULL (blob sin vsi) se revierte a 0.
--   2) El DEFAULT 0 de la COLUMNA players.vsi (024) → un INSERT que omita la
--      columna cae a 0.
--   3) La RPC get_ranked_players (021): coalesce((data->>'vsi')::numeric, 0)
--      → devolvía 0 y lo metía en percentiles y en avg del grupo de edad.
--
-- Esta migración: quita el fallback 0 del trigger, elimina el DEFAULT 0 de la
-- columna, re-nulea las filas legacy sin evaluación (vsi=0 y blob sin métricas)
-- y recrea la RPC para que el VSI ausente sea NULL — excluido de percentiles y
-- de la media (avg() ya ignora NULL); el conteo del grupo sí cuenta al jugador.
--
-- Idempotente. NO toca las fórmulas del VSI ni PHV/bio-banding (invariante #4).
-- =====================================================================

BEGIN;

-- 1) Trigger sin el fallback 0 en vsi (resto de columnas intactas) ─────────
CREATE OR REPLACE FUNCTION sync_player_columns_from_jsonb()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data IS NOT NULL THEN
    NEW.name              := COALESCE(NEW.name, NEW.data->>'name');
    NEW.age               := COALESCE(NEW.age, (NEW.data->>'age')::int);
    NEW.position          := COALESCE(NEW.position, NEW.data->>'position');
    NEW.foot              := COALESCE(NEW.foot, NEW.data->>'foot');
    NEW.height_cm         := COALESCE(NEW.height_cm, (NEW.data->>'height')::numeric);
    NEW.weight_kg         := COALESCE(NEW.weight_kg, (NEW.data->>'weight')::numeric);
    NEW.sitting_height    := COALESCE(NEW.sitting_height, (NEW.data->>'sittingHeight')::numeric);
    NEW.leg_length        := COALESCE(NEW.leg_length, (NEW.data->>'legLength')::numeric);
    NEW.competitive_level := COALESCE(NEW.competitive_level, NEW.data->>'competitiveLevel', 'Regional');
    NEW.minutes_played    := COALESCE(NEW.minutes_played, (NEW.data->>'minutesPlayed')::int, 0);
    -- invariante #5: sin fallback 'M' (058)
    NEW.gender            := COALESCE(NEW.gender, NEW.data->>'gender');
    NEW.metric_speed      := COALESCE(NEW.metric_speed, (NEW.data->'metrics'->>'speed')::numeric, 0);
    NEW.metric_technique  := COALESCE(NEW.metric_technique, (NEW.data->'metrics'->>'technique')::numeric, 0);
    NEW.metric_vision     := COALESCE(NEW.metric_vision, (NEW.data->'metrics'->>'vision')::numeric, 0);
    NEW.metric_stamina    := COALESCE(NEW.metric_stamina, (NEW.data->'metrics'->>'stamina')::numeric, 0);
    NEW.metric_shooting   := COALESCE(NEW.metric_shooting, (NEW.data->'metrics'->>'shooting')::numeric, 0);
    NEW.metric_defending  := COALESCE(NEW.metric_defending, (NEW.data->'metrics'->>'defending')::numeric, 0);
    -- invariante #2: sin fallback 0. VSI de ficha ausente ⇒ NULL ("sin evaluar").
    NEW.vsi               := COALESCE(NEW.vsi, (NEW.data->>'vsi')::numeric);
    NEW.phv_category      := COALESCE(NEW.phv_category, NEW.data->>'phvCategory');
    NEW.phv_offset        := COALESCE(NEW.phv_offset, (NEW.data->>'phvOffset')::numeric);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_player_columns_from_jsonb() IS
  'Sincroniza columnas planas desde el blob data en INSERT/UPDATE. gender SIN '
  'fallback ''M'' (invariante #5) y vsi SIN fallback 0 (invariante #2: VSI de '
  'ficha ausente ⇒ NULL, no un 0 fabricado).';

-- 2) Quitar el DEFAULT 0 de la columna vsi (un INSERT que la omita ⇒ NULL) ──
ALTER TABLE public.players ALTER COLUMN vsi DROP DEFAULT;

-- 3) Re-nulear las filas legacy SIN evaluación: vsi=0 y el blob no tiene
--    métricas (no se evaluó nunca). No toca a quien sí tiene métricas.
UPDATE public.players
SET vsi = NULL
WHERE vsi = 0
  AND (data->'metrics') IS NULL;

-- 4) Recrear la RPC: VSI ausente = NULL, excluido de percentiles y de la media.
CREATE OR REPLACE FUNCTION get_ranked_players(
  p_user_id uuid,
  p_sort_by text default 'vsi',
  p_sort_dir text default 'desc',
  p_limit int default 50,
  p_offset int default 0,
  p_search text default null,
  p_phv text default null,
  p_position text default null,
  p_age_group text default null,
  p_level text default null
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  with base as (
    select
      id,
      data,
      updated_at,
      (data->>'name')::text as name,
      (data->>'age')::int as age,
      (data->>'position')::text as position,
      -- invariante #2: sin coalesce a 0. Ausente ⇒ NULL ("sin evaluar").
      (data->>'vsi')::numeric as vsi,
      coalesce((data->>'phvCategory')::text, 'ontme') as phv_category,
      coalesce((data->>'competitiveLevel')::text, 'Regional') as competitive_level,
      case
        when (data->>'age')::int between 8 and 10 then 'Sub-10'
        when (data->>'age')::int between 11 and 12 then 'Sub-12'
        when (data->>'age')::int between 13 and 14 then 'Sub-14'
        when (data->>'age')::int between 15 and 16 then 'Sub-16'
        when (data->>'age')::int between 17 and 18 then 'Sub-18'
        else 'Sub-21'
      end as age_group
    from players
    where user_id = p_user_id
  ),
  -- Percentiles SOLO entre jugadores evaluados (vsi not null). Un hueco no
  -- compite: no infla ni desinfla el percentil de un número real.
  ranked as (
    select
      id,
      percent_rank() over (order by vsi) * 100 as percentile,
      percent_rank() over (partition by age_group order by vsi) * 100 as percentile_in_age_group
    from base
    where vsi is not null
  ),
  with_percentiles as (
    select b.*, r.percentile, r.percentile_in_age_group
    from base b
    left join ranked r using (id)
  ),
  filtered as (
    select * from with_percentiles
    where
      (p_search is null or lower(name) like '%' || lower(p_search) || '%')
      and (p_phv is null or p_phv = 'all' or
           case when phv_category = 'ontme' then 'on-time' else phv_category end = p_phv)
      and (p_position is null or p_position = 'Todos' or position = p_position)
      and (p_age_group is null or p_age_group = 'all' or age_group = p_age_group)
      and (p_level is null or p_level = 'all' or lower(competitive_level) = lower(p_level))
  ),
  -- Stats por grupo de edad: avg/min/max ignoran NULL automáticamente; el
  -- conteo sí incluye al jugador sin evaluar (es un jugador del grupo).
  age_stats as (
    select
      age_group,
      count(*) as cnt,
      round(avg(vsi)::numeric, 1) as avg_vsi,
      min(vsi) as min_vsi,
      max(vsi) as max_vsi
    from with_percentiles
    group by age_group
  ),
  total_count as (
    select count(*) as total from filtered
  ),
  total_unfiltered as (
    select count(*) as total from with_percentiles
  ),
  sorted as (
    select * from filtered
    order by
      case when p_sort_by = 'vsi' and p_sort_dir = 'desc' then vsi end desc nulls last,
      case when p_sort_by = 'vsi' and p_sort_dir = 'asc' then vsi end asc nulls last,
      case when p_sort_by = 'age' and p_sort_dir = 'desc' then age end desc nulls last,
      case when p_sort_by = 'age' and p_sort_dir = 'asc' then age end asc nulls last,
      case when p_sort_by = 'name' and p_sort_dir = 'asc' then name end asc nulls last,
      case when p_sort_by = 'name' and p_sort_dir = 'desc' then name end desc nulls last,
      case when p_sort_by = 'percentile' and p_sort_dir = 'desc' then percentile_in_age_group end desc nulls last,
      case when p_sort_by = 'percentile' and p_sort_dir = 'asc' then percentile_in_age_group end asc nulls last,
      vsi desc nulls last
    limit p_limit offset p_offset
  )
  select json_build_object(
    'players', coalesce((select json_agg(row_to_json(s)) from sorted s), '[]'::json),
    'total', (select total from total_count),
    'totalUnfiltered', (select total from total_unfiltered),
    'ageGroupStats', coalesce(
      (select json_object_agg(age_group, json_build_object('count', cnt, 'avgVsi', avg_vsi, 'minVsi', min_vsi, 'maxVsi', max_vsi))
       from age_stats), '{}'::json
    ),
    'ageGroups', coalesce(
      (select json_agg(distinct age_group) from with_percentiles), '[]'::json
    ),
    'competitiveLevels', coalesce(
      (select json_agg(distinct competitive_level) from with_percentiles), '[]'::json
    )
  ) into result;

  return result;
end;
$$;

COMMIT;
