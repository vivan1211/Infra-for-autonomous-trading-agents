-- 027_rls_protect_approval.sql
-- Protect is_approved from user self-modification (admin-only field).
-- completed_walkthrough is user-writable (set by frontend on tour completion).

DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND live_enabled IS NOT DISTINCT FROM (SELECT live_enabled FROM user_profiles WHERE id = auth.uid())
    AND is_approved IS NOT DISTINCT FROM (SELECT is_approved FROM user_profiles WHERE id = auth.uid())
  );
