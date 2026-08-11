-- 004_credential_environment_and_fixes.sql
-- Add environment column to credentials (separates demo vs live keys)
-- Add missing max_trades_per_market to rules
-- Fix credential encrypted_value/iv column types (BYTEA → TEXT for base64)

-- Credential environment separation (demo vs live keys no longer overwrite each other)
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'demo';

-- Missing rules column referenced in orchestrator
ALTER TABLE rules ADD COLUMN IF NOT EXISTS max_trades_per_market INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS cooldown_hours INTEGER NOT NULL DEFAULT 0;

-- Fix credential column types: app writes base64 TEXT, not raw BYTEA
-- Only run if columns are currently BYTEA (safe to skip if already TEXT)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'credentials' AND column_name = 'encrypted_value' AND data_type = 'bytea'
    ) THEN
        ALTER TABLE credentials ALTER COLUMN encrypted_value TYPE TEXT USING encode(encrypted_value, 'base64');
        ALTER TABLE credentials ALTER COLUMN iv TYPE TEXT USING encode(iv, 'base64');
    END IF;
END $$;
