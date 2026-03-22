-- ============================================
-- Architect AI — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Projects table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  prd text default '',
  tech_stack text default '',
  github_repo_url text default '',
  github_pat text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Past decisions per project
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  decision text not null,
  reason text not null,
  created_at timestamptz default now()
);

-- Index for fast lookup
create index if not exists idx_decisions_project on decisions(project_id);

-- 3. Conversations per project
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  title text not null default 'New conversation',
  created_at timestamptz default now()
);

create index if not exists idx_conversations_project on conversations(project_id);

-- 4. Messages per conversation
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on messages(conversation_id);

-- 5. Auto-update updated_at on projects
create or replace function update_project_timestamp()
returns trigger as $$
declare
  v_project_id uuid;
begin
  -- messages don't have project_id directly — look it up via conversations
  if tg_table_name = 'messages' then
    select project_id into v_project_id
    from conversations where id = new.conversation_id;
  else
    v_project_id := new.project_id;
  end if;

  if v_project_id is not null then
    update projects set updated_at = now() where id = v_project_id;
  end if;

  return new;
end;
$$ language plpgsql;

-- Trigger: update project timestamp when a new message is added
create or replace trigger trg_message_update_project
after insert on messages
for each row
execute function update_project_timestamp();

-- Trigger: update project timestamp when a new decision is added
create or replace trigger trg_decision_update_project
after insert on decisions
for each row
execute function update_project_timestamp();

-- Trigger: update project timestamp when a new conversation is added  
create or replace trigger trg_conversation_update_project
after insert on conversations
for each row
execute function update_project_timestamp();

-- 6. Row Level Security (optional — disable if not using auth)
-- If you want the app fully open (no auth), run:
alter table projects enable row level security;
alter table decisions enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "Allow all on projects" on projects for all using (true) with check (true);
create policy "Allow all on decisions" on decisions for all using (true) with check (true);
create policy "Allow all on conversations" on conversations for all using (true) with check (true);
create policy "Allow all on messages" on messages for all using (true) with check (true);

-- ============================================
-- 7. Architecture Sessions (Feature: Sequential Questioning)
-- ============================================
create table if not exists architecture_sessions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  state text default 'GATHERING_INFO',
  questions_asked jsonb default '[]',
  user_answers jsonb default '[]',
  final_architecture text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_arch_sessions_project on architecture_sessions(project_id);
create index if not exists idx_arch_sessions_conversation on architecture_sessions(conversation_id);

alter table architecture_sessions enable row level security;
create policy "Allow all on architecture_sessions" on architecture_sessions for all using (true) with check (true);
