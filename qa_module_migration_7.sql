-- QA Desk migration 7. Safe to run more than once.
-- RUN THIS IN THE SUPABASE SQL EDITOR BEFORE DEPLOYING THE CODE.
--
-- Purpose: make the review row the single source of truth for a QA session.
-- Until now the review was written once, at the moment checking started, and
-- everything before that lived only in the browser. A refresh lost it, and a
-- reopened review showed the nav project rather than the project its findings
-- actually came from. These columns let the record hold the whole session.

-- A session that has been started but not yet run. It is a real row from the
-- first meaningful input, so a refresh can resume it. Deliberately a boolean
-- rather than a new value in `status`, because the base migration is not in the
-- repo and may carry a check constraint on that column.
alter table qa_reviews add column if not exists is_draft boolean default false;

-- The evidence actually used by this review, bound to it rather than read from
-- whatever the nav happens to point at later.
alter table qa_reviews add column if not exists crawl_job_id text;
alter table qa_reviews add column if not exists gsc_resource_id text;

-- Where each field came from: typed, read (from the conversation), record (a
-- stored client), or nav (a default). One declared owner per field, so a default
-- can never silently beat real evidence again.
alter table qa_reviews add column if not exists field_sources jsonb default '{}'::jsonb;

-- How the project was bound: nav, existing, or created. Shown on screen so the
-- reviewer is never guessing which project covers the site being checked.
alter table qa_reviews add column if not exists project_source text;

-- A client record is reachable by the SITE as well as by its handle, because the
-- site is what the nav project and the conversation have in common. Selecting a
-- project in the nav can then bring back that client's chat, mail and keywords.
alter table qa_clients add column if not exists project_id uuid;
alter table qa_clients add column if not exists site_domain text;

create index if not exists qa_clients_domain_idx on qa_clients (site_domain);
create index if not exists qa_clients_project_idx on qa_clients (project_id);
create index if not exists qa_reviews_draft_idx on qa_reviews (is_draft, updated_at desc);

-- Backfill the domain for records that already exist, so the lookup works on
-- day one rather than only for clients saved after this migration.
update qa_clients
   set site_domain = lower(
         regexp_replace(
           regexp_replace(coalesce(site_url, ''), '^https?://', ''),
           '^www\.', ''
         )
       )
 where site_url is not null
   and coalesce(site_domain, '') = '';

update qa_clients
   set site_domain = split_part(site_domain, '/', 1)
 where site_domain like '%/%';
