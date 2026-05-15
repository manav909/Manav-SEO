-- algorithm_knowledge table
-- Stores AI-fetched SEO algorithm knowledge per topic.
-- System-wide (no project_id) — matches actual columns in algorithm-intel.ts.
-- Run the shorter "fix" block below if table already exists.

-- ══ CREATE (if table does not exist yet) ══════════════════════════════
create table if not exists algorithm_knowledge (
  id              uuid primary key default gen_random_uuid(),
  engine          text    not null default 'google',
  category        text    not null default 'general',
  title           text    not null,
  summary         text,
  what_changed    text,
  impact_level    text    default 'medium',
  best_practices  text[]  default '{}',
  ranking_factors text[]  default '{}',
  checklist_items jsonb   default '[]',
  source_url      text,
  source_name     text,
  published_date  text,
  tags            text[]  default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ══ RLS ══════════════════════════════════════════════════════════════
alter table algorithm_knowledge enable row level security;

drop policy if exists "Users manage their algorithm_knowledge" on algorithm_knowledge;
create policy "Users manage their algorithm_knowledge"
  on algorithm_knowledge for all
  to authenticated using (true) with check (true);

-- ══ INDEXES ══════════════════════════════════════════════════════════
create index if not exists algorithm_knowledge_tags_idx     on algorithm_knowledge using gin(tags);
create index if not exists algorithm_knowledge_title_idx    on algorithm_knowledge(lower(title));
create index if not exists algorithm_knowledge_updated_idx  on algorithm_knowledge(updated_at desc);
create index if not exists algorithm_knowledge_category_idx on algorithm_knowledge(category);
