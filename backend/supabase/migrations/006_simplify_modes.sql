-- Migration 006: Simplify trading mode system
-- - Rename mode 'paper' → 'training' in user_agents
-- - Remove credentials.environment column (one API key per user, not demo/live split)
-- - Add CHECK constraint on mode column for safety

-- 1. Rename mode 'paper' → 'training' in user_agents
UPDATE user_agents SET mode = 'training' WHERE mode = 'paper';
ALTER TABLE user_agents ALTER COLUMN mode SET DEFAULT 'training';

-- 2. Add CHECK constraint to enforce only valid mode values
ALTER TABLE user_agents ADD CONSTRAINT user_agents_mode_check CHECK (mode IN ('training', 'live'));

-- 3. Remove environment from credentials unique constraint
-- (The constraint name varies — try both possible names)
ALTER TABLE credentials DROP CONSTRAINT IF EXISTS credentials_user_id_provider_key_type_environment_key;
ALTER TABLE credentials DROP CONSTRAINT IF EXISTS credentials_user_provider_keytype_env_unique;

-- 4. For users with both demo and live keys: keep live, delete demo
DELETE FROM credentials c1
WHERE COALESCE(c1.environment, 'demo') = 'demo'
AND EXISTS (
    SELECT 1 FROM credentials c2
    WHERE c2.user_id = c1.user_id
    AND c2.provider = c1.provider
    AND c2.key_type = c1.key_type
    AND COALESCE(c2.environment, 'demo') = 'live'
);

-- 5. Add new unique constraint without environment
ALTER TABLE credentials ADD CONSTRAINT credentials_user_provider_keytype_unique
    UNIQUE(user_id, provider, key_type);

-- 6. Drop environment column from credentials
ALTER TABLE credentials DROP COLUMN IF EXISTS environment;

-- 7. Update handle_new_user trigger to use 'training' default
-- (The trigger inserts user_agents which now defaults to 'training' via ALTER above)
