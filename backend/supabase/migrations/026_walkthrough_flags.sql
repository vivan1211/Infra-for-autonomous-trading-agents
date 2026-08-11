-- 026_walkthrough_flags.sql
-- Add gated onboarding flags to user_profiles.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_walkthrough BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: existing onboarded users are approved but haven't done new walkthrough
UPDATE user_profiles
  SET is_approved = TRUE
  WHERE onboarding_completed = TRUE;
