"use client";

import { useState, useEffect, useCallback } from "react";
import { trades as tradesApi, type Trade } from "@/lib/api";
import { useWalkthrough } from "@/context/walkthrough";
import { DEMO_TRADES } from "@/lib/demo-data";

export function useTrade(id: string | null) {
  const { demoMode } = useWalkthrough();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    // During walkthrough, return demo trade data
    if (demoMode && id.startsWith("demo-")) {
      setTrade(DEMO_TRADES.find(t => t.id === id) ?? DEMO_TRADES[0]!);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await tradesApi.get(id);
      setTrade(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load trade");
    } finally {
      setLoading(false);
    }
  }, [id, demoMode]);

  useEffect(() => { fetch(); }, [fetch]);

  return { trade, loading, error, refresh: fetch };
}
