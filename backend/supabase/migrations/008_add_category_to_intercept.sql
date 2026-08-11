-- Add category column to intercept_queue so category filtering works
ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS category TEXT;
