-- ═══════════════════════════════════════════════════════════════════════
--  Phase 21 — Block 2.5 — Quality Foundation: URL targeting + grounded chat
--
--  Adds schema for:
--    • Explicit per-keyword target URL specification (hub-and-spoke)
--    • Per-URL fit analysis grounded in real fetched content
--    • Traceability of URL-keyword decisions for credibility scorecard
--
--  APPLIED: 2026-05-23 (direct via Supabase SQL Editor)
--  COMMITTED-TO-REPO: yes (Phase 21 migration policy)
-- ═══════════════════════════════════════════════════════════════════════

alter table seo_campaigns
  add column if not exists target_urls            text[]      default null,
  add column if not exists keyword_url_mapping    jsonb       default null,
  add column if not exists url_fit_analysis       jsonb       default null;

create index if not exists idx_seo_campaigns_target_urls
  on seo_campaigns using gin (target_urls);

comment on column seo_campaigns.target_urls is
  'Array of target URLs this campaign drives traffic to. If empty/null, the campaign uses GSC-resolved auto-targeting per pillar. Phase 21 Block 2.5.';

comment on column seo_campaigns.keyword_url_mapping is
  'Optional hub-and-spoke mapping: keyword to URL. When present, pillars use this rather than auto-resolving from GSC. Phase 21 Block 2.5.';

comment on column seo_campaigns.url_fit_analysis is
  'Persisted fit analysis output: per-URL fetch status, content snapshot at campaign creation, and LLM-grounded fit verdict per keyword. Phase 21 Block 2.5.';
