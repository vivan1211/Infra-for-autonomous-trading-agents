'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { markets as marketsApi, trades, type MarketList, type Category } from '@/lib/api';

const DEFAULT_PER_PAGE = 5;

export function useMarkets(params?: { category?: string; search?: string; per_page?: number }) {
  const perPage = params?.per_page ?? DEFAULT_PER_PAGE;
  const [allMarkets, setAllMarkets] = useState<MarketList['markets']>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = useRef('');

  const currentFilterKey = JSON.stringify({ category: params?.category, search: params?.search });

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const result = await marketsApi.list({
        category: params?.category,
        search: params?.search,
        page: pageNum,
        per_page: perPage,
      });

      setTotal(result.total);
      setCategories(result.categories);
      if (reset) {
        setAllMarkets(result.markets);
      } else {
        setAllMarkets(prev => [...prev, ...result.markets]);
      }
      setPage(pageNum);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load markets');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentFilterKey, perPage]);

  useEffect(() => {
    if (filterKey.current !== currentFilterKey) {
      filterKey.current = currentFilterKey;
      setAllMarkets([]);
      setPage(1);
    }
    fetchPage(1, true);
  }, [currentFilterKey]);

  const loadMore = useCallback(() => {
    if (!loadingMore && allMarkets.length < total) {
      fetchPage(page + 1, false);
    }
  }, [page, total, allMarkets.length, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    setAllMarkets([]);
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  const hasMore = allMarkets.length < total;

  return {
    markets: allMarkets,
    total,
    categories,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}

export function useCategories() {
  const { data: categories = [], isLoading: loading } = useSWR<Category[]>(
    '/markets/categories',
    () => marketsApi.categories(),
  );
  return { categories, loading };
}

export interface MarketPosition {
  agent_id: string;
  agent_name: string;
  side: string;
  size: number;
  confidence: number;
  pnl: number;
}

export interface MarketPositionGroup {
  title: string;
  positions: MarketPosition[];
}

export function useMarketPositions(environment?: string) {
  const { data: positions = {}, isLoading: loading } = useSWR<Record<string, MarketPositionGroup>>(
    ['/trades/by-market', environment],
    () => trades.byMarket(environment ? { environment } : undefined),
  );
  return { positions, loading };
}
