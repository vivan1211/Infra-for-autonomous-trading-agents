-- Fix: Change allowed_categories default to [] (empty = all categories allowed).
-- The old default was a hardcoded list that missed categories like "Other", "Weather", "Tech",
-- causing trades to be rejected even when the user selected "all categories".

-- Update existing rows that have the old hardcoded default to [] (= no filtering)
UPDATE rules
SET allowed_categories = '[]'::jsonb
WHERE allowed_categories = '["Politics","Economics","Crypto","Sports","Climate","Entertainment"]'::jsonb;

-- Change column default for new rows
ALTER TABLE rules ALTER COLUMN allowed_categories SET DEFAULT '[]'::jsonb;
