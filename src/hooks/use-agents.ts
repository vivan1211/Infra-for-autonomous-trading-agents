'use client';

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { agents as agentsApi, agents, type Agent } from '@/lib/api';
import { useWebSocket } from '@/hooks/use-websocket';
import { useWalkthrough } from '@/context/walkthrough';
import { DEMO_AGENTS, DEMO_AGENT_METRICS } from '@/lib/demo-data';

export function useAgents(environment?: string) {
  const { demoMode } = useWalkthrough();
  const { data, isLoading, error, mutate } = useSWR<Agent[]>(
    demoMode ? null : ['/agents', environment],
    () => agentsApi.list(environment),
  );
  const refresh = useCallback(() => mutate(), [mutate]);

  // Real-time status updates via WebSocket (stop/kill/deploy)
  const { messages: statusMsgs } = useWebSocket({ types: ["status"] });
  useEffect(() => {
    if (demoMode || statusMsgs.length === 0) return;
    for (const msg of statusMsgs) {
      if (msg.agent_id && msg.status) {
        mutate(
          current => current?.map(a =>
            a.id === msg.agent_id ? { ...a, status: msg.status as string } : a
          ),
          { revalidate: false },
        );
      }
    }
  }, [statusMsgs, demoMode, mutate]);

  const deploy = useCallback(async (agentId: string, mode: string, capital: number, config?: Record<string, unknown>) => {
    if (demoMode) return DEMO_AGENTS[0]!;
    const result = await agentsApi.deploy({ agent_id: agentId, mode, capital_allocated: capital, config });
    await mutate();
    return result;
  }, [demoMode, mutate]);

  const pause = useCallback(async (agentId: string) => {
    if (demoMode) return DEMO_AGENTS[0]!;
    const result = await agentsApi.pause(agentId);
    await mutate();
    return result;
  }, [demoMode, mutate]);

  const kill = useCallback(async (agentId: string) => {
    if (demoMode) return DEMO_AGENTS[0]!;
    const result = await agentsApi.kill(agentId);
    await mutate();
    return result;
  }, [demoMode, mutate]);

  if (demoMode) {
    return { agents: DEMO_AGENTS, loading: false, error: null, refresh, deploy, pause, kill };
  }

  return { agents: data ?? [], loading: isLoading, error: error?.message ?? null, refresh, deploy, pause, kill };
}

export function useAgent(id: string) {
  const { demoMode } = useWalkthrough();
  const { data, isLoading, error, mutate } = useSWR<Agent>(
    demoMode ? null : ['/agent/detail', id],
    () => agentsApi.get(id),
  );
  const refresh = useCallback(() => mutate(), [mutate]);

  if (demoMode) {
    const demoAgent = DEMO_AGENTS.find(a => a.id === id) || DEMO_AGENTS[0]!;
    return { agent: demoAgent, loading: false, error: null, refresh };
  }

  return { agent: data ?? null, loading: isLoading, error: error?.message ?? null, refresh };
}

export function useAgentMetrics(agentIds: string[]) {
  const { demoMode } = useWalkthrough();
  const key = agentIds.length > 0 ? ['/agents/metrics', ...agentIds] : null;
  const { data: metrics = {}, isLoading } = useSWR(
    demoMode ? null : key,
    () => Promise.all(
      agentIds.map(id => agents.metrics(id).catch(() => null))
    ).then(results => {
      const map: Record<string, { avg_confidence: number; best_category: string; categories: Array<{ name: string; trades: number; pnl: number }>; trades_today: number }> = {};
      results.forEach(r => { if (r) map[r.agent_id] = r; });
      return map;
    }),
  );

  if (demoMode) return { metrics: DEMO_AGENT_METRICS, loading: false };
  return { metrics, loading: isLoading };
}
