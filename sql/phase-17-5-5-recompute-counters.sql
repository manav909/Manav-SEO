-- Phase 17.5.5 — repair drifted pipeline run counters
--
-- After Phase 17.0-17.5 shipped, retryFromStep and retryStep were resetting
-- step rows to pending without DECREMENTING the run-level steps_completed
-- and steps_failed counters. So any run that was refreshed-from-audit ended
-- up with counters that drift past total step count.
--
-- Example: run 81f36f07 originally completed all 8 steps (steps_completed=8).
-- A refresh-from-audit reset 5 steps to pending. The runner then re-executed
-- and incremented steps_completed by 1 per success, ending up at 13/8 (or
-- whatever it ran before failing).
--
-- This script recomputes both counters from the actual step rows for every
-- run. It's idempotent — safe to run multiple times. After Phase 17.5.5 ships,
-- the runner does this automatically on every retry/retryFromStep, so this
-- one-time backfill is only needed for runs that were affected before the fix.
--
-- Apply in Supabase Dashboard → SQL Editor.

-- 1. Inspect which runs have drifted (steps_completed + steps_failed > step_count)
SELECT
  id,
  pipeline_type,
  status,
  step_count,
  steps_completed,
  steps_failed,
  (steps_completed + steps_failed) AS total_marked,
  (steps_completed + steps_failed - step_count) AS overshoot
FROM season_pipeline_runs
WHERE (steps_completed + steps_failed) > step_count
ORDER BY started_at DESC;

-- 2. Recompute counters from the actual step rows.
-- This is the same logic Phase 17.5.5 added to retryFromStep/retryStep.
UPDATE season_pipeline_runs r
SET
  steps_completed = COALESCE(c.completed_count, 0),
  steps_failed    = COALESCE(c.failed_count,    0)
FROM (
  SELECT
    run_id,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE status = 'failed')    AS failed_count
  FROM season_pipeline_steps
  GROUP BY run_id
) c
WHERE r.id = c.run_id
  AND (
       r.steps_completed <> COALESCE(c.completed_count, 0)
    OR r.steps_failed    <> COALESCE(c.failed_count,    0)
  );

-- 3. Confirm no run remains drifted (this should return 0 rows)
SELECT COUNT(*) AS still_drifted
FROM season_pipeline_runs
WHERE (steps_completed + steps_failed) > step_count;

-- 4. Specifically inspect 81f36f07 to confirm the fix landed there
SELECT
  id,
  status,
  step_count,
  steps_completed,
  steps_failed
FROM season_pipeline_runs
WHERE id::text LIKE '81f36f07%';
