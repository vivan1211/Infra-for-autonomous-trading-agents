'use client';

import useSWR from 'swr';
import { wiki } from '@/lib/api';
import { useWalkthrough } from '@/context/walkthrough';

// Ensure array data is actually an array (API errors may return objects)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArray(data: unknown): any[] {
  return Array.isArray(data) ? data : [];
}

export function useWikiDashboard() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/dashboard',
    () => wiki.dashboard(),
  );
  return { dashboard: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiLog(limit = 20) {
  const { data, isLoading, error, mutate } = useSWR(
    ['/api/wiki/log', limit],
    () => wiki.log(limit),
  );
  return { log: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiBots() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/bots',
    () => wiki.bots(),
  );
  return { bots: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiBot(botTypeId: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    botTypeId ? ['/api/wiki/bots', botTypeId] : null,
    () => wiki.bot(botTypeId!),
  );
  return { bot: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiCategories() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/categories',
    () => wiki.categories(),
  );
  return { categories: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiCategory(pageKey: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    pageKey ? ['/api/wiki/categories', pageKey] : null,
    () => wiki.category(pageKey!),
  );
  return { category: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiAgents() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/agents',
    () => wiki.agents(),
  );
  return { agents: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiAgent(role: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    role ? ['/api/wiki/agents', role] : null,
    () => wiki.agent(role!),
  );
  return { agent: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiTrades() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/trades',
    () => wiki.trades(),
  );
  return { trades: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiTrade(tradeId: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    tradeId ? ['/api/wiki/trades', tradeId] : null,
    () => wiki.trade(tradeId!),
  );
  return { trade: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

/** @deprecated Patterns replaced by weekly analysis (Phase F). Remove in Phase G UI rework. */
export function useWikiPatterns() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/patterns',
    () => wiki.patterns(),
  );
  return { patterns: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

/** @deprecated Patterns replaced by weekly analysis (Phase F). Remove in Phase G UI rework. */
export function useWikiPattern(pageKey: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    pageKey ? ['/api/wiki/patterns', pageKey] : null,
    () => wiki.pattern(pageKey!),
  );
  return { pattern: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiSweep() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/sweep',
    () => wiki.sweep(),
  );
  return { sweep: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

// ── Phase G: Aggregates & Analysis ──

export function useWikiAggregates() {
  const { demoMode } = useWalkthrough();
  const { data, isLoading, error, mutate } = useSWR(
    demoMode ? null : '/api/wiki/aggregates',
    () => wiki.aggregates(),
  );
  if (demoMode) {
    return {
      aggregates: {
        data_snapshot: JSON.stringify({
          overall: {
            real_pnl_sum: 1070.00, cf_pnl_sum: 620.00, real_win_rate: 0.632,
            real_win_rate_ci: [0.55, 0.71], n_real_settled: 38,
            max_drawdown: -142.50, trade_sharpe: 1.84,
          },
          per_bot: {
            "ensemble-5": {
              bot_type_id: "ensemble-5", label: "Council of Models",
              n_real: 42, real_pnl: 847.32, real_win_rate: 0.667,
              avg_conf: 0.71, n_cf: 56, cf_pnl: 480.00,
            },
            "superforecaster": {
              bot_type_id: "superforecaster", label: "Superforecaster",
              n_real: 23, real_pnl: 312.18, real_win_rate: 0.652,
              avg_conf: 0.68, n_cf: 30, cf_pnl: 140.00,
            },
          },
          calibration: { brier: 0.189, weekly: [
            { week: "2026-W10", pnl: 85.20, trades: 6, win_rate: 0.67 },
            { week: "2026-W11", pnl: 142.50, trades: 8, win_rate: 0.75 },
            { week: "2026-W12", pnl: -32.10, trades: 5, win_rate: 0.40 },
            { week: "2026-W13", pnl: 198.40, trades: 9, win_rate: 0.78 },
            { week: "2026-W14", pnl: 67.30, trades: 7, win_rate: 0.57 },
            { week: "2026-W15", pnl: 156.80, trades: 8, win_rate: 0.63 },
          ]},
          categories_per_bot: {
            all: [
              { category: "Economics", n_real: 18, real_pnl: 420.50, real_win_rate: 0.72 },
              { category: "Politics", n_real: 12, real_pnl: 185.20, real_win_rate: 0.58 },
              { category: "Crypto", n_real: 8, real_pnl: -42.10, real_win_rate: 0.38 },
              { category: "Tech", n_real: 4, real_pnl: 283.72, real_win_rate: 0.75 },
              { category: "Markets", n_real: 6, real_pnl: 122.68, real_win_rate: 0.67 },
            ],
          },
          sides_per_bot: {
            all: {
              YES: { n_real: 28, real_pnl: 780.40, real_win_rate: 0.68 },
              NO: { n_real: 10, real_pnl: 289.60, real_win_rate: 0.50 },
            },
          },
          hit_rate_by_price_per_bot: {
            all: { buckets: [
              { label: "0.20-0.35", n: 8, win_rate: 0.50, pnl: 45.20 },
              { label: "0.35-0.50", n: 12, win_rate: 0.58, pnl: 180.40 },
              { label: "0.50-0.65", n: 14, win_rate: 0.71, pnl: 520.30 },
              { label: "0.65-0.80", n: 4, win_rate: 0.75, pnl: 324.10 },
            ]},
          },
          hit_rate_by_timing_per_bot: {
            all: { buckets: [
              { label: "0-6h", n: 10, win_rate: 0.60, pnl: 120.50 },
              { label: "6-24h", n: 15, win_rate: 0.67, pnl: 480.20 },
              { label: "1-3d", n: 8, win_rate: 0.63, pnl: 310.80 },
              { label: "3-7d", n: 5, win_rate: 0.60, pnl: 158.50 },
            ]},
          },
          conf_edge_inversion: { by_bucket: { placed: { mean_gap: 0.08 } } },
          risk: { pipeline: { total_vetoed: 14, veto_rate: 0.18, reasons: [
            { rule: "max_position_size", count: 6 },
            { rule: "correlation_limit", count: 4 },
            { rule: "daily_loss_limit", count: 4 },
          ]}},
        }),
      },
      loading: false,
      error: null,
      refresh: () => Promise.resolve(undefined),
    };
  }
  return { aggregates: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiAnalysisLatest() {
  const { data, isLoading, error, mutate } = useSWR(
    '/api/wiki/analysis/latest',
    () => wiki.analysisLatest(),
  );
  return { analysis: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiAnalysisList(limit?: number) {
  const { data, isLoading, error, mutate } = useSWR(
    ['/api/wiki/analyses', limit ?? 20],
    () => wiki.analysisList(limit),
  );
  return { analyses: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiAnalysisWeek(week: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    week ? ['/api/wiki/analysis', week] : null,
    () => wiki.analysisWeek(week!),
  );
  return { analysis: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useWikiSnapshots(snapshotType: string | null, snapshotKey: string | null) {
  const { data, isLoading, error, mutate } = useSWR(
    snapshotType && snapshotKey ? ['/api/wiki/snapshots', snapshotType, snapshotKey] : null,
    () => wiki.snapshots(snapshotType!, snapshotKey!),
  );
  return { snapshots: safeArray(data), loading: isLoading, error: error?.message ?? null, refresh: mutate };
}

export function useShouldTradeAudit(environment?: 'actual' | 'training') {
  const { data, isLoading, error, mutate } = useSWR(
    ['/api/wiki/should-trade-audit', environment ?? 'all'],
    () => wiki.shouldTradeAudit(environment),
  );
  return {
    audit: data ?? null,
    rows: data?.rows ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
