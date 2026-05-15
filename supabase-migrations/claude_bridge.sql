-- ═══════════════════════════════════════════════════════════
-- claude_bridge.sql — communication channel between Claude Code
-- (this CLI assistant working in your terminal) and Claude Chat
-- (the web Claude). One table, append-only with read-tracking.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS claude_bridge (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL,                 -- 'dump' | 'message' | 'snapshot' | 'note' | 'request' | 'response'
  title        TEXT,                          -- short human-readable label
  body         TEXT,                          -- main payload (the actual content)
  metadata     JSONB DEFAULT '{}'::jsonb,     -- extra structured info (commit sha, file refs, etc.)
  created_by   TEXT NOT NULL DEFAULT 'unknown', -- 'claude_code' | 'claude_chat' | 'manav'
  in_reply_to  UUID REFERENCES claude_bridge(id) ON DELETE SET NULL,
  read_at      TIMESTAMPTZ,                   -- set when consumer marks it read
  read_by      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claude_bridge_created_at_idx ON claude_bridge(created_at DESC);
CREATE INDEX IF NOT EXISTS claude_bridge_kind_idx       ON claude_bridge(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS claude_bridge_unread_idx     ON claude_bridge(read_at) WHERE read_at IS NULL;

-- RLS is OFF on this table — auth is handled at the API layer via
-- BRIDGE_SECRET (write) and BRIDGE_READ_TOKEN (read).
ALTER TABLE claude_bridge DISABLE ROW LEVEL SECURITY;

-- Verify after running:
-- SELECT count(*) FROM claude_bridge;  -- should return 0 initially
