alter table seo_campaigns
  add column if not exists target_urls            text[]      default null,
  add column if not exists keyword_url_mapping    jsonb       default null,
  add column if not exists url_fit_analysis       jsonb       default null;

create index if not exists idx_seo_campaigns_target_urls
  on seo_campaigns using gin (target_urls);

comment on column seo_campaigns.target_urls is 'Array of target URLs this campaign drives traffic to. Phase 21 Block 2.5.';
comment on column seo_campaigns.keyword_url_mapping is 'Hub-and-spoke mapping: keyword to URL. Phase 21 Block 2.5.';
comment on column seo_campaigns.url_fit_analysis is 'Per-URL fetch status, content snapshot, LLM fit verdict per keyword. Phase 21 Block 2.5.';
