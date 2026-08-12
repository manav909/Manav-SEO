-- Copy review gate, migration 8. Safe to run more than once.
-- RUN THIS IN THE SUPABASE SQL EDITOR BEFORE DEPLOYING THE CODE.
--
-- The client sign-off gate: every proposed copy change is a row the client
-- decides on individually, and the set becomes implementation ready only when
-- every row is approved. Readiness is COMPUTED from these rows rather than
-- stored as a flag, so it can never drift from the decisions underneath it.

create table if not exists copy_review_gates (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid,
  client_id         text,
  title             text,
  -- BCP 47 language tag of the copy under review. el for Greek.
  locale            text default 'el',
  -- draft, sent, in_review, implementation_ready
  status            text default 'draft',
  -- Whether the language advisory actually ran. An advisory that failed is
  -- recorded as failed, never left blank, because a blank advisory section
  -- reads as approval.
  advisory_ok       boolean default false,
  advisory_note     text,
  advisory_overall  text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists copy_review_items (
  id              uuid primary key default gen_random_uuid(),
  gate_id         uuid not null references copy_review_gates (id) on delete cascade,
  item_index      int  not null,
  page_url        text,
  -- meta_title, meta_description, h1, h2, body, alt, slug, cta
  element         text,
  current_value   text,
  proposed_value  text,
  rationale       text,
  keyword         text,
  -- The mechanical findings, each carrying its own tier, level and blocking
  -- flag. Stored with the item so a decision can always be audited against
  -- exactly what was known at the time it was made.
  findings        jsonb default '[]'::jsonb,
  -- Judgement notes, kept in their own column so they can never be mistaken
  -- for mechanical findings.
  advisory_notes  jsonb default '[]'::jsonb,
  -- pending, approved, changes_requested, rejected
  status          text default 'pending',
  client_comment  text,
  decided_by      text,
  decided_at      timestamptz,
  -- Set when an item was approved despite a blocking mechanical finding. The
  -- override is recorded rather than silent, so an approval that bypassed a
  -- known error is visible afterwards.
  overridden      boolean default false,
  round           int default 1,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create unique index if not exists copy_review_items_gate_idx on copy_review_items (gate_id, item_index, round);
create index if not exists copy_review_items_status_idx on copy_review_items (gate_id, status);
create index if not exists copy_review_gates_project_idx on copy_review_gates (project_id, updated_at desc);
create index if not exists copy_review_gates_client_idx on copy_review_gates (client_id, updated_at desc);
