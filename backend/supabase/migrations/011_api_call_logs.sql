-- API call logs: persist LLM prompts + responses for each agent role per trade
CREATE TABLE IF NOT EXISTS api_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    agent_id UUID REFERENCES user_agents(id),
    trade_id UUID REFERENCES trades(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    model TEXT NOT NULL,
    role TEXT,  -- forecaster, bull_researcher, bear_researcher, news_analyst, risk_manager, trader
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    tokens_used INTEGER,
    cost_usd NUMERIC,
    market_ticker TEXT,
    environment TEXT DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS api_call_logs_user_idx ON api_call_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS api_call_logs_agent_idx ON api_call_logs(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS api_call_logs_market_idx ON api_call_logs(market_ticker, timestamp DESC);

-- RLS
ALTER TABLE api_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own api_call_logs"
    ON api_call_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert api_call_logs"
    ON api_call_logs FOR INSERT
    WITH CHECK (true);
