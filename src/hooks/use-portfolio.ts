'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { portfolio as portfolioApi, portfolio, type Portfolio, type KalshiBalance } from '@/lib/api';
import { useWalkthrough } from '@/context/walkthrough';
import { DEMO_PORTFOLIO, DEMO_BALANCE, DEMO_SNAPSHOTS, DEMO_PORTFOLIO_STATS } from '@/lib/demo-data';

export function usePortfolio(environment?: string) {
  const { demoMode } = useWalkthrough();
  const { data, isLoading, error, mutate } = useSWR<Portfolio>(
    demoMode ? null : ['/portfolio', environment],
    () => portfolioApi.get(environment),
  );
  const refresh = useCallback(() => mutate(), [mutate]);

  if (demoMode) return { portfolio: DEMO_PORTFOLIO, loading: false, error: null, refresh };
  return { portfolio: data ?? null, loading: isLoading, error: error?.message ?? null, refresh };
}

export function useSnapshots(period: string = '1W', environment?: string, exchange?: string) {
  const { demoMode } = useWalkthrough();
  const { data, isLoading } = useSWR(
    demoMode ? null : ['/portfolio/snapshots', period, environment, exchange],
    () => portfolioApi.snapshots(period, environment, exchange).then(r => r.snapshots),
  );

  if (demoMode) return { snapshots: DEMO_SNAPSHOTS, loading: false };
  return { snapshots: data ?? [], loading: isLoading };
}

export function useKalshiBalance() {
  const { demoMode } = useWalkthrough();
  const { data, isLoading, mutate } = useSWR<KalshiBalance>(
    demoMode ? null : '/portfolio/balance',
    () => portfolioApi.balance(),
    { onError: () => {} },
  );
  const refresh = useCallback(() => mutate(), [mutate]);

  if (demoMode) return { balance: DEMO_BALANCE, loading: false, refresh };
  return { balance: data ?? null, loading: isLoading, refresh };
}

export function usePortfolioStats(environment?: string, period?: string, exchange?: string) {
  const { demoMode } = useWalkthrough();
  const { data, isLoading } = useSWR(
    demoMode ? null : ['/portfolio/stats', environment, period, exchange],
    () => portfolio.stats(environment, period, exchange),
  );

  if (demoMode) return { stats: DEMO_PORTFOLIO_STATS, loading: false };
  return { stats: data ?? null, loading: isLoading };
}
