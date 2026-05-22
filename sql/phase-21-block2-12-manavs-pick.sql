-- ════════════════════════════════════════════════════════════════════
-- Phase 21 Block 2.12 — "The Strategist's Companion"
-- Migration: Manav's Pick external feed infrastructure
--
-- New tables:
--   1. feed_sources_whitelist — curated publisher list w/ trust tiers
--   2. global_feed_items      — RSS items pulled once, shared across projects
--   3. project_feed_state     — per-project saved/dismissed/picked tracking
--
-- The LLM scoring + Pick caching reuses project_knowledge via
-- category='war_room_cache' which exists from Pass 1.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Whitelisted publishers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_sources_whitelist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher       TEXT NOT NULL,
  domain          TEXT NOT NULL UNIQUE,
  rss_url         TEXT NOT NULL,
  trust_tier      TEXT NOT NULL CHECK (trust_tier IN ('T1', 'T2', 'T3', 'T4')),
  -- T1 = official publishers (SEJ, SEL, Moz, Ahrefs, Google)
  -- T2 = analyst sites (Detailed, Semrush blog)
  -- T3 = community / individual experts
  -- T4 = academic / research
  category        TEXT,                        -- 'seo' | 'algorithm' | 'industry' | 'tools'
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_pull_at    TIMESTAMPTZ,
  last_pull_status TEXT,                       -- 'ok' | 'failed' | 'never'
  last_pull_error  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_sources_active ON feed_sources_whitelist(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_feed_sources_tier   ON feed_sources_whitelist(trust_tier);

-- ── 2. Global feed items — shared across ALL projects ─────────────
-- One pull per publisher serves every project. Spend-once model.
CREATE TABLE IF NOT EXISTS global_feed_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES feed_sources_whitelist(id) ON DELETE CASCADE,
  guid            TEXT NOT NULL,               -- RSS guid or fallback to URL
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  excerpt         TEXT,                        -- max 280 chars, fair-use snippet
  author          TEXT,
  published_at    TIMESTAMPTZ,                 -- when the publisher published it
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trust_tier      TEXT NOT NULL,               -- denormalized from source for fast filter
  category        TEXT,                        -- denormalized
  -- For dedupe across publishers that syndicate
  content_hash    TEXT,
  -- TTL: items older than 14 days drop from active set
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  UNIQUE (source_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_global_feed_published ON global_feed_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_feed_expires   ON global_feed_items(expires_at);
CREATE INDEX IF NOT EXISTS idx_global_feed_tier      ON global_feed_items(trust_tier);
CREATE INDEX IF NOT EXISTS idx_global_feed_hash      ON global_feed_items(content_hash) WHERE content_hash IS NOT NULL;

-- ── 3. Per-project feed state — saved / dismissed / skipped ───────
-- One row per (project, feed_item, action). Read history persists for
-- the dismissed-already filter; saved items become the "Recently saved"
-- library (Phase C2).
CREATE TABLE IF NOT EXISTS project_feed_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  feed_item_id    UUID NOT NULL REFERENCES global_feed_items(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('saved', 'dismissed', 'skipped', 'asked_chat')),
  acted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional reason captured for "dismissed" — improves filter over time
  reason          TEXT,
  UNIQUE (project_id, feed_item_id, action)
);

CREATE INDEX IF NOT EXISTS idx_project_feed_state_proj_action
  ON project_feed_state(project_id, action);

-- ── 4. Seed the whitelist ────────────────────────────────────────
-- These are real, reliable SEO/marketing RSS feeds.
-- Trust tiers reflect editorial reputation, not opinion alignment.
INSERT INTO feed_sources_whitelist (publisher, domain, rss_url, trust_tier, category) VALUES
  ('Search Engine Journal',  'searchenginejournal.com', 'https://www.searchenginejournal.com/feed/',                  'T1', 'seo'),
  ('Search Engine Land',     'searchengineland.com',    'https://searchengineland.com/feed',                          'T1', 'seo'),
  ('Moz Blog',               'moz.com',                 'https://moz.com/posts/rss',                                  'T1', 'seo'),
  ('Ahrefs Blog',            'ahrefs.com',              'https://ahrefs.com/blog/feed/',                              'T1', 'seo'),
  ('Semrush Blog',           'semrush.com',             'https://www.semrush.com/blog/feed/',                         'T2', 'seo'),
  ('Google Search Central',  'developers.google.com',   'https://developers.google.com/search/blog/feed.xml',         'T1', 'algorithm'),
  ('Backlinko',              'backlinko.com',           'https://backlinko.com/feed',                                 'T1', 'seo'),
  ('Aleyda Solis',           'aleydasolis.com',         'https://www.aleydasolis.com/en/feed/',                       'T2', 'seo'),
  ('Search Engine Roundtable','seroundtable.com',       'https://www.seroundtable.com/atom.xml',                      'T2', 'algorithm'),
  ('Brian Dean / Backlinko Email', 'backlinko.com',     'https://backlinko.com/feed',                                 'T1', 'seo'),
  ('Detailed.com',           'detailed.com',            'https://detailed.com/feed/',                                 'T2', 'seo'),
  ('Sistrix Blog',           'sistrix.com',             'https://www.sistrix.com/blog/feed/',                         'T2', 'seo')
ON CONFLICT (domain) DO NOTHING;
