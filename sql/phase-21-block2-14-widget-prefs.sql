-- ════════════════════════════════════════════════════════════════════
-- Phase 21 Block 2.14 — Widget Gallery + Drawer + User Preferences
--
-- One table: season_user_preferences.
-- Per-user widget layout, mode default, animation/density settings.
-- Per-project layouts deferred to later block.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS season_user_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  project_id        UUID,                       -- NULL = global default; reserved for per-project later

  -- Widget layouts — ordered arrays of widget ids
  layout_casual     JSONB NOT NULL DEFAULT '[]'::JSONB,
  layout_pro_left   JSONB NOT NULL DEFAULT '[]'::JSONB,
  layout_pro_right  JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Hidden widget ids (across all modes)
  hidden_widgets    JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Saved RSS items (Manav's Pick "saved" set surfaces from project_feed_state already;
  -- this is the user-level cross-project saved list for the drawer Saved tab)
  saved_at_user_level JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Behavioral preferences
  reduce_motion     BOOLEAN NOT NULL DEFAULT FALSE,
  density           TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
  default_mode      TEXT NOT NULL DEFAULT 'casual' CHECK (default_mode IN ('casual', 'pro')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_season_user_prefs_user ON season_user_preferences(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_season_user_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_season_user_prefs_updated_at ON season_user_preferences;
CREATE TRIGGER trg_season_user_prefs_updated_at
  BEFORE UPDATE ON season_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_season_user_prefs_updated_at();
