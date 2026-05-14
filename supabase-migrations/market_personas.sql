-- market_personas table
-- Stores AI-generated market personas per project.
-- One persona per project (upsert by project_id).

create table if not exists market_personas (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  industry     text,
  persona_name text,
  persona_data jsonb,   -- full structured persona from market-researcher
  goals_data   jsonb,   -- phased goals + KPIs
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id)
);

-- RLS: same access as projects
alter table market_personas enable row level security;

create policy "Users can manage their own market_personas"
  on market_personas for all
  using (
    project_id in (
      select id from projects
      where client_id in (
        select client_id from clients where user_id = auth.uid()
      )
    )
  );

-- Index for fast lookup + cross-project industry queries
create index if not exists market_personas_project_id_idx on market_personas(project_id);
create index if not exists market_personas_industry_idx   on market_personas(industry);
