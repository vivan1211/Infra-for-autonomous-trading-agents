/**
 * Demo data fixtures for the walkthrough tour.
 * These are returned by hooks when demoMode is active,
 * so the user sees realistic data even with no real trades.
 */

import type { Agent, Trade, Portfolio, PortfolioSnapshot, KalshiBalance, BotType } from "@/lib/api";
import type { SignalCard, PipelineStats } from "@/hooks/use-signal-cards";
import type { WebSocketMessage } from "@/lib/websocket";

/* ── Agents ────────────────────────────────────────────────────── */

export const DEMO_AGENTS: Agent[] = [
  {
    id: "demo-agent-1",
    bot_type_id: "ensemble-5",
    name: "Council of Models",
    description: "6 AI agents debate every trade",
    strategy: "ensemble-5",
    llms: "Grok, Claude, GPT, Gemini, DeepSeek",
    status: "running",
    mode: "actual",
    capital_allocated: 5000,
    capital_used: 2150,
    total_pnl: 847.32,
    trade_count: 42,
    win_count: 28,
    settled_count: 38,
    started_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    exchange: "kalshi",
  },
  {
    id: "demo-agent-2",
    bot_type_id: "superforecaster",
    name: "Superforecaster",
    description: "Research-first prediction agent",
    strategy: "superforecaster",
    llms: "Perplexity, Claude",
    status: "running",
    mode: "training",
    capital_allocated: 3000,
    capital_used: 980,
    total_pnl: 312.18,
    trade_count: 23,
    win_count: 15,
    settled_count: 20,
    started_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    exchange: "kalshi",
  },
  {
    id: "demo-agent-3",
    bot_type_id: "superforecaster-polymarket",
    name: "Superforecaster PM",
    description: "Research-first, Polymarket",
    strategy: "superforecaster-polymarket",
    llms: "Perplexity, GPT",
    status: "stopped",
    mode: "actual",
    capital_allocated: 2000,
    capital_used: 0,
    total_pnl: -89.50,
    trade_count: 11,
    win_count: 5,
    settled_count: 11,
    started_at: undefined,
    created_at: new Date(Date.now() - 21 * 86400000).toISOString(),
    exchange: "polymarket",
  },
];

/* ── Bot Types (for strategy page) ─────────────────────────────── */

export const DEMO_BOT_TYPES: BotType[] = [
  {
    id: "ensemble-5",
    name: "Council of Models",
    full_name: "Council of Models (Kalshi)",
    description: "6 AI agents debate every trade — Bull and Bear argue, Risk Manager runs the math, Trader only acts when 3+ agents agree.",
    strategy: "ensemble-5",
    llms: "Grok, Claude, GPT, Gemini, DeepSeek",
    exchange: "kalshi",
    accent_color: "#4ade80",
    bg_tint: "#7de964",
  },
  {
    id: "superforecaster",
    name: "Superforecaster",
    full_name: "Superforecaster (Kalshi)",
    description: "Perplexity researches the web, then a single reasoning model decomposes questions into sub-questions with base rates.",
    strategy: "superforecaster",
    llms: "Perplexity, Claude",
    exchange: "kalshi",
    accent_color: "#60a5fa",
    bg_tint: "#3b82f6",
  },
  {
    id: "superforecaster-polymarket",
    name: "Superforecaster PM",
    full_name: "Superforecaster (Polymarket)",
    description: "Research-first prediction agent trading on Polymarket via CLOB with EIP-712 signed orders.",
    strategy: "superforecaster-polymarket",
    llms: "Perplexity, GPT",
    exchange: "polymarket",
    accent_color: "#a78bfa",
    bg_tint: "#8b5cf6",
  },
  {
    id: "ensemble-5-polymarket",
    name: "Council PM",
    full_name: "Council of Models (Polymarket)",
    description: "6-agent adversarial debate on Polymarket with EIP-712 signed orders on the Polygon blockchain.",
    strategy: "ensemble-5-polymarket",
    llms: "Grok, Claude, GPT, Gemini, DeepSeek",
    exchange: "polymarket",
    accent_color: "#f97316",
    bg_tint: "#fb923c",
  },
];

