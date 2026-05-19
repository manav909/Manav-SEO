-- ════════════════════════════════════════════════════════════════
-- pm_module.sql
-- Extends kanban_tasks to back the Automated Project Management module.
--
-- SAFE: every statement is additive (ADD COLUMN IF NOT EXISTS).
-- No existing column is altered or dropped. The current /kanban page
-- and upsert_kanban_task handler keep working unchanged — new columns
-- simply default to null/empty for existing rows.
--
-- Run once in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════

-- ── Card classification & placement ──────────────────────────────
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS card_type       text DEFAULT 'custom',
  -- quick-win | weekly | monthly | technical | content | geo |
  -- competitive | insight | kpi | custom
  ADD COLUMN IF NOT EXISTS week            int  DEFAULT 5,
  -- 1-4 = week columns, 5 = backlog
  ADD COLUMN IF NOT EXISTS placed          boolean DEFAULT false;
  -- false = sits in the library, true = placed on the board

-- ── Execution ────────────────────────────────────────────────────
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS execution_mode  text,
  -- 'ai_execute' | 'human_guide' | null (not yet chosen)
  ADD COLUMN IF NOT EXISTS executed_role   text,
  -- senior_seo | content_writer | team_lead | project_manager | executive | biz_dev
  ADD COLUMN IF NOT EXISTS output          text,
  -- AI execution result OR the generated human how-to guide
  ADD COLUMN IF NOT EXISTS executed_at     timestamptz;

-- ── Verification ─────────────────────────────────────────────────
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS verify_notes    text;

-- ── Requirements & dependencies ──────────────────────────────────
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS requirements    jsonb DEFAULT '[]',
  -- [{ id, label, category, met }]
  ADD COLUMN IF NOT EXISTS depends_on      jsonb DEFAULT '[]';
  -- [ kanban_task id, ... ] — cards that must complete first

-- ── Provenance (traceability to the intelligence behind a card) ──
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS source          text,
  -- audit | brain | algorithm | competitor | sales | client_note |
  -- scope | manual | ai_generated
  ADD COLUMN IF NOT EXISTS source_refs     jsonb DEFAULT '[]';
  -- [{ kind, refId, label }] — specific rows that informed this card

-- ── Reporting / invoicing ────────────────────────────────────────
ALTER TABLE kanban_tasks
  ADD COLUMN IF NOT EXISTS reported_at     timestamptz,
  -- last time this card was included in a client report
  ADD COLUMN IF NOT EXISTS invoice_item    boolean DEFAULT false;
  -- true = counts as a billable line item

-- ── Indexes for the PM board's common queries ───────────────────
CREATE INDEX IF NOT EXISTS kt_pm_board
  ON kanban_tasks(project_id, placed, week);

CREATE INDEX IF NOT EXISTS kt_pm_reporting
  ON kanban_tasks(project_id, status, reported_at);
