"use client";

import { useState, useEffect } from "react";
import { markets as marketsApi, type Market } from "@/lib/api";

export function useMarket(ticker: string | null) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    marketsApi.get(ticker)
      .then((data) => { if (!cancelled) setMarket(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  return { market, loading, error };
}
