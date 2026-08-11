-- 012_add_avatar_and_onboarding.sql
-- Add avatar and onboarding tracking to user_profiles.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark all existing users as onboarded so they aren't forced through the wizard
UPDATE user_profiles SET onboarding_completed = TRUE;
