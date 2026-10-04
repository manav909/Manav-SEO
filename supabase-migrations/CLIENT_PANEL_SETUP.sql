-- ONE-TIME SETUP for the new client panel. Paste this whole file into
-- Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- It combines: panel_plans, client_messages, money_flow, client_wins, calls,
-- ai_visibility and site_checks (the individual files stay for reference).

-- ═══════════ panel_plans.sql ═══════════
-- Client panel plan switches (see api/lib/panel-plans.ts).
-- Safe to run more than once. Run in the Supabase SQL editor.

ALTER TABLE project_entitlements
  ADD COLUMN IF NOT EXISTS panel_plan             text,
  ADD COLUMN IF NOT EXISTS panel_switches         jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS panel_upgrade_previews boolean DEFAULT true;

ALTER TABLE project_entitlements
  DROP CONSTRAINT IF EXISTS project_entitlements_panel_plan_check;
ALTER TABLE project_entitlements
  ADD CONSTRAINT project_entitlements_panel_plan_check
  CHECK (panel_plan IS NULL OR panel_plan IN ('starter','growth','authority','enterprise'));

-- ═══════════ client_messages.sql ═══════════
-- "Talk to Manvisha": one message thread per client project
-- (see api/lib/client-panel.ts). Safe to run more than once.
-- Clients only ever see client + staff rows; ai_draft rows are
-- suggestions for the team and are never shown to clients.

CREATE TABLE IF NOT EXISTS client_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL,
  client_user_id    uuid,
  author_type       text        NOT NULL CHECK (author_type IN ('client','staff','ai_draft')),
  author_label      text,
  staff_email       text,
  body              text        NOT NULL,
  status            text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','draft','used','discarded')),
  read_by_client_at timestamptz,
  read_by_staff_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_messages_project_created
  ON client_messages (project_id, created_at);
CREATE INDEX IF NOT EXISTS client_messages_recent
  ON client_messages (created_at DESC);

-- Only the server (service role) reads and writes this table.
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON client_messages;
CREATE POLICY "No public access" ON client_messages FOR ALL USING (false);

-- ═══════════ money_flow.sql ═══════════
-- Money flow: price list → basket → offer → order (api/lib/money-flow.ts).
-- Payments are taken on another platform, so the team sets order
-- statuses by hand. Safe to run more than once.

