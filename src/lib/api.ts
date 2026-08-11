/**
 * API client for the Prediction Market Agents backend.
 * All fetch calls go through this module for consistent error handling.
 * Uses Supabase JWT for authentication.
 */

import { createClient } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;
    if (!token) {
      console.warn('[api] No access token available — session:', session ? 'exists but no token' : 'null');
    }
    return token;
  } catch (e) {
    console.error('[api] getAccessToken error:', e);
    return null;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = await getAccessToken();

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401);
  }

  if (!res.ok) {
    const body = await res.text();
    let message = body || res.statusText;
    try {
      const parsed = JSON.parse(body);
      if (parsed.detail) message = parsed.detail;
    } catch { /* not JSON, use raw body */ }

    // Intercept MFA-related 403 errors — redirect to MFA verification
    if (res.status === 403 && message.toLowerCase().includes('mfa')) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('mfa_return_url', window.location.pathname);
        window.location.href = '/mfa-verify';
      }
      throw new ApiError(message, 403);
    }

    throw new ApiError(message, res.status);
  }

  return res.json();
}

// ── Credentials ──

export interface Credential {
  id: string;
  provider: string;
  label: string;
  key_type: string;
  last_four: string;
  is_active: boolean;
  created_at: string;
}

export interface CredentialTestResult {
  success: boolean;
  message: string;
  balance?: number;
}

