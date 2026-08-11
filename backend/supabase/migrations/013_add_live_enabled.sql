-- 013_add_live_enabled.sql
-- Admin-controlled flag: only accounts with live_enabled = TRUE can switch bots to live mode.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS live_enabled BOOLEAN NOT NULL DEFAULT FALSE;
