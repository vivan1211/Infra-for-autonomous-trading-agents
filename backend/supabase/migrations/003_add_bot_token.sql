-- 003_add_bot_token.sql — Add bot_token column to agents table
-- Required for bot subprocess authentication via X-Bot-Token header

ALTER TABLE agents ADD COLUMN IF NOT EXISTS bot_token TEXT;
