-- Phase 17.5.8 — Reconcile runs damaged during the double-driver window
--
-- During Phase 17.5.1 through 17.5.6 (a ~30-minute window on 2026-05-25),
-- the SEO Campaigns panel's refresh-from-audit handler was driving
-- executeNextPendingStep in parallel with the SEASON dashboard's
-- driveExecution loop on the same runId. Both drivers raced on "select
-- first pending step" reads — sometimes producing double-increments,
-- sometimes lost increments, leaving runs in inconsistent state:
--   - run.steps_completed != count(steps where status='completed')
--   - run.honest_summary saying "N/8 completed" while step rows show
--     all 8 actually completed
--
-- Phase 17.5.7 fixed the underlying race by removing the panel's driver
-- so only the dashboard drives execution. But runs that completed DURING
-- the window are still in inconsistent DB state until repaired.
--
-- This script repairs them by recomputing run counters from step rows.
-- It cannot regenerate honest_summary (that requires TypeScript logic) —
-- use the bs_season_pipeline_reconcile route action for full repair
-- including honest_summary regeneration.
--
-- Apply in Supabase Dashboard → SQL Editor.

-- ─── 1. Identify damaged runs ────────────────────────────────────
-- Runs where the stored steps_completed doesn't match actual step row count
SELECT
  r.id,
  r.pipeline_type,
  r.status,
  r.steps_completed AS run_says_completed,
  c.actual_completed,
  r.steps_failed AS run_says_failed,
  c.actual_failed,
  r.step_count,
  r.started_at::date,
  r.finished_at::date,
  LEFT(r.honest_summary, 100) AS honest_summary_preview
FROM season_pipeline_runs r
JOIN (
  SELECT
    run_id,
    COUNT(*) FILTER (WHERE status = 'completed') AS actual_completed,
    COUNT(*) FILTER (WHERE status = 'failed')    AS actual_failed
  FROM season_pipeline_steps
  GROUP BY run_id
) c ON c.run_id = r.id
WHERE r.steps_completed != c.actual_completed
   OR r.steps_failed    != c.actual_failed
ORDER BY r.started_at DESC;

-- ─── 2. Repair the counters ──────────────────────────────────────
-- This fixes the numeric drift. honest_summary text remains stale until
-- reconcile route is called (see step 4 below).
UPDATE season_pipeline_runs r
SET
  steps_completed = c.actual_completed,
  steps_failed    = c.actual_failed
FROM (
  SELECT
    run_id,
    COUNT(*) FILTER (WHERE status = 'completed') AS actual_completed,
    COUNT(*) FILTER (WHERE status = 'failed')    AS actual_failed
  FROM season_pipeline_steps
  GROUP BY run_id
) c
WHERE r.id = c.run_id
  AND (r.steps_completed != c.actual_completed
       OR r.steps_failed != c.actual_failed);

-- ─── 3. Verify counter repair landed ─────────────────────────────
SELECT COUNT(*) AS still_drifted
FROM season_pipeline_runs r
JOIN season_pipeline_steps s ON s.run_id = r.id
GROUP BY r.id, r.steps_completed, r.steps_failed
HAVING r.steps_completed != COUNT(*) FILTER (WHERE s.status = 'completed')
    OR r.steps_failed    != COUNT(*) FILTER (WHERE s.status = 'failed');

-- ─── 4. Inspect 81f36f07 specifically ────────────────────────────
SELECT
  id,
  status,
  step_count,
  steps_completed,
  steps_failed,
  LEFT(honest_summary, 250) AS honest_summary_preview
FROM season_pipeline_runs
WHERE id::text LIKE '81f36f07%';

-- ─── 5. Regenerate honest_summary via the reconcile route ────────
-- After running the SQL above, the counter columns are correct but
-- honest_summary still shows the stale text from the original (broken)
-- finalize. To regenerate, call from the running application:
--
--   POST /api/task-engine
--   { "action": "bs_season_pipeline_reconcile", "runId": "81f36f07-..." }
--
-- That re-runs finalizeRun with force=true, which rewrites honest_summary
-- using the now-correct counters AND the post-Phase-17.5.7 elapsed-time
-- formula (sum of step durations, not wall-clock since started_at).
