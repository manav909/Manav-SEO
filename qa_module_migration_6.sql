-- QA Desk, per tab interpretation. Safe to run more than once.
-- Run in the Supabase SQL editor BEFORE deploying the code.

-- Every workbook is laid out differently, so how a tab was understood is part of
-- the record: which column held the page, which column held the value that
-- should now be live, whether the tab is a page level or a site level check, and
-- what the reviewer was told it would verify. Kept so a result can be explained
-- and audited later, not just produced.
alter table qa_tabs add column if not exists mapping jsonb default '{}'::jsonb;
