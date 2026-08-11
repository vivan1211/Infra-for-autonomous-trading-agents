'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { trades as tradesApi, type Trade, type TradeList, type TradeStatusCounts, type TradeStats } from '@/lib/api';
import { useWalkthrough } from '@/context/walkthrough';
import { DEMO_TRADES } from '@/lib/demo-data';

interface TradeFilters {
  agent_id?: string;
  status?: string;
  category?: string;
  side?: string;
  search?: string;
  environment?: string;
  exchange?: string;
  outcome?: string;
  time_range?: string;
  per_page?: number;
}

const DEFAULT_PER_PAGE = 5;

const APPROVED_STATUSES = new Set(['executed', 'paper', 'open', 'pending', 'pending_fill']);
const REJECTED_STATUSES = new Set(['rejected', 'error']);

export function useTrades(filters?: TradeFilters) {
  const { demoMode } = useWalkthrough();
  const perPage = filters?.per_page ?? DEFAULT_PER_PAGE;
  const [allTrades, setAllTrades] = useState<TradeList['trades']>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<TradeStatusCounts>({ approved: 0, rejected: 0, skipped: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = useRef('');

  // Reset when filters change
  const currentFilterKey = JSON.stringify({ ...filters, per_page: undefined });

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const result = await tradesApi.list({
        ...filters,
        page: pageNum,
        per_page: perPage,
      });

      setTotal(result.total);
      if (result.counts) setCounts(result.counts);
      if (reset) {
        setAllTrades(result.trades);
      } else {
        setAllTrades(prev => [...prev, ...result.trades]);
      }
      setPage(pageNum);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load trades';
      console.error('[useTrades] error:', msg, e);
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentFilterKey, perPage]);

  // Reset on filter change
  useEffect(() => {
    if (filterKey.current !== currentFilterKey) {
      filterKey.current = currentFilterKey;
      setAllTrades([]);
      setPage(1);
    }
    fetchPage(1, true);
  }, [currentFilterKey]);

  const loadMore = useCallback(() => {
    if (!loadingMore && allTrades.length < total) {
      fetchPage(page + 1, false);
    }
  }, [page, total, allTrades.length, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    setAllTrades([]);
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  // Silent refresh: sync from API without showing loading spinner
  const silentRefresh = useCallback(async () => {
    try {
      const result = await tradesApi.list({ ...filters, page: 1, per_page: perPage });
      setTotal(result.total);
      if (result.counts) setCounts(result.counts);
      setAllTrades(prev => {
        // Merge: keep any injected trades not yet in API response, then API trades
        const apiIds = new Set(result.trades.map(t => t.id));
        const injectedOnly = prev.filter(t => !apiIds.has(t.id));
        return [...injectedOnly, ...result.trades];
      });
      setPage(1);
      setError(null);
    } catch {
      // Silent — don't overwrite existing data on failure
    }
  }, [currentFilterKey, perPage]);

  // Inject a trade from WebSocket — prepend if not duplicate, update counts
  const injectTrade = useCallback((trade: Trade) => {
    // Check if trade matches current filters
    if (filters?.status && filters.status !== trade.status) return;
    if (filters?.agent_id && filters.agent_id !== trade.agent_id) return;
    if (filters?.category && filters.category !== trade.category) return;
    if (filters?.side && filters.side !== trade.side) return;
    if (filters?.environment && filters.environment !== trade.environment) return;
    if (filters?.exchange && filters.exchange !== trade.exchange) return;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      const matchesTitle = trade.market_title?.toLowerCase().includes(q);
      const matchesTicker = trade.market_ticker.toLowerCase().includes(q);
      if (!matchesTitle && !matchesTicker) return;
    }

    setAllTrades(prev => {
      if (prev.some(t => t.id === trade.id)) return prev; // dedupe
      return [trade, ...prev];
    });
    setTotal(prev => prev + 1);
    setCounts(prev => {
      if (APPROVED_STATUSES.has(trade.status)) return { ...prev, approved: prev.approved + 1 };
      if (REJECTED_STATUSES.has(trade.status)) return { ...prev, rejected: prev.rejected + 1 };
      if (trade.status === 'skipped') return { ...prev, skipped: prev.skipped + 1 };
      return prev;
    });
  }, [currentFilterKey]);

  // Poll every 60s to keep data fresh — pause when tab not visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      silentRefresh();
    }, 60000);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  const hasMore = allTrades.length < total;

  if (demoMode) {
    return {
      trades: DEMO_TRADES,
      total: DEMO_TRADES.length,
      counts: { approved: 10, rejected: 2, skipped: 3 },
      page: 1,
      per_page: perPage,
      loading: false,
      loadingMore: false,
      hasMore: false,
      error: null,
      refresh,
      silentRefresh,
      loadMore,
      injectTrade,
    };
  }

  return {
    trades: allTrades,
    total,
    counts,
    page,
    per_page: perPage,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    silentRefresh,
    loadMore,
    injectTrade,
  };
}

const DEMO_TRADE_STATS: TradeStats = {
  net_pnl: 1247.80,
  total_trades: 69,
  open_positions: 5,
  win_pct: 62,
  wins: 42,
  losses: 27,
  avg_conf: 0.68,
  avg_size: 285,
  agents: 3,
  rejected: 8,
  skipped: 12,
};

export function useTradeStats(params?: {
  agent_id?: string;
  environment?: string;
  exchange?: string;
  time_range?: string;
}) {
  const { demoMode } = useWalkthrough();
  const key = JSON.stringify(params);
  const { data, isLoading } = useSWR<TradeStats>(
    demoMode ? null : ['/trades/stats', key],
    () => tradesApi.stats(params),
  );

  if (demoMode) return { stats: DEMO_TRADE_STATS, loading: false };
  return { stats: data ?? null, loading: isLoading };
}
