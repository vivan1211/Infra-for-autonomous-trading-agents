-- 042: Add trades.error_message to persist WHY an order failed.
--
-- Context: When a Polymarket order fails (e.g. HTTP 425 "order manager not ready"
-- during a matching-engine restart, or a terminal rejection), the worker reports
-- the error to /api/bot/execution-result, which sets trades.status='error'. But
-- the actual error string was only broadcast to the live WebSocket feed (and
-- Railway stdout) — it was NEVER persisted. Failed trades therefore carried no
-- queryable reason, and the new manual "Retry order" button has nothing to show.
--
-- This adds a nullable error_message column so the execution-result handler can
-- store the failure reason on the trade row. Populated only on status='error';
-- NULL for all successful/pending trades.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on re-run.

ALTER TABLE trades ADD COLUMN IF NOT EXISTS error_message TEXT;
