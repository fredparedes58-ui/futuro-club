-- Enable pgvector extension
create extension if not exists vector;

-- Knowledge base table for RAG
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1024),
  category text not null check (category in ('drill', 'pro_player', 'report', 'methodology', 'scouting')),
  metadata jsonb not null default '{}',
  player_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- IVFFlat index for fast approximate nearest neighbor search
create index if not exists knowledge_base_embedding_idx
  on knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- Full-text search fallback (Spanish)
create index if not exists knowledge_base_content_fts
  on knowledge_base using gin(to_tsvector('spanish', content));

-- RLS policies
alter table knowledge_base enable row level security;

drop policy if exists "Authenticated users can read knowledge base" on knowledge_base;
create policy "Authenticated users can read knowledge base"
  on knowledge_base for select to authenticated using (true);

drop policy if exists "Service role can manage knowledge base" on knowledge_base;
create policy "Service role can manage knowledge base"
  on knowledge_base for all to service_role using (true);

-- RPC function for similarity search
create or replace function match_knowledge(
  query_embedding vector(1024),
  match_threshold float default 0.60,
  match_count int default 5,
  filter_category text default null,
  filter_player_id text default null
)
returns table (
  id uuid,
  content text,
  category text,
  metadata jsonb,
  player_id text,
  similarity float
)
language plpgsql stable
security definer
as $$
begin
  return query
  select
    kb.id,
    kb.content,
    kb.category,
    kb.metadata,
    kb.player_id,
    (1 - (kb.embedding <=> query_embedding))::float as similarity
  from knowledge_base kb
  where
    (1 - (kb.embedding <=> query_embedding)) > match_threshold
    and (filter_category is null or kb.category = filter_category)
    and (filter_player_id is null or kb.player_id = filter_player_id)
  order by kb.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Full-text search fallback (used when no embeddings configured)
create or replace function search_knowledge_text(
  query_text text,
  match_count int default 5,
  filter_category text default null,
  filter_player_id text default null
)
returns table (
  id uuid,
  content text,
  category text,
  metadata jsonb,
  player_id text,
  similarity float
)
language plpgsql stable
security definer
as $$
begin
  return query
  select
    kb.id,
    kb.content,
    kb.category,
    kb.metadata,
    kb.player_id,
    ts_rank(to_tsvector('spanish', kb.content), plainto_tsquery('spanish', query_text))::float as similarity
  from knowledge_base kb
  where
    to_tsvector('spanish', kb.content) @@ plainto_tsquery('spanish', query_text)
    and (filter_category is null or kb.category = filter_category)
    and (filter_player_id is null or kb.player_id = filter_player_id)
  order by similarity desc
  limit match_count;
end;
$$;
