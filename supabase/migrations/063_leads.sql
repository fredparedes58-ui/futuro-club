-- 063 · Captura de leads del formulario público de la landing ("acceso anticipado")
--
-- Datos de contacto de ADULTOS (responsables de club/scouts), NO de menores.
-- Acceso restringido al backend: RLS activado y SIN políticas → anon/authenticated
-- no pueden leer ni escribir; solo service_role (que salta RLS) opera la tabla
-- desde /api/leads. No se expone ningún endpoint de lectura pública.

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  club        text,
  email       text not null,
  phone       text,
  message     text,
  source      text,          -- de dónde llegó (ej. "landing-krujens")
  user_agent  text,
  ip_hash     text           -- hash de IP para dedupe/abuso; nunca la IP en claro
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx       on public.leads (lower(email));

alter table public.leads enable row level security;
-- Deliberadamente SIN políticas: solo service_role (backend) accede.

comment on table public.leads is
  'Leads del formulario público de la landing (acceso anticipado). Solo service_role vía /api/leads.';