export const credentials = {
  list: () => request<Credential[]>('/api/credentials'),

  create: (data: { provider: string; label: string; key_type?: string; value: string }) =>
    request<Credential>('/api/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/credentials/${id}`, { method: 'DELETE' }),

  test: (data: { provider: string; label: string; key_type?: string; value: string }) =>
    request<CredentialTestResult>('/api/credentials/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  byProvider: (provider: string) =>
    request<Credential[]>(`/api/credentials/by-provider/${provider}`),
};

// ── Agents ──

export interface Agent {
  id: string;
  bot_type_id?: string;
  name: string;
  repo_url?: string;
  repo_slug?: string;
  description?: string;
  strategy?: string;
  llms?: string;
  status: string;
  mode: string;
  capital_allocated: number;
  capital_used: number;
  total_pnl: number;
  trade_count: number;
  win_count: number;
  settled_count: number;
  pid?: number;
  started_at?: string;
  created_at: string;
  config_json?: Record<string, unknown>;
  available?: boolean;
  deprecated?: boolean;
  exchange?: 'kalshi' | 'polymarket';
}

export interface BotType {
  id: string;
  name: string;
  full_name: string;
  description: string;
  strategy: string;
  llms: string;
  exchange: string;
  accent_color: string;
  bg_tint: string;
}

export interface AgentStatus {
  agent_id: string;
  status: string;
  pid?: number;
  uptime_seconds?: number;
}

// ── Config history ──

export interface ConfigChangedField {
  field: string;
  from: unknown;
  to: unknown;
}

export interface BotConfigHistoryRow {
  id: string;
  source: 'dashboard' | 'deploy';
  config_before: Record<string, unknown> | null;
  config_after: Record<string, unknown>;
  capital_before: number | null;
  capital_after: number | null;
  mode_before: string | null;
  mode_after: string | null;
  changed_fields: ConfigChangedField[];
  changed_at: string | null;
  bot_type_id_snapshot: string | null;
}

export interface PlatformCodeChangedField {
  kind: 'default' | 'prompt';
  field: string;
  // For kind='default'
  from?: unknown;
  to?: unknown;
  // For kind='prompt'
  chars_changed?: number;
  from_preview?: string | null;
  to_preview?: string | null;
}

export interface PlatformCodeHistoryRow {
  id: string;
  bot_type_id: string;
  content_hash: string;
  changed_fields: PlatformCodeChangedField[];
  detected_at: string | null;
  git_commit_sha: string | null;
  // Only present when include_state=true
  code_state?: { defaults: Record<string, unknown>; prompts: Record<string, string> } | null;
  previous_state?: { defaults: Record<string, unknown>; prompts: Record<string, string> } | null;
}

export const agents = {
  types: () => request<BotType[]>('/api/agents/types'),

  list: (environment?: string) => request<Agent[]>('/api/agents' + (environment ? `?environment=${environment}` : '')),

  get: (id: string) => request<Agent>(`/api/agents/${id}`),

  deploy: (data: { agent_id: string; mode?: string; capital_allocated?: number; config?: Record<string, unknown> }) =>
    request<Agent>('/api/agents/deploy', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  pause: (id: string) =>
    request<Agent>(`/api/agents/${id}/pause`, { method: 'POST' }),

  kill: (id: string) =>
    request<Agent>(`/api/agents/${id}/kill`, { method: 'POST' }),

  status: (id: string) => request<AgentStatus>(`/api/agents/${id}/status`),

  metrics: (id: string) => request<{
    agent_id: string;
    avg_confidence: number;
    best_category: string;
    categories: Array<{ name: string; trades: number; pnl: number }>;
    trades_today: number;
  }>(`/api/agents/${id}/metrics`),

  updateConfig: (id: string, config: Record<string, unknown>, capital_allocated?: number, mode?: string) =>
    request<Agent>(`/api/agents/${id}/config`, {
      method: 'PATCH',
      body: JSON.stringify({ config, ...(capital_allocated !== undefined ? { capital_allocated } : {}), ...(mode !== undefined ? { mode } : {}) }),
    }),

  configHistory: (id: string, limit = 100) =>
    request<BotConfigHistoryRow[]>(`/api/agents/${id}/config-history?limit=${limit}`),

  platformCodeHistory: (opts: { bot_type_id?: string; limit?: number; include_state?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.bot_type_id) params.set('bot_type_id', opts.bot_type_id);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.include_state) params.set('include_state', 'true');
    const qs = params.toString();
    return request<PlatformCodeHistoryRow[]>(
      `/api/agents/platform-code-history${qs ? `?${qs}` : ''}`
    );
  },

  keyStatus: (id: string) => request<KeyStatus>(`/api/agents/${id}/key-status`),

  stopAll: () => request<{ ok: boolean; stopped_count: number }>('/api/agents/stop-all', { method: 'POST' }),

  killAll: () => request<{ ok: boolean; stopped_count: number; credentials_deleted: number }>('/api/agents/kill-all', { method: 'POST' }),

  pauseAll: () => request<{ ok: boolean; paused_count: number }>('/api/agents/pause-all', { method: 'POST' }),

  resumeAll: () => request<{ ok: boolean; resumed_count: number }>('/api/agents/resume-all', { method: 'POST' }),
};

// ── Markets ──

export interface Market {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  category?: string;
  status: string;
  yes_price: number;
  no_price: number;
  volume: number;
  open_interest: number;
  close_time?: string;
  result?: string;
  exchange?: 'kalshi' | 'polymarket';
}

export interface MarketList {
  markets: Market[];
  total: number;
  categories: string[];
  page: number;
  per_page: number;
}

export interface Category {
  name: string;
  tag: string;
  market_count: number;
}

export const markets = {
  list: (params?: { category?: string; search?: string; status?: string; limit?: number; page?: number; per_page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    const query = qs.toString();
    return request<MarketList>(`/api/markets${query ? `?${query}` : ''}`);
  },

  categories: () => request<Category[]>('/api/markets/categories'),

  get: (ticker: string) => request<Market>(`/api/markets/${ticker}`),
};

// ── Trades ──

export interface Trade {
  id: string;
  agent_id: string;
  timestamp: string;
  market_ticker: string;
  market_title?: string;
  category?: string;
  side: string;
  action: string;
  count: number;
  price: number;
  total_cost: number;
  confidence?: number;
  bot_reasoning?: string;
  raw_reasoning?: string;
  rules_result?: string;
  ai_verdict?: string;
  ai_reasoning?: string;
  status: string;
  kalshi_order_id?: string;
  exchange_order_id?: string;
  exchange?: 'kalshi' | 'polymarket';
  model?: string;
  pnl: number | null;
  current_price?: number | null;
  unrealized_pnl?: number | null;
  market_close_time?: string | null;
  settled: boolean;
  settled_at?: string;
  environment?: 'training' | 'actual';
  // Counterfactual tracking
  cf_settled?: boolean;
  cf_pnl?: number | null;
  cf_market_result?: string | null;
  cf_settled_at?: string | null;
  cf_count?: number | null;
}

export interface TradeStatusCounts {
  approved: number;
  rejected: number;
  skipped: number;
}

export interface TradeStats {
  net_pnl: number;
  total_trades: number;
  open_positions: number;
  win_pct: number;
  wins: number;
  losses: number;
  avg_conf: number;
  avg_size: number;
  agents: number;
  rejected: number;
  skipped: number;
}

export interface TradeList {
  trades: Trade[];
  total: number;
  page: number;
  per_page: number;
  counts?: TradeStatusCounts;
}

export const trades = {
  list: (params?: {
    agent_id?: string;
    status?: string;
    category?: string;
    side?: string;
    search?: string;
    environment?: string;
    exchange?: string;
    outcome?: string;
    time_range?: string;
    page?: number;
    per_page?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.side) qs.set('side', params.side);
    if (params?.search) qs.set('search', params.search);
    if (params?.environment) qs.set('environment', params.environment);
    if (params?.exchange) qs.set('exchange', params.exchange);
    if (params?.outcome) qs.set('outcome', params.outcome);
    if (params?.time_range) qs.set('time_range', params.time_range);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    const query = qs.toString();
    return request<TradeList>(`/api/trades${query ? `?${query}` : ''}`);
  },

  get: (id: string) => request<Trade>(`/api/trades/${id}`),

  // Manually re-place a failed Polymarket order. Without confirm, returns a live
  // price preview (confirm_required=true); with confirm=true, re-enqueues at the
  // current price via the worker.
  retry: (id: string, confirm: boolean = false) =>
    request<{
      confirm_required?: boolean;
      status?: string;
      queue_id?: string;
      side?: string;
      count?: number;
      original_price?: number | null;
      current_yes_price?: number;
      current_no_price?: number;
      current_side_price?: number;
      price_used?: number;
      market_title?: string;
    }>(`/api/trades/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    }),

  stats: (params?: {
    agent_id?: string;
    category?: string;
    exchange?: string;
    environment?: string;
    search?: string;
    time_range?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    if (params?.category) qs.set('category', params.category);
    if (params?.exchange) qs.set('exchange', params.exchange);
    if (params?.environment) qs.set('environment', params.environment);
    if (params?.search) qs.set('search', params.search);
    if (params?.time_range) qs.set('time_range', params.time_range);
    const query = qs.toString();
    return request<TradeStats>(`/api/trades/stats${query ? `?${query}` : ''}`);
  },

  byMarket: (params?: { environment?: string }) => {
    const qs = new URLSearchParams();
    if (params?.environment) qs.set('environment', params.environment);
    const query = qs.toString();
    return request<Record<string, {
      title: string;
      positions: Array<{
        agent_id: string;
        agent_name: string;
        side: string;
        size: number;
        confidence: number;
        pnl: number;
      }>;
    }>>(`/api/trades/by-market${query ? `?${query}` : ''}`);
  },
};

// ── Public Trades (no auth) ──

export interface PublicTrade {
  id: string;
  slug?: string;
  timestamp: string;
  market_ticker: string;
  market_title?: string;
  category?: string;
  side: string;
  action: string;
  price: number;
  confidence?: number;
  bot_reasoning?: string;
  raw_reasoning?: string;
  status: string;
  exchange?: string;
  settled: boolean;
  settled_at?: string;
  environment?: string;
  owner_display_name?: string;
  owner_avatar_url?: string;
}

export interface SitemapEntry {
  slug: string;
  timestamp: string;
}

/** Public trade fetch — no auth token sent. */
async function publicRequest<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body || res.statusText;
    try { const parsed = JSON.parse(body); if (parsed.detail) message = parsed.detail; } catch { /* not JSON */ }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

export const publicTrades = {
  get: (id: string) => publicRequest<PublicTrade>(`/api/public/trades/${id}`),
  getBySlug: (slug: string) => publicRequest<PublicTrade>(`/api/public/trades/by-slug/${slug}`),
  getSitemapEntries: () => publicRequest<SitemapEntry[]>(`/api/public/trades/sitemap`),
};

// ── Portfolio ──

export interface Portfolio {
  total_value: number;
  daily_pnl: number;
  total_pnl: number;
  agent_count: number;
  active_agents: number;
  trade_count: number;
  win_rate: number;
  open_positions: number;
}

export interface PortfolioSnapshot {
  timestamp: string;
  total_value: number;
  cash_balance: number | null;
  positions_value: number | null;
  daily_pnl: number;
  agent_values?: string;
}

export interface ExchangeBalance {
  balance: number;
  portfolio_value: number;
  connected: boolean;
  error?: string;
}

export interface KalshiBalance {
  balance: number;
  portfolio_value: number;
  connected: boolean;
  error?: string;
  exchanges?: {
    kalshi?: ExchangeBalance;
    polymarket?: ExchangeBalance;
  };
}

export const portfolio = {
  get: (environment?: string) => {
    const qs = new URLSearchParams();
    if (environment) qs.set('environment', environment);
    const q = qs.toString();
    return request<Portfolio>(`/api/portfolio${q ? `?${q}` : ''}`);
  },

  snapshots: (period?: string, environment?: string, exchange?: string) => {
    const qs = new URLSearchParams();
    if (period) qs.set('period', period);
    if (environment) qs.set('environment', environment);
    if (exchange) qs.set('exchange', exchange);
    const q = qs.toString();
    return request<{ snapshots: PortfolioSnapshot[] }>(
      `/api/portfolio/snapshots${q ? `?${q}` : ''}`
    );
  },

  balance: () => request<KalshiBalance>('/api/portfolio/balance'),

  stats: (environment?: string, period?: string, exchange?: string) => {
    const qs = new URLSearchParams();
    if (environment) qs.set('environment', environment);
    if (period) qs.set('period', period);
    if (exchange) qs.set('exchange', exchange);
    const q = qs.toString();
    return request<{
      best_day: { pnl: number; date: string | null };
      worst_day: { pnl: number; date: string | null };
      trade_histogram: Array<{ date: string; count: number; approved: number; skipped: number; rejected: number }>;
      open_positions: Array<{
        id: string;
        agent_id: string;
        agent_name: string;
        market_ticker: string;
        market_title: string;
        side: string;
        total_cost: number;
        confidence: number | null;
        pnl: number;
        price: number;
        current_price: number | null;
        current_price_at: string | null;
        unrealized_pnl: number | null;
        market_close_time: string | null;
        count: number;
        category: string;
      }>;
      settled_count: number;
      settled_positions: Array<{
        id: string;
        agent_id: string;
        agent_name: string;
        market_ticker: string;
        market_title: string;
        side: string;
        total_cost: number;
        confidence: number | null;
        pnl: number;
        price: number;
        count: number;
        category: string;
        timestamp: string;
        settled_at: string | null;
      }>;
    }>(`/api/portfolio/stats${q ? `?${q}` : ''}`);
  },

  reconcilePnl: () =>
    request<{
      status: string;
      trades_fixed?: number;
      pnl_adjustment?: number;
      agents_recomputed?: number;
      message: string;
    }>('/api/portfolio/reconcile-pnl', { method: 'POST' }),

  backfillCounterfactuals: (limit = 500) =>
    request<{
      processed: number;
      resolved: number;
      still_open: number;
    }>(`/api/trades/backfill-counterfactuals?limit=${limit}`, { method: 'POST' }),
};

// ── Rules ──

export interface RulesConfig {
  max_trade_size: number;
  max_capital_per_agent: number;
  daily_loss_limit: number;
  max_concurrent_positions: number;
  min_confidence: number;
  allowed_categories?: string[];
  blocked_tickers?: string[];
  schedule_interval_minutes: number;
  schedule_active_hours?: { start: string; end: string };
  cooldown_hours: number;
  max_trades_per_day: number;
  max_trades_per_market: number;
  daily_api_budget: number;
  live_trading_enabled: boolean;
  twitter_posting_enabled?: boolean;
}

export const rules = {
  get: () => request<RulesConfig>('/api/rules'),

  update: (config: Partial<RulesConfig>) =>
    request<RulesConfig>('/api/rules', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
};

// ── Logs ──

export interface LogEntry {
  id: number;
  agent_id: string;
  timestamp: string;
  level: string;
  message: string;
  environment?: 'training' | 'actual';
}

export const logs = {
  get: (agentId: string, limit?: number) =>
    request<{ logs: LogEntry[] }>(
      `/api/logs/${agentId}${limit ? `?limit=${limit}` : ''}`
    ),
};

// ── Audit ──

export interface AuditEntry {
  id: number;
  timestamp: string;
  category: string;
  agent_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  status: string;
  duration_ms: number | null;
  source: string;
}

export interface AuditList {
  entries: AuditEntry[];
  total: number;
  page: number;
  per_page: number;
}

export const audit = {
  list: (params?: {
    category?: string;
    source?: string;
    agent_id?: string;
    status?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.source) qs.set('source', params.source);
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    const query = qs.toString();
    return request<AuditList>(`/api/audit${query ? `?${query}` : ''}`);
  },
};

// ── Key Status ──

export interface KeyStatus {
  agent_id: string;
  required_keys: Array<{ provider: string; env_key: string; configured: boolean }>;
  kalshi_configured: boolean;
  polymarket_configured?: boolean;
  exchange?: 'kalshi' | 'polymarket';
  ready_to_deploy: boolean;
}

// ── Health ──

export const health = {
  check: () => request<{ status: string; kalshi_environment: string; version: string }>('/api/health'),
  config: () => request<{ kalshi_environment: string; available_agents: string[] }>('/api/config'),
};

// ── Wiki ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WikiPage = Record<string, unknown>;

// Should-trade audit: per-bot_type rollup of approved vs vetoed trades
export interface ShouldTradeAuditRow {
  bot_type_id: string;
  bot_name: string | null;
  flag: "approved_true" | "vetoed_false" | "unknown";
  trades: number;
  total_pnl: number;
  avg_pnl: number;
  staked: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  roi_pct: number;
}

export interface ShouldTradeAuditResponse {
  environment: string | null;
  rows: ShouldTradeAuditRow[];
}

export const wiki = {
  dashboard: () => request<WikiPage>("/api/wiki/dashboard"),
  shouldTradeAudit: (environment?: "actual" | "training") =>
    request<ShouldTradeAuditResponse>(
      `/api/wiki/should-trade-audit${environment ? `?environment=${environment}` : ""}`
    ),
  log: (limit = 50) =>
    request<{ entries: WikiPage[] }>(`/api/wiki/log?limit=${limit}`).then(r => r.entries),
  pages: (pageType?: string) =>
    request<{ pages: WikiPage[] }>(`/api/wiki/pages${pageType ? `?page_type=${pageType}` : ""}`).then(r => r.pages),
  page: (pageType: string, pageKey: string) =>
    request<WikiPage>(`/api/wiki/pages/${pageType}/${pageKey}`),
  bots: () =>
    request<{ pages: WikiPage[] }>("/api/wiki/pages?page_type=bot").then(r => r.pages),
  bot: (botTypeId: string) =>
    request<WikiPage>(`/api/wiki/bots/${botTypeId}`),
  categories: () =>
    request<{ pages: WikiPage[] }>("/api/wiki/categories").then(r => r.pages),
  category: (pageKey: string) =>
    request<WikiPage>(`/api/wiki/categories/${pageKey}`),
  agents: () =>
    request<{ pages: WikiPage[] }>("/api/wiki/agents").then(r => r.pages),
  agent: (role: string) =>
    request<WikiPage>(`/api/wiki/agents/${role}`),
  trades: () =>
    request<{ pages: WikiPage[] }>("/api/wiki/pages?page_type=trade").then(r => r.pages),
  trade: (tradeId: string) =>
    request<WikiPage>(`/api/wiki/trades/${tradeId}`),
  patterns: () =>
    request<{ pages: WikiPage[] }>("/api/wiki/patterns").then(r => r.pages),
  pattern: (pageKey: string) =>
    request<WikiPage>(`/api/wiki/patterns/${pageKey}`),
  sweep: () =>
    request<WikiPage>("/api/wiki/sweep"),
  snapshots: (type: string, key: string, limit = 12) =>
    request<{ snapshots: WikiPage[] }>(`/api/wiki/snapshots?snapshot_type=${encodeURIComponent(type)}&snapshot_key=${encodeURIComponent(key)}&limit=${limit}`).then(r => r.snapshots),

  // ── Phase G: Aggregates & Analysis ──
  aggregates: () =>
    request<WikiPage>("/api/wiki/aggregates"),
  analysisLatest: () =>
    request<WikiPage>("/api/wiki/analysis/latest"),
  analysisList: (limit = 20) =>
    request<{ pages: WikiPage[] }>(`/api/wiki/analyses?limit=${limit}`).then(r => r.pages),
  analysisWeek: (week: string) =>
    request<WikiPage>(`/api/wiki/analysis/${encodeURIComponent(week)}`),
};

// ── Twitter OAuth ──────────────────────────────────────────────────────────

export interface TwitterConnectionStatus {
  connected: boolean;
  username?: string | null;
  connected_at?: string | null;
}

export const twitterOauth = {
  authorize: () =>
    request<{ authorize_url: string }>('/api/twitter/oauth/authorize', {
      method: 'POST',
    }),
  status: () =>
    request<TwitterConnectionStatus>('/api/twitter/oauth/status'),
  disconnect: () =>
    request<{ ok: boolean }>('/api/twitter/oauth/disconnect', {
      method: 'DELETE',
    }),
};
