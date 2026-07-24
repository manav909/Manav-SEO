-- QA Desk, the client record. Safe to run more than once.
-- Run in the Supabase SQL editor BEFORE deploying the code.

-- A client is a standing record, not something retyped for every review. The
-- conversation, the commitment mail, the site, the BDE and the target keywords
-- belong to the client and are carried into each new review automatically.
-- client_id is the unique handle, which is why it is the key.
create table if not exists qa_clients (
  id              uuid primary key default gen_random_uuid(),
  client_id       text unique not null,
  client_name     text,
  site_url        text,
  bde_name        text,
  client_context  text,
  mail_text       text,
  persona         text,
  target_keywords jsonb default '[]'::jsonb,
  competitors     jsonb default '[]'::jsonb,
  reviews_count   int default 0,
  last_seen_at    timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists qa_clients_name_idx on qa_clients (client_name);
create index if not exists qa_clients_seen_idx on qa_clients (last_seen_at desc);
