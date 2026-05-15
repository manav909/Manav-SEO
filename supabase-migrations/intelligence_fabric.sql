-- ═══════════════════════════════════════════════════════════
-- intelligence_fabric.sql — GLOBAL intelligence layer
--
-- Tables created:
--   intelligence_outputs      — every AI analysis ever generated (full memory)
--   field_update_proposals    — protected-field changes awaiting user approval
--   intelligence_feedback     — outcome tracking per output (closes the loop)
--   intelligence_contradictions — detected disagreements between outputs
--
-- Run this in Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────
-- 1. Every AI output ever — the persistent memory layer
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_outputs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL,
  analysis_type        TEXT NOT NULL,    -- 'persona' | 'audit' | 'strategy' | 'deep_dive' | 'agenda' | 'market_research' | 'brain_chat' | 'cross_project_patterns' | 'goal_plan' | 'deep_learn'
  title                TEXT,
  summary              TEXT,             -- short human-readable abstract
  output               JSONB NOT NULL,   -- the full output
  sources_used         JSONB,            -- [{ source: 'manual_user'|'gsc_live'|'claude_inference'|..., confidence: int, weight: int, label: text }]
  weighted_confidence  INTEGER,          -- 0-100, computed from sources_used
  source_breakdown     JSONB,            -- e.g. { provided: 8, assumed: 2, live_fetched: 3, learnings_used: 12 }
  model_used           TEXT,             -- e.g. 'claude-sonnet-4-6'
  input_fingerprint    TEXT,             -- hash of inputs — for dedupe/cache
  status               TEXT DEFAULT 'active',  -- 'active' | 'superseded' | 'archived'
  superseded_by        UUID REFERENCES intelligence_outputs(id) ON DELETE SET NULL,
  generated_at         TIMESTAMPTZ DEFAULT now(),
  viewed_at            TIMESTAMPTZ,
  last_referenced_at   TIMESTAMPTZ,
  created_by           TEXT DEFAULT 'system',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_io_project_type ON intelligence_outputs(project_id, analysis_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_io_status        ON intelligence_outputs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_io_confidence    ON intelligence_outputs(weighted_confidence);
CREATE INDEX IF NOT EXISTS idx_io_fingerprint   ON intelligence_outputs(input_fingerprint);

-- ──────────────────────────────────────────────────────────
-- 2. Protected-field updates → require user approval
--    Hard-data NEVER gets overwritten silently
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_update_proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL,
  field_path        TEXT NOT NULL,     -- 'project.industry' | 'goals.primary' | 'metrics.llm_visibility_score' | 'comments.client_question'
  field_category    TEXT NOT NULL,     -- 'project_core' | 'goals' | 'metrics' | 'competitors' | 'comments'
  current_value     TEXT,
  proposed_value    TEXT NOT NULL,
  proposed_by       TEXT NOT NULL,     -- 'claude_inference' | 'audit_run' | 'market_research' | 'deep_learn' | 'brain_chat'
  proposer_confidence INTEGER NOT NULL CHECK (proposer_confidence BETWEEN 0 AND 100),
  reasoning         TEXT,
  source_output_id  UUID REFERENCES intelligence_outputs(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected' | 'expired'
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,
  review_note       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  expires_at        TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_fup_project_status ON field_update_proposals(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fup_field          ON field_update_proposals(field_path);

-- ──────────────────────────────────────────────────────────
-- 3. Outcome feedback — closes the learning loop
--    "This learning was applied. Did it work?"
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_feedback (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_output_id   UUID REFERENCES intelligence_outputs(id) ON DELETE CASCADE,
  brain_learning_id        UUID,     -- optional FK to brain_learnings if applicable
  project_id               UUID NOT NULL,
  feedback_type            TEXT NOT NULL,  -- 'helpful' | 'wrong' | 'applied' | 'led_to_outcome' | 'contradicted'
  outcome_score            INTEGER,        -- -10 (made it worse) to +10 (clear win)
  notes                    TEXT,
  metric_before            JSONB,
  metric_after             JSONB,
  created_by               TEXT DEFAULT 'user',
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_if_output  ON intelligence_feedback(intelligence_output_id);
CREATE INDEX IF NOT EXISTS idx_if_project ON intelligence_feedback(project_id, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- 4. Contradiction registry — when outputs disagree with each other
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_contradictions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID NOT NULL,
  output_a_id            UUID REFERENCES intelligence_outputs(id) ON DELETE CASCADE,
  output_b_id            UUID REFERENCES intelligence_outputs(id) ON DELETE CASCADE,
  contradiction_summary  TEXT NOT NULL,
  detected_by            TEXT,            -- 'auto_diff' | 'deep_learn' | 'user_flag'
  severity               TEXT DEFAULT 'medium',  -- 'low' | 'medium' | 'high'
  status                 TEXT DEFAULT 'open',     -- 'open' | 'resolved' | 'ignored'
  resolution_note        TEXT,
  resolved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_project_status ON intelligence_contradictions(project_id, status);

-- ──────────────────────────────────────────────────────────
-- 5. Touch updated_at trigger
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_io_touch ON intelligence_outputs;
CREATE TRIGGER trg_io_touch BEFORE UPDATE ON intelligence_outputs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ──────────────────────────────────────────────────────────
-- 6. Verification queries (run these after migration)
-- ──────────────────────────────────────────────────────────
-- SELECT count(*) FROM intelligence_outputs;       -- should return 0
-- SELECT count(*) FROM field_update_proposals;     -- should return 0
-- SELECT count(*) FROM intelligence_feedback;      -- should return 0
-- SELECT count(*) FROM intelligence_contradictions;-- should return 0
