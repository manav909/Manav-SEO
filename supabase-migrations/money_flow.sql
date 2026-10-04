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
