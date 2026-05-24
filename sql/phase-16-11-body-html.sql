/* ────────────────────────────────────────────────────────────────────
   Phase 16.11 — add body_html column to seo_campaign_reports
   ────────────────────────────────────────────────────────────────────
   Adds the HTML-rendered version of audit reports alongside the
   existing markdown column. Nullable (so legacy rows without
   body_html remain readable). New audits populate both columns
   starting from this deploy.

   Apply in Supabase Dashboard BEFORE deploying code changes.
   Manav's rule: SQL migrations applied in Supabase Dashboard FIRST,
   then code push.

   Storage cost: HTML is ~2-3x the size of markdown for the same
   audit (75-150 KB typical vs 30-50 KB markdown). At ~10 audits
   per project per month and ~5 active projects, this adds ~10 MB
   per month to seo_campaign_reports — negligible at Supabase
   Pro tier (8 GB included).

   Rollback: DROP COLUMN body_html. No data loss since markdown
   column is unchanged and is the canonical source for older
   readers.
   ──────────────────────────────────────────────────────────────── */

ALTER TABLE seo_campaign_reports
  ADD COLUMN IF NOT EXISTS body_html TEXT;

COMMENT ON COLUMN seo_campaign_reports.body_html IS
  'HTML-rendered version of the audit report. Phase 16.11. Self-contained HTML with embedded CSS, clickable internal anchors, print-optimized for browser-PDF and Word-DOCX conversion. Nullable — legacy reports have body_md only.';
