-- Add key_version column for credential encryption versioning.
-- v1 = legacy SHA256 key derivation, v2 = PBKDF2-HMAC-SHA256 (100K iterations).
-- Existing credentials default to v1; re-encryption to v2 happens on backend startup.
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS key_version SMALLINT NOT NULL DEFAULT 1;
