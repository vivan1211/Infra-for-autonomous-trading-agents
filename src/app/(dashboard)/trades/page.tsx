"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { formatMoneyFull, formatResolve } from "@/lib/utils";
import { useTrades } from "@/hooks/use-trades";
import { useAgents } from "@/hooks/use-agents";
import { trades as tradesApi, type TradeStats } from "@/lib/api";
import { useEnvironmentFilter, type EnvironmentFilter } from "@/context/environment-filter";
import { useWalkthrough } from "@/context/walkthrough";

/* ── helpers ──────────────────────────────────────────────────── */

function cleanTicker(ticker: string): string {
  if (!ticker) return "Unknown Market";
  const parts = ticker.replace(/^(KX|INX|FED|CPI)/, "").split("-");
  const main = parts[0]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())
    .trim();
  return main || ticker;
}

function relativeTime(ts: string) {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── tiny SVG triangles ───────────────────────────────────────── */

function TriUp() {
  return (
    <svg
      className="w-[10px] h-[10px] inline-block align-[-1px] mr-[3px]"
      viewBox="0 0 12 12"
    >
      <path d="M1.5 10 6 2.5l4.5 7.5h-9Z" fill="currentColor" />
    </svg>
  );
}

function TriDown() {
  return (
    <svg
      className="w-[10px] h-[10px] inline-block align-[-1px] mr-[3px]"
      viewBox="0 0 12 12"
    >
      <path d="M1.5 2 6 9.5l4.5-7.5h-9Z" fill="currentColor" />
    </svg>
  );
}

/* ── types ─────────────────────────────────────────────────────── */

type SortKey =
  | "time"
  | "agent"
  | "market"
  | "exchange"
  | "side"
  | "size"
  | "entry"
  | "outcome"
  | "pnl";
type SortDir = "asc" | "desc";

/* ── FilterDropdown ────────────────────────────────────────────── */

function FilterDropdown({
  outcomeFilter,
  setOutcomeFilter,
  exchangeFilter,
  setExchangeFilter,
  categoryFilter,
  setCategoryFilter,
  botFilter,
  setBotFilter,
  envFilter,
  setEnvFilter,
  statsTimeRange,
  setStatsTimeRange,
  agents,
  hasActiveFilters,
  clearFilters,
}: {
  outcomeFilter: string;
  setOutcomeFilter: (v: string) => void;
  exchangeFilter: string;
  setExchangeFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  botFilter: string;
  setBotFilter: (v: string) => void;
  envFilter: EnvironmentFilter;
  setEnvFilter: (v: EnvironmentFilter) => void;
  statsTimeRange: string;
  setStatsTimeRange: (v: string) => void;
  agents: { id: string; name: string }[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeCount = [
    outcomeFilter !== "all",
    exchangeFilter !== "all",
    categoryFilter !== "all",
    botFilter !== "all",
    envFilter !== "all",
    statsTimeRange !== "ALL",
  ].filter(Boolean).length;

  const pill = (
    label: string,
    value: string,
    current: string,
    set: (v: string) => void
  ) => (
    <button
      key={value}
      onClick={() => set(value)}
      className={`px-2.5 py-1 rounded-md text-[12px] border font-medium transition-colors ${
        current === value
          ? "border-white text-white bg-white/[0.06]"
          : "border-[#30363a] text-[#919fa6] hover:border-[#555] hover:text-[#ccc]"
      }`}
    >
      {label}
    </button>
  );

  const groupLabel = (t: string) => (
    <div className="text-[11px] font-bold text-[#919fa6] uppercase tracking-[0.5px] mb-2">
      {t}
    </div>
  );

  const sep = <div className="h-px bg-[#30363a] mx-1 my-2" />;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-[13px] font-medium ${
          open
            ? "border-[#555] text-[#ccc]"
            : "border-[#30363a] bg-transparent text-[#919fa6] hover:border-[#555] hover:text-[#ccc]"
        }`}
      >
        <svg
          className="w-[14px] h-[14px] opacity-60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="bg-white/10 text-white text-[11px] px-1.5 rounded-full">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] min-w-[280px] bg-black border border-[#30363a] rounded-xl p-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-50">
          {/* Outcome */}
          <div className="p-2">
            {groupLabel("Outcome")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All", "all", outcomeFilter, setOutcomeFilter)}
              {pill("Won", "won", outcomeFilter, setOutcomeFilter)}
              {pill("Lost", "lost", outcomeFilter, setOutcomeFilter)}
              {pill("Pending", "pending", outcomeFilter, setOutcomeFilter)}
              {pill("Skipped", "skipped", outcomeFilter, setOutcomeFilter)}
              {pill("Rejected", "rejected", outcomeFilter, setOutcomeFilter)}
            </div>
          </div>

          {sep}

          {/* Exchange */}
          <div className="p-2">
            {groupLabel("Exchange")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All", "all", exchangeFilter, setExchangeFilter)}
              {pill("Kalshi", "kalshi", exchangeFilter, setExchangeFilter)}
              {pill("Polymarket", "polymarket", exchangeFilter, setExchangeFilter)}
            </div>
          </div>

          {sep}

          {/* Category */}
          <div className="p-2">
            {groupLabel("Category")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All", "all", categoryFilter, setCategoryFilter)}
              {pill("Politics", "Politics", categoryFilter, setCategoryFilter)}
              {pill("Crypto", "Crypto", categoryFilter, setCategoryFilter)}
              {pill("Sports", "Sports", categoryFilter, setCategoryFilter)}
              {pill("Economics", "Economics", categoryFilter, setCategoryFilter)}
              {pill("Climate", "Climate", categoryFilter, setCategoryFilter)}
            </div>
          </div>

          {sep}

          {/* Agent */}
          <div className="p-2">
            {groupLabel("Agent")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All", "all", botFilter, setBotFilter)}
              {agents.map((a) => pill(a.name, a.id, botFilter, setBotFilter))}
            </div>
          </div>

          {sep}

          {/* Environment */}
          <div className="p-2">
            {groupLabel("Environment")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All", "all", envFilter, setEnvFilter as (v: string) => void)}
              {pill("Training", "training", envFilter, setEnvFilter as (v: string) => void)}
              {pill("Live", "actual", envFilter, setEnvFilter as (v: string) => void)}
            </div>
          </div>

          {sep}

          {/* Time */}
          <div className="p-2">
            {groupLabel("Time")}
            <div className="flex flex-wrap gap-1.5">
              {pill("All Time", "ALL", statsTimeRange, setStatsTimeRange)}
              {pill("24h", "1D", statsTimeRange, setStatsTimeRange)}
              {pill("7d", "1W", statsTimeRange, setStatsTimeRange)}
              {pill("30d", "1M", statsTimeRange, setStatsTimeRange)}
              {pill("3m", "3M", statsTimeRange, setStatsTimeRange)}
              {pill("1y", "1Y", statsTimeRange, setStatsTimeRange)}
            </div>
          </div>

          {/* Clear all */}
          {hasActiveFilters && (
            <>
              {sep}
              <div className="p-2 text-center">
                <button
                  onClick={clearFilters}
                  className="text-[12px] text-[#919fa6] hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── SortTh ────────────────────────────────────────────────────── */

function SortTh({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  currentSortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = currentSortKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`h-[52px] px-4 text-[13px] font-bold cursor-pointer select-none border-b border-border relative whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-white" : "text-[#919fa6] hover:text-[#ccc]"}`}
    >
      {active && (
        <span className="mr-1">{currentSortDir === "asc" ? "\u2191" : "\u2193"}</span>
      )}
      {label}
      {active && (
        <div className="absolute bottom-[-1px] left-[16px] right-[16px] h-[2px] bg-white rounded-[1px]" />
      )}
    </th>
  );
}

/* ── Main Page ─────────────────────────────────────────────────── */

export default function TradesV2Page() {
  const { envFilter, setEnvFilter } = useEnvironmentFilter();
  const { demoMode } = useWalkthrough();

  /* filter state */
  const [botFilter, setBotFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [statsTimeRange, setStatsTimeRange] = useState("ALL");

  /* sort state */
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* server stats */
  const [serverStats, setServerStats] = useState<TradeStats | null>(null);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;
    tradesApi
      .stats({
        agent_id: botFilter !== "all" ? botFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        exchange: exchangeFilter !== "all" ? exchangeFilter : undefined,
        environment: envFilter !== "all" ? envFilter : undefined,
        time_range: statsTimeRange,
      })
      .then((data) => { if (!cancelled) setServerStats(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [botFilter, categoryFilter, exchangeFilter, envFilter, statsTimeRange, demoMode]);

  /* data */
  const {
    trades: apiTrades,
    loading: isLoading,
    loadingMore,
    total,
    loadMore,
    hasMore,
    error: tradesError,
  } = useTrades({
    agent_id: botFilter !== "all" ? botFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    environment: envFilter !== "all" ? envFilter : undefined,
    exchange: exchangeFilter !== "all" ? exchangeFilter : undefined,
    outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
    time_range: statsTimeRange !== "ALL" ? statsTimeRange : undefined,
    per_page: 25,
  });

  const { agents } = useAgents();
  const agentList = (agents ?? []).filter((a) => a.status === "running" || a.status === "active" || a.trade_count > 0).map((a) => ({
    id: a.id,
    name: a.name || a.id,
  }));

  /* map trades to display objects — uses same field names as Trade type in api.ts */
  const trades = (apiTrades ?? []).map((t) => {
    const agentMatch = agentList.find((a) => a.id === t.agent_id);
    const isSkipped = t.status === "skipped";
    const isRejected = t.status === "rejected" || t.status === "error";
    const outcome = isSkipped
      ? "Skipped"
      : isRejected
        ? "Rejected"
        : t.settled
          ? (t.pnl ?? 0) > 0 ? "Won" : (t.pnl ?? 0) < 0 ? "Lost" : "Breakeven"
          : "Pending";

    return {
      id: t.id,
      timestamp: t.timestamp,
      marketTitle:
        t.market_title && t.market_title !== t.market_ticker
          ? t.market_title
          : cleanTicker(t.market_ticker),
      botName: agentMatch?.name || t.agent_id?.slice(0, 8) || "—",
      side: t.side ? t.side.toUpperCase() : "—",
      size: t.total_cost,
      entryPrice: t.price,
      pnl: t.pnl ?? null,
      currentPrice: t.current_price ?? null,
      unrealizedPnl: t.unrealized_pnl ?? null,
      marketCloseTime: t.market_close_time ?? null,
      status: t.status,
      settled: t.settled,
      outcome,
      exchange: (t.exchange || "kalshi") as "kalshi" | "polymarket",
      category: t.category || "",
      environment: t.environment || "training",
    };
  });

  // Current price + unrealized P&L only matter for open positions, so reveal
  // those columns only when the Pending (open) outcome filter is active.
  const showOpenCols = outcomeFilter === "pending";
  const tradeColSpan = showOpenCols ? 13 : 11;

  /* sort */
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...trades].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "time":
        return dir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case "agent":
        return dir * a.botName.localeCompare(b.botName);
      case "market":
        return dir * a.marketTitle.localeCompare(b.marketTitle);
      case "exchange":
        return dir * (a.exchange || "").localeCompare(b.exchange || "");
      case "side":
        return dir * a.side.localeCompare(b.side);
      case "size":
        return dir * ((a.size ?? 0) - (b.size ?? 0));
      case "entry":
        return dir * ((a.entryPrice ?? 0) - (b.entryPrice ?? 0));
      case "outcome": {
        const order = (s: string) => s === "Won" ? 4 : s === "Lost" ? 3 : s === "Pending" ? 2 : 1;
        return dir * (order(a.outcome) - order(b.outcome));
      }
      case "pnl":
        return dir * ((a.pnl ?? 0) - (b.pnl ?? 0));
      default:
        return 0;
    }
  });

  /* derived */
  const hasActiveFilters =
    outcomeFilter !== "all" ||
    exchangeFilter !== "all" ||
    categoryFilter !== "all" ||
    botFilter !== "all" ||
    envFilter !== "all" ||
    statsTimeRange !== "ALL";

  function clearFilters() {
    setOutcomeFilter("all");
    setExchangeFilter("all");
    setCategoryFilter("all");
    setBotFilter("all");
    setEnvFilter("all");
    setStatsTimeRange("ALL");
  }

  /* stats from server */
  const netPnl = serverStats?.net_pnl ?? 0;
  const tradeCount = serverStats?.total_trades ?? total ?? 0;
  const openCount = serverStats?.open_positions ?? 0;
  const winRate = serverStats?.win_pct ?? 0;

  /* ── render ────────────────────────────────────────────────── */
  return (
    <div className="animate-fade-in text-white px-2 md:px-0">
      {/* Border box like Robinhood */}
      <div className="rounded overflow-hidden" style={{ boxShadow: "#30363a 0 0 0 1px" }}>
        {/* ── Header Bar ─────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-4 px-6 lg:px-10 py-7 lg:py-9 border-b border-border">
          <div className="flex items-center gap-5 flex-wrap">
            {/* Icon + Title */}
            <div className="flex items-center gap-3">
              <Image src="/trades-v2-icon.jpeg" alt="Trades" width={80} height={80} className="rounded-xl" />
              <h1 className="text-[30px] font-bold tracking-tight">Trades</h1>
            </div>

            {/* vertical divider */}
            <div className="hidden lg:block w-px h-8 bg-[#30363a]" />

            {/* inline stats — hidden below lg */}
            <div className="hidden lg:flex items-center gap-7 text-[16px]">
              <span className="text-[#919fa6]">
                Net P&L{" "}
                <span
                  className={`font-bold ${
                    netPnl >= 0 ? "text-[#00C805]" : "text-[#FF6B8A]"
                  }`}
                >
                  {netPnl >= 0 ? "+" : ""}
                  {formatMoneyFull(netPnl)}
                </span>
              </span>
              <div className="w-px h-5 bg-[#30363a]" />
              <span className="text-[#919fa6]">
                Trades{" "}
                <span className="text-white font-bold">{tradeCount}</span>
              </span>
              <div className="w-px h-5 bg-[#30363a]" />
              <span className="text-[#919fa6]">
                Open{" "}
                <span className="text-white font-bold">{openCount}</span>
              </span>
              <div className="w-px h-5 bg-[#30363a]" />
              <span className="text-[#919fa6]">
                Win Rate{" "}
                <span className="text-white font-bold">
                  {winRate}%
                </span>
              </span>
            </div>
          </div>

          {/* Filter button */}
          <FilterDropdown
            outcomeFilter={outcomeFilter}
            setOutcomeFilter={setOutcomeFilter}
            exchangeFilter={exchangeFilter}
            setExchangeFilter={setExchangeFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            botFilter={botFilter}
            setBotFilter={setBotFilter}
            envFilter={envFilter}
            setEnvFilter={setEnvFilter}
            statsTimeRange={statsTimeRange}
            setStatsTimeRange={setStatsTimeRange}
            agents={agentList}
            hasActiveFilters={hasActiveFilters}
            clearFilters={clearFilters}
          />
        </div>

        {/* ── Desktop table ──────────────────────────────────── */}
        <div className="hidden md:block overflow-x-auto" data-tour="trades-list">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: 48 }} />
              <col style={{ width: 340 }} />
              <col style={{ width: 32 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              {showOpenCols && <col style={{ width: 120 }} />}
              {showOpenCols && <col style={{ width: 140 }} />}
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="h-[52px] px-4 text-[12px] font-semibold uppercase tracking-wider text-[#919fa6] border-b-[0.5px] border-[#30363a] text-center">
                  #
                </th>
                <SortTh
                  label="Market"
                  sortKey="market"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                {/* spacer col */}
                <th className="h-[52px] border-b-[0.5px] border-[#30363a]" />
                <SortTh
                  label="Outcome"
                  sortKey="outcome"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Side"
                  sortKey="side"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Size"
                  sortKey="size"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortTh
                  label="Entry"
                  sortKey="entry"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                {showOpenCols && (
                  <th className="h-[52px] px-4 text-[12px] font-semibold uppercase tracking-wider text-[#919fa6] border-b-[0.5px] border-[#30363a] text-right">Current</th>
                )}
                {showOpenCols && (
                  <th className="h-[52px] px-4 text-[12px] font-semibold uppercase tracking-wider text-[#919fa6] border-b-[0.5px] border-[#30363a] text-right">Unrealized</th>
                )}
                <SortTh
                  label="Agent"
                  sortKey="agent"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Time"
                  sortKey="time"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="h-[52px] px-4 text-[12px] font-semibold uppercase tracking-wider text-[#919fa6] border-b-[0.5px] border-[#30363a]">Resolves</th>
                <SortTh
                  label="P&L"
                  sortKey="pnl"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {isLoading && sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={tradeColSpan}
                    className="h-[200px] text-center text-[#919fa6] text-[14px]"
                  >
                    Loading trades...
                  </td>
                </tr>
              )}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={tradeColSpan}
                    className="h-[200px] text-center text-[14px]"
                  >
                    {tradesError ? (
                      <span className="text-[#FF6B8A]">Failed to load trades. Try refreshing.</span>
                    ) : (
                      <span className="text-[#919fa6]">No trades found</span>
                    )}
                  </td>
                </tr>
              )}
              {sorted.map((trade, idx) => {
                const outcomeColor =
                  trade.outcome === "Won"
                    ? "text-[#2ecc71]"
                    : trade.outcome === "Lost"
                    ? "text-[#ff6b6b]"
                    : "text-[#919fa6]";

                const isErrorTrade = trade.outcome === "Rejected" || trade.outcome === "Error" || trade.outcome === "Skipped";
                const showPnl = trade.settled && trade.pnl !== null && trade.pnl !== 0 && !isErrorTrade;
                const pnlColor = showPnl
                  ? (trade.pnl ?? 0) > 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"
                  : "text-[#919fa6]";
                const resolve = formatResolve(trade.marketCloseTime);

                return (
                  <tr
                    key={trade.id}
                    {...(idx === 0 ? { "data-tour": "trades-detail-link" } : {})}
                    onClick={() => window.open(`/trades/${trade.id}`, '_blank')}
                    className="h-[100px] cursor-pointer border-b border-border/50 hover:bg-[#1a1f25] transition-colors"
                  >
                    {/* # */}
                    <td className="px-4 text-center text-[13px] text-[#919fa6] tabular-nums">
                      {idx + 1}
                    </td>
                    {/* Market */}
                    <td className="px-4">
                      <div className="text-[14px] font-semibold text-white leading-snug truncate">
                        {trade.marketTitle}
                      </div>
                      <div className="text-[12px] text-[#919fa6] mt-0.5 capitalize">
                        {trade.exchange}
                      </div>
                    </td>
                    {/* spacer */}
                    <td />
                    {/* Outcome */}
                    <td className={`px-4 text-[13px] font-medium ${outcomeColor}`}>
                      {trade.outcome}
                    </td>
                    {/* Side */}
                    <td className="px-4 text-[13px] text-white">
                      {trade.side !== "-" ? trade.side : (
                        <span className="text-[#919fa6]">-</span>
                      )}
                    </td>
                    {/* Size */}
                    <td className="px-4 text-[13px] text-white tabular-nums text-right">
                      {trade.size !== null ? (
                        formatMoneyFull(trade.size)
                      ) : (
                        <span className="text-[#919fa6]">-</span>
                      )}
                    </td>
                    {/* Entry */}
                    <td className="px-4 text-[13px] text-white tabular-nums text-right">
                      {trade.entryPrice !== null ? (
                        `$${trade.entryPrice.toFixed(2)}`
                      ) : (
                        <span className="text-[#919fa6]">-</span>
                      )}
                    </td>
                    {/* Current (open positions only) */}
                    {showOpenCols && (
                      <td className="px-4 text-[13px] text-white tabular-nums text-right">
                        {trade.currentPrice != null ? `${(trade.currentPrice * 100).toFixed(0)}¢` : <span className="text-[#919fa6]">-</span>}
                      </td>
                    )}
                    {/* Unrealized P&L (open positions only) */}
                    {showOpenCols && (
                      <td className={`px-4 text-[13px] font-semibold tabular-nums text-right ${trade.unrealizedPnl == null ? "text-[#919fa6]" : trade.unrealizedPnl >= 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"}`}>
                        {trade.unrealizedPnl == null ? <span className="text-[#919fa6]">-</span> : `${trade.unrealizedPnl >= 0 ? "+" : ""}${formatMoneyFull(trade.unrealizedPnl)}`}
                      </td>
                    )}
                    {/* Agent */}
                    <td className="px-4 text-[13px] text-[#919fa6] truncate">
                      {trade.botName}
                    </td>
                    {/* Time */}
                    <td className="px-4 text-[13px] text-[#919fa6] whitespace-nowrap">
                      {trade.timestamp ? relativeTime(trade.timestamp) : "—"}
                    </td>
                    {/* Resolves */}
                    <td className={`px-4 text-[13px] tabular-nums whitespace-nowrap ${resolve?.soon ? "text-[#FFA500]" : "text-[#919fa6]"}`}>
                      {resolve ? resolve.text : "—"}
                    </td>
                    {/* P&L */}
                    <td className={`px-4 text-[13px] font-semibold tabular-nums text-right ${pnlColor}`}>
                      {showPnl && trade.pnl != null ? (
                        <>
                          {trade.pnl > 0 ? <TriUp /> : <TriDown />}
                          {trade.pnl > 0 ? "+" : ""}
                          {formatMoneyFull(trade.pnl)}
                        </>
                      ) : (
                        <span className="text-[#919fa6]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Mobile cards ───────────────────────────────────── */}
        <div className="md:hidden">
          {isLoading && trades.length === 0 && (
            <div className="py-16 text-center text-[#919fa6] text-[14px]">
              Loading trades...
            </div>
          )}
          {!isLoading && trades.length === 0 && (
            <div className="py-16 text-center text-[14px]">
              {tradesError ? (
                <span className="text-[#FF6B8A]">Failed to load trades. Try refreshing.</span>
              ) : (
                <span className="text-[#919fa6]">No trades found</span>
              )}
            </div>
          )}
          {sorted.map((trade) => {
            const isMobileErrorTrade = trade.outcome === "Rejected" || trade.outcome === "Error" || trade.outcome === "Skipped";
            const showMobilePnl = trade.settled && trade.pnl !== null && trade.pnl !== 0 && !isMobileErrorTrade;
            const pnlColor = showMobilePnl
              ? (trade.pnl ?? 0) > 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]"
              : "text-[#919fa6]";

            const outcomeColor =
              trade.outcome === "Won"
                ? "text-[#2ecc71]"
                : trade.outcome === "Lost"
                ? "text-[#ff6b6b]"
                : "text-[#919fa6]";

            const resolve = formatResolve(trade.marketCloseTime);

            return (
              <div
                key={trade.id}
                onClick={() => window.open(`/trades/${trade.id}`, '_blank')}
                className="px-5 py-4 border-b border-border/50 cursor-pointer active:bg-[#1a1f25]"
              >
                {/* top line: title + P&L (realized when settled, unrealized when open filter) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[14px] font-semibold text-white truncate flex-1">
                    {trade.marketTitle}
                  </div>
                  <div className={`text-[14px] font-semibold tabular-nums shrink-0 ${
                    showMobilePnl ? pnlColor
                    : showOpenCols && trade.unrealizedPnl != null ? (trade.unrealizedPnl >= 0 ? "text-[#2ecc71]" : "text-[#ff6b6b]")
                    : "text-[#919fa6]"
                  }`}>
                    {showMobilePnl && trade.pnl != null ? (
                      <>
                        {trade.pnl > 0 ? <TriUp /> : <TriDown />}
                        {trade.pnl > 0 ? "+" : ""}
                        {formatMoneyFull(trade.pnl)}
                      </>
                    ) : showOpenCols && trade.unrealizedPnl != null ? (
                      `${trade.unrealizedPnl >= 0 ? "+" : ""}${formatMoneyFull(trade.unrealizedPnl)}`
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
                {/* bottom line: outcome + size + exchange + time */}
                <div className="flex items-center gap-3 mt-1.5 text-[12px]">
                  <span className={`font-medium ${outcomeColor}`}>
                    {trade.outcome}
                  </span>
                  <span className="text-[#919fa6]">
                    {trade.size !== null ? formatMoneyFull(trade.size) : "-"}
                  </span>
                  <span className="text-[#919fa6] capitalize">
                    {trade.exchange}
                  </span>
                  {resolve && (
                    <span className={resolve.soon ? "text-[#FFA500]" : "text-[#919fa6]"}>
                      {resolve.text}
                    </span>
                  )}
                  <span className="text-[#919fa6] ml-auto">
                    {trade.timestamp ? relativeTime(trade.timestamp) : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 py-6 border-t border-[#30363a]">
          <span className="text-[13px] text-[#919fa6]">
            Showing {sorted.length} of {total ?? sorted.length} trades
          </span>
          {hasMore && !loadingMore && (
            <button
              onClick={loadMore}
              className="text-[13px] font-bold text-[#00C805] hover:text-[#00e808] transition-colors bg-transparent border-none cursor-pointer"
            >
              Load more
            </button>
          )}
          {loadingMore && (
            <span className="text-[13px] text-[#919fa6]">Loading...</span>
          )}
        </div>
      </div>
    </div>
  );
}
