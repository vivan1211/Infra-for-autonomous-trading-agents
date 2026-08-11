-- 025_signup_fields.sql
-- Add linkedin_url and agreement_accepted_at to user_profiles for new signup flow.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ;

-- Existing users implicitly accepted terms by using the platform
UPDATE user_profiles
  SET agreement_accepted_at = created_at
  WHERE agreement_accepted_at IS NULL AND onboarding_completed = TRUE;
