-- ─── Rankings RPC — Server-side percentile calculation + pagination ──────────
-- Replaces fetching ALL players to Edge and calculating in-memory

create or replace function get_ranked_players(
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
      -- Extract fields from JSONB
      (data->>'name')::text as name,
      (data->>'age')::int as age,
      (data->>'position')::text as position,
      coalesce((data->>'vsi')::numeric, 0) as vsi,
      coalesce((data->>'phvCategory')::text, 'ontme') as phv_category,
      coalesce((data->>'competitiveLevel')::text, 'Regional') as competitive_level,
      -- Age group classification
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
  -- Calculate percentiles BEFORE filtering
  with_percentiles as (
    select
      b.*,
      percent_rank() over (order by b.vsi) * 100 as percentile,
      percent_rank() over (partition by b.age_group order by b.vsi) * 100 as percentile_in_age_group
    from base b
  ),
  -- Apply filters
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
  -- Age group stats (from unfiltered data)
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
