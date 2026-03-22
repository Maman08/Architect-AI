-- ============================================
-- Architect AI — RAG Schema (pgvector)
-- Run this in your Supabase SQL Editor AFTER
-- the base schema (supabase-schema.sql)
-- ============================================

-- 1. Enable pgvector extension (free in Supabase)
create extension if not exists vector;

-- 2. Code architecture chunks
create table if not exists code_architecture (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  file_path text not null,
  summary text not null,
  responsibility text not null,
  patterns text[] default '{}',
  exports text[] default '{}',
  imports text[] default '{}',
  imported_by text[] default '{}',
  data_entities text[] default '{}',
  embedding vector(1536),
  raw_code text,
  file_size int default 0,
  language text default 'javascript',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_code_arch_project on code_architecture(project_id);
create index if not exists idx_code_arch_file on code_architecture(project_id, file_path);
create index if not exists idx_code_arch_embedding on code_architecture
  using hnsw (embedding vector_cosine_ops);

alter table code_architecture enable row level security;
drop policy if exists "Allow all on code_architecture" on code_architecture;
create policy "Allow all on code_architecture" on code_architecture
  for all using (true) with check (true);

-- 3. Ingestion jobs
create table if not exists ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  repo_owner text not null,
  repo_name text not null,
  status text default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  total_files int default 0,
  processed_files int default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ingestion_project on ingestion_jobs(project_id);

alter table ingestion_jobs enable row level security;
drop policy if exists "Allow all on ingestion_jobs" on ingestion_jobs;
create policy "Allow all on ingestion_jobs" on ingestion_jobs
  for all using (true) with check (true);

-- 4. Function: find similar code by vector search
create or replace function match_code_architecture(
  query_embedding vector(1536),
  match_project_id uuid,
  match_threshold float default 0.3,
  match_count int default 10
)
returns table (
  id uuid,
  file_path text,
  summary text,
  responsibility text,
  patterns text[],
  exports text[],
  imports text[],
  imported_by text[],
  data_entities text[],
  raw_code text,
  similarity float
)
language sql stable
as $$
  select
    ca.id,
    ca.file_path,
    ca.summary,
    ca.responsibility,
    ca.patterns,
    ca.exports,
    ca.imports,
    ca.imported_by,
    ca.data_entities,
    ca.raw_code,
    1 - (ca.embedding <=> query_embedding) as similarity
  from code_architecture ca
  where ca.project_id = match_project_id
    and 1 - (ca.embedding <=> query_embedding) > match_threshold
  order by ca.embedding <=> query_embedding
  limit match_count;
$$;
