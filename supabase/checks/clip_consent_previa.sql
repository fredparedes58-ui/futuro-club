-- VITAS · Comprobación SOLO LECTURA antes de desplegar el gate de consentimiento de clips
-- (PR feat/clip-consent-gate · api/_lib/analysisConsentGate.ts).
--
-- Devuelve UNA fila; no falla si falta algún objeto (to_regclass / query_to_xml).
-- Probada en PGlite (simulación, NO la base real) con: base vacía, todas las migraciones
-- del repo, todas + datos de ejemplo, y migraciones hasta la 071 (sin 072) como control.
--
-- Qué hacer con el resultado:
--   - audit_table_exists=false o audit_columns<>8  → el gate fallaría cerrado (500) en TODA
--     subida y todo análisis: NO desplegar hasta crear public.gdpr_audit_log (migración 003).
--   - audit_open_insert_policy<>0 o auth_can_insert_audit/auth_can_update_audit=true → un
--     usuario podría falsificar declaraciones: aplicar antes la 072.
--   - players_birth_date_exists=false → la regla de menores no puede aplicarse (el gate trata
--     la fecha como desconocida y basta la declaración): aplicar la 036.
--   - minors_blocked_without_consent>0 → ese número de jugadores (menores de 14 con fecha de
--     nacimiento) quedará SIN análisis hasta que su tutor firme y confirme el consentimiento.
--   - auth_can_update_consents=true → informativo: ver docs/pendientes-metricas.md §D
--     (un authenticated con claim tenant_id puede marcar como verificado un consentimiento
--     pendiente de su tenant; simulación PGlite).
select
  to_regclass('public.gdpr_audit_log') is not null                                   as audit_table_exists,          -- esperado: true
  (select count(*)::int from information_schema.columns
     where table_schema = 'public' and table_name = 'gdpr_audit_log'
       and column_name in ('user_id','tenant_id','action','resource_type','resource_id','metadata','ip','created_at'))
                                                                                     as audit_columns,               -- esperado: 8
  (select count(*)::int from pg_policies
     where schemaname = 'public' and tablename = 'gdpr_audit_log' and policyname = 'audit_insert_authenticated')
                                                                                     as audit_open_insert_policy,    -- esperado: 0
  case when to_regclass('public.gdpr_audit_log') is null then null
       else has_table_privilege('authenticated', 'public.gdpr_audit_log', 'INSERT') end as auth_can_insert_audit,     -- esperado: false
  case when to_regclass('public.gdpr_audit_log') is null then null
       else has_table_privilege('authenticated', 'public.gdpr_audit_log', 'UPDATE') end as auth_can_update_audit,     -- esperado: false
  exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'players' and column_name = 'birth_date')
                                                                                     as players_birth_date_exists,   -- esperado: true
  (select count(*)::int from information_schema.columns
     where table_schema = 'public' and table_name = 'parental_consents'
       and column_name in ('player_id','email_verified','withdrawn_at'))             as consent_columns,             -- esperado: 3
  case when exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'players' and column_name = 'birth_date')
       then (xpath('/row/c/text()', query_to_xml(
              'select count(*)::int as c from public.players
                 where birth_date is not null and extract(year from age(now(), birth_date)) < 14',
              false, true, '')))[1]::text::int
  end                                                                                as known_minors_under_14,       -- informativo
  case when exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'players' and column_name = 'birth_date')
        and (select count(*) from information_schema.columns
               where table_schema = 'public' and table_name = 'parental_consents'
                 and column_name in ('player_id','email_verified','withdrawn_at')) = 3
       then (xpath('/row/c/text()', query_to_xml(
              'select count(*)::int as c from public.players p
                 where p.birth_date is not null and extract(year from age(now(), p.birth_date)) < 14
                   and not exists (select 1 from public.parental_consents c
                                    where c.player_id = p.id and c.email_verified = true and c.withdrawn_at is null)',
              false, true, '')))[1]::text::int
  end                                                                                as minors_blocked_without_consent, -- informativo: se bloquearían
  case when to_regclass('public.parental_consents') is null then null
       else has_table_privilege('authenticated', 'public.parental_consents', 'UPDATE') end as auth_can_update_consents; -- informativo (riesgo de forja)