/* ── Portfolio ─────────────────────────────────────────────────── */

export const DEMO_PORTFOLIO: Portfolio = {
  total_value: 12450,
  daily_pnl: 156.82,
  total_pnl: 1070.00,
  agent_count: 3,
  active_agents: 2,
  trade_count: 76,
  win_rate: 63.2,
  open_positions: 5,
};

/* ── Balance ───────────────────────────────────────────────────── */

export const DEMO_BALANCE: KalshiBalance = {
  balance: 7320,
  portfolio_value: 5130,
  connected: true,
  exchanges: {
    kalshi: { balance: 5820, portfolio_value: 4150, connected: true },
    polymarket: { balance: 1500, portfolio_value: 980, connected: true },
  },
};

/* ── Snapshots (30-day equity curve) ───────────────────────────── */

function generateSnapshots(): PortfolioSnapshot[] {
  const now = Date.now();
  const snapshots: PortfolioSnapshot[] = [];
  let value = 10000;

  for (let i = 30; i >= 0; i--) {
    const change = (Math.random() - 0.42) * 120; // Slight upward bias
    value = Math.max(value + change, 8000);
    const date = new Date(now - i * 86400000);
    snapshots.push({
      timestamp: date.toISOString(),
      total_value: Math.round(value * 100) / 100,
      cash_balance: Math.round((value * 0.58) * 100) / 100,
      positions_value: Math.round((value * 0.42) * 100) / 100,
      daily_pnl: Math.round(change * 100) / 100,
    });
  }

  // Ensure last snapshot matches demo portfolio
  snapshots[snapshots.length - 1]!.total_value = DEMO_PORTFOLIO.total_value;
  snapshots[snapshots.length - 1]!.daily_pnl = DEMO_PORTFOLIO.daily_pnl;

  return snapshots;
}

export const DEMO_SNAPSHOTS = generateSnapshots();

/* ── Portfolio Stats ───────────────────────────────────────────── */

