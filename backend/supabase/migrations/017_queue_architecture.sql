-- Queue-based worker architecture: scheduling, lease management, config snapshots
-- ALL CHANGES ARE ADDITIVE — no existing columns modified or dropped

-- ── Scheduling + cycle state machine columns on user_agents ──
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_cycle_started_at TIMESTAMPTZ;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS cycle_lease_expires_at TIMESTAMPTZ;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS active_cycle_id UUID;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_completed_cycle_id UUID;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS config_snapshot_id UUID;

-- ── Immutable deployment config snapshots ──
-- Frozen at deploy time so workers run against stable config, not mutable user_agents.config_json
CREATE TABLE IF NOT EXISTS deployment_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_agent_id UUID NOT NULL REFERENCES user_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  config_json JSONB NOT NULL,
  rules_json JSONB NOT NULL,
  bot_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  capital_allocated NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_agent ON deployment_snapshots(user_agent_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON deployment_snapshots(user_id);
