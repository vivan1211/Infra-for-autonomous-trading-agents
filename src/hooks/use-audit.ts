'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { audit as auditApi, type AuditList } from '@/lib/api';

interface AuditFilters {
  category?: string;
  source?: string;
  agent_id?: string;
  status?: string;
  search?: string;
  per_page?: number;
}

const DEFAULT_PER_PAGE = 5;

export function useAudit(filters?: AuditFilters) {
  const perPage = filters?.per_page ?? DEFAULT_PER_PAGE;
  const [allEntries, setAllEntries] = useState<AuditList['entries']>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = useRef('');

  const currentFilterKey = JSON.stringify({ ...filters, per_page: undefined });

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const result = await auditApi.list({
        ...filters,
        page: pageNum,
        per_page: perPage,
      });

      setTotal(result.total);
      if (reset) {
        setAllEntries(result.entries);
      } else {
        setAllEntries(prev => [...prev, ...result.entries]);
      }
      setPage(pageNum);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentFilterKey, perPage]);

  useEffect(() => {
    if (filterKey.current !== currentFilterKey) {
      filterKey.current = currentFilterKey;
      setAllEntries([]);
      setPage(1);
    }
    fetchPage(1, true);
  }, [currentFilterKey]);

  const loadMore = useCallback(() => {
    if (!loadingMore && allEntries.length < total) {
      fetchPage(page + 1, false);
    }
  }, [page, total, allEntries.length, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    setAllEntries([]);
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  const hasMore = allEntries.length < total;

  return {
    entries: allEntries,
    total,
    page,
    per_page: perPage,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}