export const DEMO_PORTFOLIO_STATS = {
  best_day: { pnl: 412.50, date: new Date(Date.now() - 5 * 86400000).toISOString().split("T")[0]! },
  worst_day: { pnl: -187.30, date: new Date(Date.now() - 12 * 86400000).toISOString().split("T")[0]! },
  trade_histogram: Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const total = 3 + Math.floor(Math.random() * 6);
    const approved = Math.ceil(total * 0.6);
    const skipped = Math.floor(total * 0.25);
    const rejected = total - approved - skipped;
    return {
      date: d.toISOString().split("T")[0]!,
      count: total,
      approved,
      skipped: Math.max(0, skipped),
      rejected: Math.max(0, rejected),
    };
  }),
  open_positions: [
    {
      id: "pos-1",
      agent_id: "demo-agent-1",
      agent_name: "Council of Models",
      market_ticker: "FED-RATE-CUT-JUN",
      market_title: "Will the Fed cut rates in June 2026?",
      side: "YES",
      total_cost: 450,
      confidence: 0.72,
      pnl: 85.20,
      price: 0.62,
      current_price: 0.71,
      current_price_at: "2026-05-28T04:30:00Z",
      unrealized_pnl: 0.45,
      market_close_time: "2026-06-15T00:00:00Z",
      count: 5,
      category: "Economics",
    },
    {
      id: "pos-2",
      agent_id: "demo-agent-1",
      agent_name: "Council of Models",
      market_ticker: "BTC-100K-APR",
      market_title: "Will Bitcoin reach $100k by April?",
      side: "NO",
      total_cost: 320,
      confidence: 0.65,
      pnl: -42.10,
      price: 0.38,
      current_price: 0.31,
      current_price_at: "2026-05-28T04:30:00Z",
      unrealized_pnl: -0.56,
      market_close_time: "2026-06-02T00:00:00Z",
      count: 8,
      category: "Crypto",
    },
    {
      id: "pos-3",
      agent_id: "demo-agent-2",
      agent_name: "Superforecaster",
      market_ticker: "SCOTUS-TERM-RULING",
      market_title: "Will SCOTUS rule on tech regulation this term?",
      side: "YES",
      total_cost: 280,
      confidence: 0.81,
      pnl: 124.50,
      price: 0.71,
      current_price: 0.83,
      current_price_at: "2026-05-28T04:30:00Z",
      unrealized_pnl: 0.48,
      market_close_time: "2026-05-30T00:00:00Z",
      count: 4,
      category: "Politics",
    },
    {
      id: "pos-4",
      agent_id: "demo-agent-2",
      agent_name: "Superforecaster",
      market_ticker: "GDP-Q2-GROWTH",
      market_title: "Will Q2 GDP growth exceed 2.5%?",
      side: "YES",
      total_cost: 180,
      confidence: 0.58,
      pnl: 22.80,
      price: 0.55,
      current_price: 0.50,
      current_price_at: "2026-05-28T04:30:00Z",
      unrealized_pnl: -0.15,
      market_close_time: "2026-09-01T00:00:00Z",
      count: 3,
      category: "Economics",
    },
    {
      id: "pos-5",
      agent_id: "demo-agent-1",
      agent_name: "Council of Models",
      market_ticker: "SPACEX-LAUNCH-APR",
      market_title: "Will SpaceX launch Starship in April?",
      side: "YES",
      total_cost: 200,
      confidence: 0.69,
      pnl: 15.40,
      price: 0.73,
      current_price: 0.81,
      current_price_at: "2026-05-28T04:30:00Z",
      unrealized_pnl: 0.24,
      market_close_time: "2026-05-29T12:00:00Z",
      count: 3,
      category: "Tech",
    },
  ],
  settled_count: 3,
  settled_positions: [
    {
      id: "settled-1",
      agent_id: "demo-agent-1",
      agent_name: "Council of Models",
      market_ticker: "AAPL-EARNINGS-Q1",
      market_title: "Will Apple beat Q1 earnings estimates?",
      side: "YES",
      total_cost: 350,
      confidence: 0.74,
      pnl: 142.50,
      price: 0.65,
      count: 5,
      category: "Tech",
      timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
      settled_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: "settled-2",
      agent_id: "demo-agent-2",
      agent_name: "Superforecaster",
      market_ticker: "INFLATION-MAR",
      market_title: "Will March CPI exceed 3.5%?",
      side: "NO",
      total_cost: 200,
      confidence: 0.68,
      pnl: -87.30,
      price: 0.42,
      count: 4,
      category: "Economics",
      timestamp: new Date(Date.now() - 5 * 86400000).toISOString(),
      settled_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "settled-3",
      agent_id: "demo-agent-1",
      agent_name: "Council of Models",
      market_ticker: "NFLX-SUBS-Q1",
      market_title: "Will Netflix add 5M+ subscribers in Q1?",
      side: "YES",
      total_cost: 275,
      confidence: 0.61,
      pnl: 98.20,
      price: 0.58,
      count: 6,
      category: "Tech",
      timestamp: new Date(Date.now() - 7 * 86400000).toISOString(),
      settled_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
  ],
};

/* ── Trades ─────────────────────────────────────────────────────── */

const DEMO_MARKET_TITLES = [
  "Will the Fed cut rates in June 2026?",
  "Will Bitcoin reach $100k by April?",
  "Will SCOTUS rule on tech regulation this term?",
  "Will Q2 GDP growth exceed 2.5%?",
  "Will SpaceX launch Starship in April?",
  "Will unemployment drop below 3.5%?",
  "Will AI chip exports be restricted further?",
  "Will the S&P 500 hit 6000 by July?",
  "Will a Category 5 hurricane hit the US in 2026?",
  "Will Tesla stock exceed $300 by June?",
];

/* ── Structured debate JSON for the first demo trade ───────────── */

