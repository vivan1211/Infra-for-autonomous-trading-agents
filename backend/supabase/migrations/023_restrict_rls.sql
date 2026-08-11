-- Per-cycle bearer token hash for worker authentication.
-- Each bot cycle gets a unique token; only the SHA256 hash is stored.
ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS cycle_token_hash TEXT;

-- 023: RLS hardening — restrict user writes to safe columns only

-- 1. user_profiles: prevent users from changing live_enabled (admin-only field)
DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND live_enabled IS NOT DISTINCT FROM (SELECT live_enabled FROM user_profiles WHERE id = auth.uid())
  );

-- 2. user_agents: prevent users from writing backend-owned fields
DROP POLICY IF EXISTS user_agents_update ON user_agents;
CREATE POLICY user_agents_update ON user_agents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IS NOT DISTINCT FROM (SELECT ua.status FROM user_agents ua WHERE ua.id = user_agents.id)
    AND next_run_at IS NOT DISTINCT FROM (SELECT ua.next_run_at FROM user_agents ua WHERE ua.id = user_agents.id)
    AND active_cycle_id IS NOT DISTINCT FROM (SELECT ua.active_cycle_id FROM user_agents ua WHERE ua.id = user_agents.id)
    AND config_snapshot_id IS NOT DISTINCT FROM (SELECT ua.config_snapshot_id FROM user_agents ua WHERE ua.id = user_agents.id)
    AND cycle_lease_expires_at IS NOT DISTINCT FROM (SELECT ua.cycle_lease_expires_at FROM user_agents ua WHERE ua.id = user_agents.id)
    AND cycle_token_hash IS NOT DISTINCT FROM (SELECT ua.cycle_token_hash FROM user_agents ua WHERE ua.id = user_agents.id)
    AND mode IS NOT DISTINCT FROM (SELECT ua.mode FROM user_agents ua WHERE ua.id = user_agents.id)
  );

-- 3. deployment_snapshots: enable RLS (was completely unprotected)
ALTER TABLE deployment_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY snapshots_select ON deployment_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY snapshots_insert ON deployment_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
-- No UPDATE/DELETE — snapshots are immutable, backend creates them via service_role

-- 4. api_call_logs: explicit deny UPDATE/DELETE (already has SELECT + INSERT policies from migration 011)
CREATE POLICY "No user updates on api_call_logs" ON api_call_logs FOR UPDATE TO authenticated USING (false);
CREATE POLICY "No user deletes on api_call_logs" ON api_call_logs FOR DELETE TO authenticated USING (false);
