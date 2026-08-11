-- Add per-credential salt column for v3 encryption
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS salt TEXT;