const DEMO_DEBATE_JSON = JSON.stringify({
  forecaster: {
    probability: 0.72,
    confidence: 0.68,
    action: "buy",
    side: "YES",
    reasoning: "Base rate analysis shows similar economic conditions have resolved YES 68% of the time historically. Current leading indicators — PMI at 52.4, consumer confidence trending up, and unemployment claims declining — all support a YES outcome. The market is pricing this at 0.58, which represents a significant edge.",
    _model: "claude-sonnet-4-20250514",
    _elapsed: "4.2",
  },
  bull_researcher: {
    probability: 0.78,
    confidence: 0.72,
    action: "buy",
    side: "YES",
    reasoning: "Strong macro tailwinds support YES. GDP growth revised upward to 2.8%, corporate earnings beating expectations by 7% on average. The Fed's dovish pivot signals continued accommodation. Key catalysts ahead include next week's jobs report which consensus expects to be strong.",
    key_arguments: ["GDP growth revised up to 2.8%", "Corporate earnings beat by 7%", "Fed dovish pivot supports risk assets"],
    _model: "gpt-4o",
    _elapsed: "3.8",
  },
  bear_researcher: {
    probability: 0.45,
    confidence: 0.61,
    action: "sell",
    side: "NO",
    reasoning: "Caution warranted despite surface-level optimism. Credit spreads have widened 15bps in the last week, historically a leading indicator of reversals. Geopolitical risks remain elevated with ongoing trade negotiations. The VIX is suppressed but options skew suggests hedging activity is increasing.",
    key_arguments: ["Credit spreads widening 15bps", "Geopolitical risk from trade negotiations", "Options skew showing increased hedging"],
    _model: "gemini-2.5-pro",
    _elapsed: "3.5",
  },
  risk_manager: {
    probability: 0.65,
    confidence: 0.70,
    risk_score: 3.2,
    reasoning: "Position sizing within limits. EV calculation: (0.72 * $1.00 - 0.28 * $0.58) / $0.58 = +0.96 expected return per dollar risked. Risk score 3.2/10 — acceptable. Correlation with existing portfolio positions is low (r=0.12). Recommend standard position size.",
    _model: "claude-sonnet-4-20250514",
    _elapsed: "1.9",
  },
  trader: {
    probability: 0.70,
    confidence: 0.74,
    action: "buy",
    side: "YES",
    reasoning: "4/5 agents agree on YES with weighted probability of 0.70. The bull case is compelling with strong macro data, and the bear concerns about credit spreads are noted but not yet confirmed by price action. Executing a standard-size BUY YES at 0.58 with a target of 0.75+.",
    _model: "grok-3",
    _elapsed: "2.1",
  },
});

export const DEMO_TRADES: Trade[] = Array.from({ length: 15 }, (_, i) => {
  const isWin = i === 0 ? true : Math.random() > 0.37;
  const agentIdx = i % 3;
  const agent = DEMO_AGENTS[agentIdx]!;
  const marketTitle = DEMO_MARKET_TITLES[i % DEMO_MARKET_TITLES.length]!;
  const ticker = marketTitle.replace(/[^A-Z]/gi, "").slice(0, 12).toUpperCase() + "-" + (i + 1);
  const side = i === 0 ? "YES" : (Math.random() > 0.5 ? "YES" : "NO");
  const price = i === 0 ? 0.58 : 0.3 + Math.random() * 0.5;
  const count = i === 0 ? 5 : 2 + Math.floor(Math.random() * 8);
  const cost = Math.round(price * count * 100) / 100;
  const pnl = isWin
    ? Math.round((Math.random() * 150 + 20) * 100) / 100
    : -Math.round((Math.random() * 80 + 10) * 100) / 100;

  return {
    id: `demo-trade-${i + 1}`,
    agent_id: agent.id,
    timestamp: new Date(Date.now() - i * 4 * 3600000).toISOString(),
    market_ticker: ticker,
    market_title: marketTitle,
    category: ["Economics", "Crypto", "Politics", "Tech", "Markets"][i % 5],
    side,
    action: "buy",
    count,
    price: Math.round(price * 100) / 100,
    total_cost: cost,
    confidence: i === 0 ? 0.74 : 0.55 + Math.random() * 0.35,
    bot_reasoning: `The council analyzed ${marketTitle.toLowerCase()} and determined a ${side} position based on current market data, news sentiment, and base rate analysis.`,
    raw_reasoning: i === 0
      ? `Council of Models analysis for "${marketTitle}"\n\n---DEBATE_RESULTS_JSON---\n${DEMO_DEBATE_JSON}`
      : undefined,
    rules_result: i === 0 ? "passed" : undefined,
    ai_verdict: i === 0 ? "APPROVE" : undefined,
    ai_reasoning: i === 0 ? "Trade meets all risk criteria. EV is positive, position size is within limits, and agent consensus is strong at 4/5." : undefined,
    status: i < 5 ? "executed" : isWin ? "executed" : "executed",
    exchange: agent.exchange,
    model: agent.llms?.split(", ")[0],
    pnl: i < 5 ? null : pnl,
    current_price: i < 5 ? Math.round(Math.min(0.97, Math.max(0.03, price + (i % 2 ? 0.06 : -0.05))) * 100) / 100 : null,
    unrealized_pnl: i < 5 ? Math.round(((i % 2 ? 0.06 : -0.05) * count) * 100) / 100 : null,
    market_close_time: new Date(Date.now() + ((i % 6) + 1) * 86400000).toISOString(),
    settled: i >= 5,
    environment: agent.mode === "training" ? "training" : "actual",
  } as Trade;
});

