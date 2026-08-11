'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsManager, type WebSocketMessage } from '@/lib/websocket';
import { useWalkthrough } from '@/context/walkthrough';
import { DEMO_WS_MESSAGES } from '@/lib/demo-data';

/**
 * Hook for subscribing to WebSocket messages.
 * Optionally filter by agent_id and/or message type.
 */
export function useWebSocket(options?: { agentId?: string; types?: string[] }) {
  const { demoMode } = useWalkthrough();
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (demoMode) return;
    const unsubscribe = wsManager.subscribe((msg) => {
      const opts = optionsRef.current;

      // Filter by agent_id if specified
      if (opts?.agentId && msg.agent_id !== opts.agentId) return;

      // Filter by type if specified
      if (opts?.types && !opts.types.includes(msg.type)) return;

      setMessages((prev) => [...prev.slice(-500), msg]); // Keep last 500
    });

    // Check connection status periodically — only update state when value changes
    const interval = setInterval(() => {
      const isConn = wsManager.isConnected;
      setConnected((prev) => (prev === isConn ? prev : isConn));
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [demoMode]);

  const clear = useCallback(() => setMessages([]), []);

  if (demoMode) {
    // Filter demo messages same way as real ones
    const filtered = DEMO_WS_MESSAGES.filter(msg => {
      if (options?.agentId && msg.agent_id !== options.agentId) return false;
      if (options?.types && !options.types.includes(msg.type)) return false;
      return true;
    });
    return { messages: filtered, connected: true, clear };
  }

  return { messages, connected, clear };
}

/**
 * Hook for log streaming for a specific agent.
 * Loads historical logs from DB on mount, then appends live WebSocket logs.
 */
export function useAgentLogs(agentId: string) {
  const { messages } = useWebSocket({ agentId, types: ['log'] });
  const [historyLogs, setHistoryLogs] = useState<{ level: string; message: string; timestamp: string }[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const { logs: apiModule } = await import('@/lib/api');
        const result = await apiModule.get(agentId, 200);
        setHistoryLogs(
          result.logs.map((l: { level: string; message: string; timestamp: string }) => ({
            level: l.level,
            message: l.message,
            timestamp: l.timestamp,
          }))
        );
      } catch {
        // API unavailable — rely on WebSocket only
      }
    })();
  }, [agentId]);

  const wsLogs = messages.map((m) => ({
    level: (m.level as string) || 'info',
    message: (m.message as string) || '',
    timestamp: (m.timestamp as string) || new Date().toISOString(),
  }));

  return {
    logs: [...historyLogs, ...wsLogs],
  };
}
