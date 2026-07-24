-- QA Desk, evidence the review is judged against. Safe to run more than once.
-- Run in the Supabase SQL editor BEFORE deploying the code.

-- Target keywords and competitors are read from the client conversation, the
-- commitment mail, Search Console and the project. They belong on the review so
-- every row can be judged against what this client is actually trying to rank
-- for, rather than against generic rules.
alter table qa_reviews add column if not exists target_keywords jsonb default '[]'::jsonb;
alter table qa_reviews add column if not exists competitors     jsonb default '[]'::jsonb;