/* ── Agent Metrics ─────────────────────────────────────────────── */

export const DEMO_AGENT_METRICS: Record<
  string,
  { agent_id: string; avg_confidence: number; best_category: string; categories: Array<{ name: string; trades: number; pnl: number }>; trades_today: number }
> = {
  "demo-agent-1": {
    agent_id: "demo-agent-1",
    avg_confidence: 0.71,
    best_category: "Economics",
    categories: [
      { name: "Economics", trades: 18, pnl: 420.50 },
      { name: "Politics", trades: 12, pnl: 185.20 },
      { name: "Crypto", trades: 8, pnl: -42.10 },
      { name: "Tech", trades: 4, pnl: 283.72 },
    ],
    trades_today: 3,
  },
  "demo-agent-2": {
    agent_id: "demo-agent-2",
    avg_confidence: 0.68,
    best_category: "Politics",
    categories: [
      { name: "Politics", trades: 10, pnl: 195.80 },
      { name: "Economics", trades: 8, pnl: 88.38 },
      { name: "Markets", trades: 5, pnl: 28.00 },
    ],
    trades_today: 2,
  },
  "demo-agent-3": {
    agent_id: "demo-agent-3",
    avg_confidence: 0.59,
    best_category: "Tech",
    categories: [
      { name: "Tech", trades: 5, pnl: 42.30 },
      { name: "Crypto", trades: 4, pnl: -95.80 },
      { name: "Markets", trades: 2, pnl: -36.00 },
    ],
    trades_today: 0,
  },
};

/* ── WebSocket / Terminal Messages ──────────────────────────────── */

