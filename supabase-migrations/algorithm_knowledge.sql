-- algorithm_knowledge table
-- Stores AI-fetched SEO algorithm knowledge per topic.
create table if not exists algorithm_knowledge (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  title       text not null,
  summary     text,
  content     jsonb,
  tags        text[] default '{}',
  source_url  text,
  source_name text,
  published_date text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table algorithm_knowledge enable row level security;

create policy "Users manage their algorithm_knowledge"
  on algorithm_knowledge for all
  to authenticated using (true) with check (true);

create index if not exists algorithm_knowledge_project_id_idx on algorithm_knowledge(project_id);
create index if not exists algorithm_knowledge_tags_idx on algorithm_knowledge using gin(tags);
create index if not exists algorithm_knowledge_updated_idx on algorithm_knowledge(updated_at desc);
