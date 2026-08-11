-- Performance indexes for settlement and portfolio queries
CREATE INDEX IF NOT EXISTS trades_settlement_idx ON trades(user_id, settled, status);
CREATE INDEX IF NOT EXISTS trades_settled_at_idx ON trades(settled_at);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_composite_idx ON portfolio_snapshots(user_id, environment, timestamp DESC);