export const DEMO_WS_MESSAGES: WebSocketMessage[] = [
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "Scanning 47 eligible markets on Kalshi...", timestamp: new Date(Date.now() - 120000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "Filtering: 12 markets passed initial criteria", timestamp: new Date(Date.now() - 110000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "Debating: FED-RATE-CUT-JUN — Will the Fed cut rates in June?", timestamp: new Date(Date.now() - 95000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "[Bull] Strong CPI data supports a June cut. Confidence: 74%", timestamp: new Date(Date.now() - 90000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "[Bear] Labor market still tight. Not cutting until September. Confidence: 31%", timestamp: new Date(Date.now() - 85000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "[Risk Manager] EV positive at current price. Kelly fraction: 0.12", timestamp: new Date(Date.now() - 80000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "trade", message: "EXECUTED: BUY 5x YES @ $0.62 on FED-RATE-CUT-JUN ($3.10 total)", timestamp: new Date(Date.now() - 70000).toISOString() },
  { type: "log", agent_id: "demo-agent-2", level: "info", message: "Scanning 35 eligible markets...", timestamp: new Date(Date.now() - 60000).toISOString() },
  { type: "log", agent_id: "demo-agent-2", level: "info", message: "Researching via Perplexity: SCOTUS-TERM-RULING", timestamp: new Date(Date.now() - 50000).toISOString() },
  { type: "log", agent_id: "demo-agent-2", level: "info", message: "Decomposing into sub-questions: 3 identified with base rates", timestamp: new Date(Date.now() - 45000).toISOString() },
  { type: "log", agent_id: "demo-agent-2", level: "info", message: "Calibrated probability: 71% (inside view 68%, outside view 74%)", timestamp: new Date(Date.now() - 40000).toISOString() },
  { type: "log", agent_id: "demo-agent-2", level: "trade", message: "EXECUTED: BUY 4x YES @ $0.71 on SCOTUS-TERM-RULING ($2.84 total)", timestamp: new Date(Date.now() - 35000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "Debating: BTC-100K-APR — Will Bitcoin reach $100k by April?", timestamp: new Date(Date.now() - 25000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "warning", message: "Risk rule triggered: daily loss limit approaching (87% used)", timestamp: new Date(Date.now() - 20000).toISOString() },
  { type: "log", agent_id: "demo-agent-1", level: "info", message: "SKIPPED: BTC-100K-APR — confidence below threshold (52% < 55%)", timestamp: new Date(Date.now() - 15000).toISOString() },
  { type: "status", agent_id: "demo-agent-1", status: "running", message: "Agent healthy, 42 trades placed" },
  { type: "status", agent_id: "demo-agent-2", status: "running", message: "Agent healthy, 23 trades placed" },
];

/* ── Signal Cards ──────────────────────────────────────────────── */

export const DEMO_SIGNAL_CARDS: SignalCard[] = [
  {
    id: "sig-1",
    ticker: "FED-RATE-CUT-JUN",
    marketTitle: "Will the Fed cut rates in June?",
    agentId: "demo-agent-1",
    stage: "exec",
    status: "passed",
    side: "YES",
    confidence: 0.72,
    edge: 0.10,
    amount: 3.10,
    environment: "actual",
    timestamps: { scan: Date.now() - 120000, filter: Date.now() - 100000, debate: Date.now() - 80000, rules: Date.now() - 75000, queue: Date.now() - 72000, exec: Date.now() - 70000 },
    lastUpdate: Date.now() - 70000,
  },
  {
    id: "sig-2",
    ticker: "SCOTUS-TERM-RULING",
    marketTitle: "Will SCOTUS rule on tech regulation?",
    agentId: "demo-agent-2",
    stage: "exec",
    status: "passed",
    side: "YES",
    confidence: 0.81,
    edge: 0.10,
    amount: 2.84,
    environment: "actual",
    timestamps: { scan: Date.now() - 60000, filter: Date.now() - 55000, debate: Date.now() - 45000, rules: Date.now() - 40000, queue: Date.now() - 37000, exec: Date.now() - 35000 },
    lastUpdate: Date.now() - 35000,
  },
  {
    id: "sig-3",
    ticker: "BTC-100K-APR",
    marketTitle: "Will Bitcoin reach $100k by April?",
    agentId: "demo-agent-1",
    stage: "rules",
    status: "killed",
    killReason: "Confidence below threshold (52% < 55%)",
    side: "YES",
    confidence: 0.52,
    timestamps: { scan: Date.now() - 25000, filter: Date.now() - 22000, debate: Date.now() - 18000, rules: Date.now() - 15000 },
    lastUpdate: Date.now() - 15000,
  },
  {
    id: "sig-4",
    ticker: "GDP-Q2-GROWTH",
    marketTitle: "Will Q2 GDP growth exceed 2.5%?",
    agentId: "demo-agent-2",
    stage: "debate",
    status: "active",
    side: "YES",
    confidence: 0.58,
    timestamps: { scan: Date.now() - 8000, filter: Date.now() - 5000, debate: Date.now() - 2000 },
    lastUpdate: Date.now() - 2000,
    snippet: "Analyzing latest BLS employment data and PMI surveys...",
  },
  {
    id: "sig-5",
    ticker: "SPACEX-LAUNCH-APR",
    marketTitle: "Will SpaceX launch Starship in April?",
    agentId: "demo-agent-1",
    stage: "filter",
    status: "active",
    timestamps: { scan: Date.now() - 3000, filter: Date.now() - 1000 },
    lastUpdate: Date.now() - 1000,
  },
];

export const DEMO_SIGNAL_STATS: PipelineStats = {
  scanned: 47,
  filtered: 12,
  debated: 5,
  approved: 3,
  executed: 2,
  killed: 1,
};
