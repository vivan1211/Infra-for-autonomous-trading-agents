-- 036: Bump daily_api_budget default 50.00 → 300.00
--
-- Context: Council V2 runs `perplexity/sonar-deep-research` for its research
-- phase with max_tokens=8000. A single 10-market cycle can cost $0.10-$0.30
-- depending on market complexity; at high cycle frequency this routinely
-- exceeds the old $50 daily cap in minutes. The $300 default matches a realistic
-- ceiling for a moderately active user running 1-3 bots continuously.
--
-- This migration does TWO things:
--
-- 1. Changes the `rules.daily_api_budget` column DEFAULT from 50.00 → 300.00.
--    This affects brand-new users whose rules row is inserted by the
--    handle_new_user() trigger (`schema.sql:446`). Existing users are NOT
--    affected by a DEFAULT change — their row already has a concrete value.
--
-- 2. Gently migrates EXISTING users who have never touched their rules row.
--    The heuristic: if `rules.updated_at` is within 5 minutes of the user's
--    creation time, the user has never modified their rules via the Settings
--    UI (which explicitly sets `updated_at = NOW()` in `rules.py:103`). Those
--    users are on the implicit default and should inherit the new default.
--
--    Users who have explicitly set daily_api_budget to 50 via Settings (or
--    any other value) are untouched — their deliberate choice is preserved.
--
-- Idempotent: re-running the ALTER is safe (same default); re-running the
-- UPDATE only hits rows still at 50.00, which after the first run will be
-- zero unless a new user just signed up under the old default during the
-- deploy window.

-- Step 1: change the column default (affects new signups only)
ALTER TABLE rules ALTER COLUMN daily_api_budget SET DEFAULT 300.00;

-- Step 2: gentle backfill for existing users who never customized their rules
-- The join to auth.users via `rules.user_id` should return exactly one row
-- per rules row (rules.user_id is UNIQUE + FK to auth.users.id).
UPDATE rules
SET daily_api_budget = 300.00
WHERE daily_api_budget = 50.00
  AND updated_at <= (
    SELECT created_at + INTERVAL '5 minutes'
    FROM auth.users
    WHERE auth.users.id = rules.user_id
  );
