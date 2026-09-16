-- 066 · Lead-gate del entorno DEMO con APROBACIÓN (vitas-demo)
--
-- Flujo: el visitante (adulto: directivo/scout de club) deja sus datos y CONSIENTE
-- (RGPD) → se crea una SOLICITUD en estado 'pending' → el operador recibe un email
-- con enlaces firmados para APROBAR / RECHAZAR / REVOCAR → el gate del demo consulta
-- el estado en el servidor (por eso revocar tiene efecto real). Datos de ADULTOS,
-- nunca de menores. El demo corre sin Supabase → la captura la hace el proyecto
-- principal (/api/demo/*) con service_role.
--
-- Acceso restringido al backend: RLS activado y SIN políticas → anon/authenticated
-- no pueden leer ni escribir; solo service_role (que salta RLS). Ninguna lectura pública.

create table if not exists public.demo_access (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Datos del solicitante (adulto)
  name         text not null,
  club         text,
  role         text,          -- rol o cargo (director deportivo, scout, ...)
  email        text not null,
  phone        text,
  -- Consentimiento RGPD
  consent      boolean not null default false,
  consent_at   timestamptz,
  -- Trazabilidad
  demo_slug    text,          -- qué demo (host/origen, ej. vitas-demo.krujens.eu)
  origin       text,          -- referrer de origen
  user_agent   text,
  ip_hash      text,          -- hash de IP (SHA-256), nunca la IP en claro (RGPD)
  -- Estado de acceso
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','revoked')),
  decided_at   timestamptz,   -- cuándo se aprobó/rechazó/revocó
  -- Token opaco que el navegador del visitante usa para consultar su estado (no adivinable)
  access_token text not null
);

create unique index if not exists demo_access_token_idx    on public.demo_access (access_token);
create index if not exists demo_access_created_at_idx       on public.demo_access (created_at desc);
create index if not exists demo_access_email_idx            on public.demo_access (lower(email));
create index if not exists demo_access_status_idx           on public.demo_access (status);

alter table public.demo_access enable row level security;
-- Deliberadamente SIN políticas: solo service_role (backend) accede.

comment on table public.demo_access is
  'Solicitudes de acceso al demo (vitas-demo) con aprobacion manual. Adultos con consentimiento RGPD. Solo service_role via /api/demo/*.';
