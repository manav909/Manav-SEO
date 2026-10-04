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