CREATE TABLE IF NOT EXISTS service_catalog (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  summary         text,
  deliverables    jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ["…", "…"]
  price_cents     integer     NOT NULL CHECK (price_cents >= 0),
  turnaround_days integer     NOT NULL DEFAULT 7,
  category        text        NOT NULL DEFAULT 'general',
  proof_links     jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{title,url}] articles that explain why it works
  feature_key     text,                                       -- plan switch it belongs to (optional)
  active          boolean     NOT NULL DEFAULT true,
  sort            integer     NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_offers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  client_user_id  uuid,
  status          text        NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested','confirmed','accepted','declined','cancelled')),
  items           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  requested_items jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- what the client asked for, kept for comparison
  client_note     text,
  team_note       text,
  total_cents     integer     NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'USD',
  valid_until     date,
  confirmed_by    text,
  confirmed_at    timestamptz,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_offers_project ON client_offers (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_offers_status  ON client_offers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS client_orders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  offer_id        uuid,
  name            text        NOT NULL,
  deliverables    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  price_cents     integer     NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'USD',
  due_date        date,
  status          text        NOT NULL DEFAULT 'awaiting_payment'
                  CHECK (status IN ('awaiting_payment','payment_received','started','in_progress','delivered','cancelled')),
  payment_ref     text,
  assignee        text,
  delivered_note  text,
  delivered_link  text,
  history         jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{status, at, by, note}]
  thanks          text,
  thanks_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_orders_project ON client_orders (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_orders_status  ON client_orders (status, updated_at DESC);

-- Only the server (service role) reads and writes these tables.
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_offers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders   ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON service_catalog;
DROP POLICY IF EXISTS "No public access" ON client_offers;
DROP POLICY IF EXISTS "No public access" ON client_orders;
CREATE POLICY "No public access" ON service_catalog FOR ALL USING (false);
CREATE POLICY "No public access" ON client_offers   FOR ALL USING (false);
CREATE POLICY "No public access" ON client_orders   FOR ALL USING (false);

-- Draft price list (US $) — edit it in Admin → Price list.
INSERT INTO service_catalog (name, summary, deliverables, price_cents, turnaround_days, category, feature_key, sort)
SELECT * FROM (VALUES
  ('Google Business Profile tune-up', 'Make your map listing complete and convincing — it''s where local customers look first.',
   '["Every profile field completed and checked","Categories and services set up","10 photos named and uploaded","4 ready-to-post updates written"]'::jsonb, 14900, 5, 'local', NULL, 10),
  ('Review request kit', 'A simple way to ask happy customers for Google reviews.',
   '["Printable review card with QR code","Text and email templates","Short guide for your front desk"]'::jsonb, 6000, 2, 'local', NULL, 20),
  ('FAQ page update', 'Answer the questions people actually search for, in your words.',
   '["Up to 10 questions researched from real searches","Answers written and checked with you","FAQ structured data added"]'::jsonb, 9500, 3, 'content', NULL, 30),
  ('Titles & descriptions refresh', 'Better Google snippets so more people click.',
   '["Up to 20 pages reviewed","New titles and descriptions written","Before/after list for your records"]'::jsonb, 12000, 4, 'technical', NULL, 40),
  ('New service page', 'One focused page for a service you want more customers for.',
   '["Keyword research for the service","About 800 words written and edited","Photos and internal links placed","Published or handed over ready to publish"]'::jsonb, 18000, 7, 'content', NULL, 50),
  ('Trusted directory listings', 'Consistent listings on directories Google trusts.',
   '["3 relevant directories chosen with you","Listings created or corrected","Logins handed over to you"]'::jsonb, 9000, 7, 'local', NULL, 60),
  ('Blog article', 'A helpful article that answers a real customer question.',
   '["Topic picked from real searches","About 1,200 words written and edited","One round of changes included"]'::jsonb, 16000, 7, 'content', 'keywords', 70),
  ('Speed fixes', 'Fix the biggest things slowing your site on phones.',
   '["PageSpeed check before and after","Top 5 issues fixed or clearly explained","Short report of what changed"]'::jsonb, 24000, 7, 'technical', NULL, 80),
  ('AI visibility check & fixes', 'See how AI assistants describe your business, and improve it.',
   '["Checks across the AI assistants in your plan","Gaps and wrong facts listed","Top fixes made to your site"]'::jsonb, 20000, 10, 'ai', 'ai_visibility', 90),
  ('Monthly link outreach', 'Earn mentions from relevant local and industry sites.',
   '["Outreach to suitable sites","Target of 5 earned links in the month","Every link reported with where it came from"]'::jsonb, 45000, 30, 'authority', 'backlinks', 100)
) AS v(name, summary, deliverables, price_cents, turnaround_days, category, feature_key, sort)
WHERE NOT EXISTS (SELECT 1 FROM service_catalog);

-- ═══════════ client_wins.sql ═══════════
-- Proof & delight: wins/milestones and daily keyword history
-- (api/lib/client-wins.ts). Safe to run more than once.

CREATE TABLE IF NOT EXISTS client_wins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  kind        text        NOT NULL,          -- page_one | clicks_record | goal_reached | order_delivered | custom
  title       text        NOT NULL,
  detail      text,
  dedupe_key  text        NOT NULL,          -- one win per event, however often the detector runs
  happened_at timestamptz NOT NULL DEFAULT now(),
  created_by  text,                          -- 'system' or a team email
  thanks      text,
  thanked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS client_wins_project ON client_wins (project_id, happened_at DESC);

CREATE TABLE IF NOT EXISTS keyword_history (
  project_id  uuid    NOT NULL,
  query       text    NOT NULL,
  day         date    NOT NULL,
  position    numeric,
  clicks      integer,
  impressions integer,
  PRIMARY KEY (project_id, query, day)
);
CREATE INDEX IF NOT EXISTS keyword_history_project_day ON keyword_history (project_id, day DESC);

ALTER TABLE client_wins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON client_wins;
DROP POLICY IF EXISTS "No public access" ON keyword_history;
CREATE POLICY "No public access" ON client_wins     FOR ALL USING (false);
CREATE POLICY "No public access" ON keyword_history FOR ALL USING (false);

-- ═══════════ calls.sql ═══════════
-- Calls: booking, call notes and tracked actions (api/lib/client-calls.ts).
-- Works with any calendar — invites go out as .ics attachments.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS call_settings (
  id             integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- one row
  host_name      text        NOT NULL DEFAULT 'Manvisha',
  host_email     text,
  timezone       text        NOT NULL DEFAULT 'America/Chicago',
  slot_minutes   integer     NOT NULL DEFAULT 20,
  notice_hours   integer     NOT NULL DEFAULT 12,     -- no bookings sooner than this
  horizon_days   integer     NOT NULL DEFAULT 14,     -- how far ahead clients can book
  meeting_link   text,                                -- your standing Google Meet / Zoom link
  weekly_hours   jsonb       NOT NULL DEFAULT '[{"weekday":2,"start":"10:00","end":"12:00"},{"weekday":4,"start":"16:00","end":"18:00"}]'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO call_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS client_calls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid        NOT NULL,
  client_user_id  uuid,
  starts_at       timestamptz NOT NULL,
  minutes         integer     NOT NULL DEFAULT 20,
  topic           text,
  status          text        NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','done')),
  meeting_link    text,
  transcript      text,
  summary         text,
  summary_draft   text,
  summary_sent_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_calls_project ON client_calls (project_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS client_calls_starts  ON client_calls (starts_at);
-- One live booking per time slot.
CREATE UNIQUE INDEX IF NOT EXISTS client_calls_slot_unique ON client_calls (starts_at) WHERE status = 'booked';

CREATE TABLE IF NOT EXISTS call_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid,
  project_id  uuid        NOT NULL,
  what        text        NOT NULL,
  owner       text        NOT NULL DEFAULT 'team' CHECK (owner IN ('team','client')),
  due_date    date,
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_actions_project ON call_actions (project_id, status);

ALTER TABLE call_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_calls  ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_actions  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON call_settings;
DROP POLICY IF EXISTS "No public access" ON client_calls;
DROP POLICY IF EXISTS "No public access" ON call_actions;
CREATE POLICY "No public access" ON call_settings FOR ALL USING (false);
CREATE POLICY "No public access" ON client_calls  FOR ALL USING (false);
CREATE POLICY "No public access" ON call_actions  FOR ALL USING (false);

-- ═══════════ ai_visibility.sql ═══════════
-- AI visibility: how AI assistants answer the questions customers ask
-- (api/lib/ai-visibility.ts). Safe to run more than once.

CREATE TABLE IF NOT EXISTS ai_visibility_checks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  run_id      text        NOT NULL,
  engine      text        NOT NULL,      -- chatgpt | perplexity | gemini | claude
  question    text        NOT NULL,
  mentioned   boolean     NOT NULL DEFAULT false,   -- business name appears in the answer
  linked      boolean     NOT NULL DEFAULT false,   -- website appears in the answer or its sources
  excerpt     text,
  sources     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_visibility_checks_project ON ai_visibility_checks (project_id, created_at DESC);

-- Optional custom questions per project (otherwise built from real searches).
CREATE TABLE IF NOT EXISTS ai_visibility_questions (
  project_id  uuid        PRIMARY KEY,
  questions   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_visibility_checks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON ai_visibility_checks;
DROP POLICY IF EXISTS "No public access" ON ai_visibility_questions;
CREATE POLICY "No public access" ON ai_visibility_checks    FOR ALL USING (false);
CREATE POLICY "No public access" ON ai_visibility_questions FOR ALL USING (false);

-- ═══════════ site_checks.sql ═══════════
-- Site health & new-website checklist (api/lib/site-foundations.ts).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS site_checks (
  project_id  uuid        NOT NULL,
  check_key   text        NOT NULL,
  label       text        NOT NULL,
  status      text        NOT NULL CHECK (status IN ('good','todo','in_progress','unknown')),
  detail      text,
  source      text        NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','team')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, check_key)
);

ALTER TABLE site_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No public access" ON site_checks;
CREATE POLICY "No public access" ON site_checks FOR ALL USING (false);

