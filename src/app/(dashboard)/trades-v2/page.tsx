"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatMoneyFull } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useTrades } from "@/hooks/use-trades";
import { useAgents } from "@/hooks/use-agents";
import { trades as tradesApi, type TradeStats } from "@/lib/api";

import { useEnvironmentFilter } from "@/context/environment-filter";
import { useWalkthrough } from "@/context/walkthrough";

/* ────────────────────────────────────────────────────────────── */
/*  Helpers (same as trades page)                                  */
/* ────────────────────────────────────────────────────────────── */

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
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}


/* ────────────────────────────────────────────────────────────── */
/*  Filter Sidebar Section                                         */
/* ────────────────────────────────────────────────────────────── */


function FilterSection({
  label,
  options,
  value,
  onChange,
  isOpen,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const isActive = value !== "all" && value !== "ALL";
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 px-6 hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[15px] text-[#ffffff] font-semibold">{label}</span>
        <div className="flex items-center gap-2.5">
          {isActive && (
            <div className="w-2 h-2 rounded-full bg-gain" />
          )}
          <ChevronRight
            className={`w-4 h-4 text-[#919fa6] transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        </div>
      </button>
      {isOpen && (
        <div className="pb-4 px-6 space-y-1 animate-fade-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="w-full flex items-center justify-between py-3 px-1 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <span className={`text-[14px] ${value === opt.value ? "text-[#ffffff] font-semibold" : "text-[#919fa6]"}`}>
                {opt.label}
              </span>
              <div
                className={`w-[18px] h-[18px] rounded-full border-2 transition-colors flex items-center justify-center ${
                  value === opt.value
                    ? "border-[#ffffff] bg-[#ffffff]"
                    : "border-border hover:border-[#919fa6]"
                }`}
              >
                {value === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-black" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Sort types                                                     */
/* ────────────────────────────────────────────────────────────── */

type SortKey = "time" | "agent" | "market" | "exchange" | "side" | "size" | "entry" | "conf" | "outcome" | "pnl";
type SortDir = "asc" | "desc";

/* ────────────────────────────────────────────────────────────── */
/*  Main Page                                                      */
/* ────────────────────────────────────────────────────────────── */

export default function TradesPage() {
  /* ── Filter state ── */
  const [botFilter, setBotFilter] = useState("all");
  const [tradeView, setTradeView] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [statsTimeRange, setStatsTimeRange] = useState("ALL");

  const { envFilter, setEnvFilter } = useEnvironmentFilter();

  /* ── Open filter sections ── */
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggleSection = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

  /* ── Sort state ── */
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const router = useRouter();
  /* ── Data hooks ── */
  const { trades: apiTrades, loading, loadingMore, hasMore, loadMore, counts: apiCounts } = useTrades({
    agent_id: botFilter !== "all" ? botFilter : undefined,
    status: tradeView !== "all" ? tradeView : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    environment: envFilter !== "all" ? envFilter : undefined,
    exchange: exchangeFilter !== "all" ? exchangeFilter : undefined,
    outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
    time_range: statsTimeRange !== "ALL" ? statsTimeRange : undefined,
    per_page: 25,
  });
  const { agents } = useAgents();

  /* ── Server stats ── */
  const { demoMode } = useWalkthrough();
  const [serverStats, setServerStats] = useState<TradeStats | null>(null);
  useEffect(() => {
    if (demoMode) return;
    tradesApi
      .stats({
        agent_id: botFilter !== "all" ? botFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        exchange: exchangeFilter !== "all" ? exchangeFilter : undefined,
        environment: envFilter !== "all" ? envFilter : undefined,
        time_range: statsTimeRange,
      })
      .then(setServerStats)
      .catch(() => {});
  }, [botFilter, categoryFilter, exchangeFilter, envFilter, statsTimeRange, demoMode]);

  /* ── Map API trades ── */

  const trades = apiTrades.map((t) => ({
    id: t.id,
    timestamp: t.timestamp,
    marketTitle:
      t.market_title && t.market_title !== t.market_ticker
        ? t.market_title
        : cleanTicker(t.market_ticker),
    botId: t.agent_id,
    botName: agents.find((a) => a.id === t.agent_id)?.name || t.agent_id?.slice(0, 8) || "—",
    category: t.category || "Other",
    exchange: (t.exchange || "kalshi") as "kalshi" | "polymarket",
    side: t.side.toUpperCase() as "YES" | "NO",
    size: t.total_cost,
    entryPrice: t.price,
    exitPrice: t.settled && t.pnl != null && t.count > 0
      ? Math.max(0, (t.total_cost + t.pnl) / t.count)
      : null,
    confidence: t.confidence != null ? Math.round(t.confidence * 100) : null,
    pnl: t.pnl,
    status: t.settled
      ? t.status
      : t.status === "executed" || t.status === "paper"
        ? "open"
        : t.status,
    settled: t.settled,
    environment: t.environment || "training",
    reasoning: t.raw_reasoning || t.bot_reasoning || "No reasoning provided",
    validatorDecision: t.status === "skipped" ? "Skipped" : t.rules_result === "passed" ? "Approved" : t.rules_result ? "Rejected" : "Approved",
    validatorReason: t.ai_verdict || t.ai_reasoning || null,
    failedRule: t.status === "skipped" ? null : (t.rules_result && t.rules_result !== "passed" && t.rules_result !== "rejected" ? t.rules_result : null),
    // Counterfactual tracking
    cf_settled: t.cf_settled || false,
    cf_pnl: t.cf_pnl ?? null,
    cf_market_result: t.cf_market_result ?? null,
    cf_settled_at: t.cf_settled_at ?? null,
    cf_count: t.cf_count ?? null,
  }));

  /* ── All filters are now server-side — no client filtering needed ── */
  const filtered = trades.filter(() => {
    return true;
  });

  /* ── Sort ── */
  const sorted = [...filtered].sort((a, b) => {
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
        return dir * (a.size - b.size);
      case "entry":
        return dir * (a.entryPrice - b.entryPrice);
      case "conf":
        return dir * ((a.confidence ?? 0) - (b.confidence ?? 0));
      case "outcome": {
        const order = (s: string) =>
          s === "won" ? 3 : s === "lost" ? 2 : s === "pending" ? 1 : 0;
        const oa = a.settled ? ((a.pnl ?? 0) > 0 ? "won" : (a.pnl ?? 0) < 0 ? "lost" : "breakeven") : "pending";
        const ob = b.settled ? ((b.pnl ?? 0) > 0 ? "won" : (b.pnl ?? 0) < 0 ? "lost" : "breakeven") : "pending";
        return dir * (order(oa) - order(ob));
      }
      case "pnl":
        return dir * ((a.pnl ?? 0) - (b.pnl ?? 0));
      default:
        return 0;
    }
  });

  /* ── Helpers ── */
  const hasActiveFilters =
    botFilter !== "all" ||
    tradeView !== "all" ||
    outcomeFilter !== "all" ||
    categoryFilter !== "all" ||
    exchangeFilter !== "all" ||
    statsTimeRange !== "ALL" ||
    envFilter !== "all";

  const clearFilters = () => {
    setBotFilter("all");
    setTradeView("all");
    setOutcomeFilter("all");
    setCategoryFilter("all");
    setExchangeFilter("all");
    setStatsTimeRange("ALL");
    setEnvFilter("all");
  };

  const totalTrades = serverStats?.total_trades ?? sorted.length;

  /* ── Column header component ── */
  function ColHeader({
    label,
    sortId,
    align = "left",
  }: {
    label: string;
    sortId: SortKey;
    align?: "left" | "right" | "center";
  }) {
    const isActive = sortKey === sortId;
    return (
      <div
        className={`text-${align} cursor-pointer select-none group`}
        onClick={() => toggleSort(sortId)}
      >
        <span
          className={`text-[11px] uppercase tracking-wider font-medium transition-colors pb-2 ${
            isActive
              ? "text-[#ffffff] border-b-2 border-[#ffffff]"
              : "text-[#919fa6] group-hover:text-[#919fa6]"
          }`}
        >
          {label}
          {isActive && (
            <span className="ml-1 text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
          )}
        </span>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════ */
  /*  RENDER                                                      */
  /* ════════════════════════════════════════════════════════════ */

  return (
    <div className="relative animate-fade-in h-[calc(100vh-56px)] -mt-14 md:-mt-16 -mb-20 md:-mb-8">
      {/* Two-panel layout — fills viewport, no page scroll */}
      <div className="flex gap-3 h-full px-2">
        {/* ── LEFT: Filter Sidebar ── */}
        <div className="w-[260px] shrink-0 border border-border rounded-xl flex flex-col overflow-y-auto hidden lg:flex">
          {/* Sidebar header */}
          <div className="px-6 py-5">
            <h2 className="text-[18px] font-bold text-[#ffffff]">Filters</h2>
          </div>

          <FilterSection
            label="Agent"
            value={botFilter}
            onChange={setBotFilter}
            isOpen={openSection === "agent"}
            onToggle={() => toggleSection("agent")}
            options={[
              { value: "all", label: "All Agents" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <FilterSection
            label="Status"
            value={tradeView}
            onChange={setTradeView}
            isOpen={openSection === "status"}
            onToggle={() => toggleSection("status")}
            options={[
              { value: "all", label: "All Outcomes" },
              { value: "approved", label: `Approved (${apiCounts.approved})` },
              { value: "rejected", label: `Rejected (${apiCounts.rejected})` },
              { value: "skipped", label: `Skipped (${apiCounts.skipped})` },
            ]}
          />
          <FilterSection
            label="Outcome"
            value={outcomeFilter}
            onChange={setOutcomeFilter}
            isOpen={openSection === "outcome"}
            onToggle={() => toggleSection("outcome")}
            options={[
              { value: "all", label: "All Results" },
              { value: "won", label: "Won" },
              { value: "lost", label: "Lost" },
              { value: "pending", label: "Pending" },
            ]}
          />
          <FilterSection
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            isOpen={openSection === "category"}
            onToggle={() => toggleSection("category")}
            options={[
              { value: "all", label: "All Categories" },
              { value: "Politics", label: "Politics" },
              { value: "Crypto", label: "Crypto" },
              { value: "Sports", label: "Sports" },
              { value: "Economics", label: "Economics" },
              { value: "Climate", label: "Climate" },
            ]}
          />
          <FilterSection
            label="Exchange"
            value={exchangeFilter}
            onChange={setExchangeFilter}
            isOpen={openSection === "exchange"}
            onToggle={() => toggleSection("exchange")}
            options={[
              { value: "all", label: "All Exchanges" },
              { value: "kalshi", label: "Kalshi" },
              { value: "polymarket", label: "Polymarket" },
            ]}
          />
          <FilterSection
            label="Environment"
            value={envFilter}
            onChange={(v) => setEnvFilter(v as "all" | "training" | "actual")}
            isOpen={openSection === "environment"}
            onToggle={() => toggleSection("environment")}
            options={[
              { value: "all", label: "All Environments" },
              { value: "training", label: "Training" },
              { value: "actual", label: "Live" },
            ]}
          />
          <FilterSection
            label="Time Range"
            value={statsTimeRange}
            onChange={setStatsTimeRange}
            isOpen={openSection === "time"}
            onToggle={() => toggleSection("time")}
            options={[
              { value: "ALL", label: "All Time" },
              { value: "1D", label: "Last 24 Hours" },
              { value: "1W", label: "Last 7 Days" },
              { value: "1M", label: "Last 30 Days" },
              { value: "3M", label: "Last 3 Months" },
              { value: "1Y", label: "Last Year" },
            ]}
          />

          {/* Spacer to push button to bottom */}
          <div className="flex-1" />
          {/* Bottom buttons */}
          <div className="px-6 py-4 flex gap-3 border-t border-border">
            <button
              onClick={clearFilters}
              className={`flex-1 py-2.5 rounded-lg border text-[13px] font-medium transition-colors ${
                hasActiveFilters
                  ? "border-border text-[#ffffff] hover:bg-[#1a1f25]"
                  : "border-border text-[#919fa6] cursor-not-allowed"
              }`}
              disabled={!hasActiveFilters}
            >
              Clear all
            </button>
          </div>
        </div>

        {/* ── RIGHT: Table ── */}
        <div className="flex-1 min-w-0 border border-border rounded-xl overflow-hidden flex flex-col">
          {/* Table heading */}
          <div className="px-4 md:px-8 py-7 border-b border-border">
            <div className="flex items-center gap-3">
              <Image src="/trades-icon.png" alt="Trades" width={96} height={96} className="rounded" />
              <div>
                <h1 className="text-[24px] md:text-[28px] font-bold text-[#ffffff] tracking-tight">Trades Executed</h1>
                <p className="text-[13px] text-[#919fa6] mt-1">
                  {totalTrades} trade{totalTrades !== 1 ? "s" : ""} · Updated just now
                </p>
              </div>
            </div>
          </div>

          {/* Stats row — clean, no borders */}
          <div className="px-4 md:px-8 py-6 border-b border-border grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8">
            <div>
              <div className="text-[12px] text-[#919fa6] uppercase tracking-wider mb-1">Net P&L</div>
              <div className={`text-[20px] font-bold tabular-nums ${
                (serverStats?.net_pnl ?? 0) > 0 ? "text-gain" : (serverStats?.net_pnl ?? 0) < 0 ? "text-loss" : "text-[#ffffff]"
              }`}>
                {(serverStats?.net_pnl ?? 0) > 0 ? "+" : ""}{formatMoneyFull(serverStats?.net_pnl ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-[#919fa6] uppercase tracking-wider mb-1">Trades</div>
              <div className="text-[20px] font-bold text-[#ffffff] tabular-nums">{serverStats?.total_trades ?? 0}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#919fa6] uppercase tracking-wider mb-1">Open</div>
              <div className="text-[20px] font-bold text-[#ffffff] tabular-nums">{serverStats?.open_positions ?? 0}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#919fa6] uppercase tracking-wider mb-1">Win Rate</div>
              <div className="text-[20px] font-bold text-[#ffffff] tabular-nums">{serverStats?.win_pct ?? 0}%</div>
            </div>
            <div>
              <div className="text-[12px] text-[#919fa6] uppercase tracking-wider mb-1">Avg Confidence</div>
              <div className="text-[20px] font-bold text-[#ffffff] tabular-nums">{serverStats?.avg_conf ?? 0}%</div>
            </div>
          </div>

          {/* ── Mobile card view ── */}
          <div className="md:hidden flex-1 overflow-y-auto" data-tour="trades-list-mobile">
            {loading && sorted.length === 0 ? (
              <div className="text-center py-20 text-[#919fa6] text-[14px]">Loading trades...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-20 text-[#919fa6] text-[14px]">No trades found</div>
            ) : (
              sorted.map((trade) => {
                const isSkipped = trade.status === "skipped";
                const isRejected = trade.status === "rejected" || trade.status === "error";
                const outcome = isSkipped ? "skipped" : isRejected ? "rejected" : trade.settled ? (trade.pnl ?? 0) > 0 ? "won" : (trade.pnl ?? 0) < 0 ? "lost" : "breakeven" : "pending";
                return (
                  <div
                    key={trade.id}
                    className="px-4 py-4 border-b border-border active:bg-[#1a1f25] cursor-pointer"
                    onClick={() => router.push(`/trades/${trade.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-[13px] text-[#ffffff] font-medium leading-snug flex-1 min-w-0">{trade.marketTitle}</p>
                      {trade.pnl !== null ? (
                        <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-[#ffffff]"}`}>
                          {formatMoneyFull(trade.pnl)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#919fa6] shrink-0">—</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-[#919fa6]">
                      <span className={`font-medium ${outcome === "won" ? "text-gain" : outcome === "lost" || outcome === "rejected" ? "text-loss" : outcome === "skipped" ? "text-[#919fa6]" : "text-[#919fa6]/50"}`}>
                        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                      </span>
                      <span className="opacity-40">·</span>
                      <span className="tabular-nums">{isSkipped ? "—" : `$${trade.size.toFixed(0)}`}</span>
                      <span className="opacity-40">·</span>
                      <span className="capitalize">{trade.exchange}</span>
                      <span className="opacity-40">·</span>
                      <span className="tabular-nums">{relativeTime(trade.timestamp)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Desktop table view ── */}
          <div className="hidden md:flex flex-1 flex-col overflow-y-auto overflow-x-auto" data-tour="trades-list">
            {/* Column headers — inside scroll container so they scroll horizontally with rows */}
            <div
              className="sticky top-0 z-10 grid items-center px-8 py-3.5 border-b border-border bg-bg"
              style={{ gridTemplateColumns: "44px 100px 2.5fr 120px 100px 100px 160px 120px 110px", gap: "0 32px", minWidth: "1300px" }}
            >
              <span className="text-[11px] text-[#919fa6]/60 uppercase tracking-wider">#</span>
              <ColHeader label="Time" sortId="time" />
              <ColHeader label="Market" sortId="market" />
              <ColHeader label="Outcome" sortId="outcome" />
              <ColHeader label="Size" sortId="size" align="right" />
              <ColHeader label="Entry" sortId="entry" align="right" />
              <ColHeader label="Agent" sortId="market" />
              <ColHeader label="Exchange" sortId="exchange" />
              <ColHeader label="P&L" sortId="pnl" align="right" />
            </div>

            {loading && sorted.length === 0 ? (
              <div className="text-center py-20 text-[#919fa6] text-[14px]">Loading trades...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-20 text-[#919fa6] text-[14px]">No trades found</div>
            ) : (
              sorted.map((trade, idx) => {
                const isRejected = trade.status === "rejected" || trade.status === "error";
                const isSkipped = trade.status === "skipped";
                const outcome = isSkipped
                  ? "skipped"
                  : isRejected
                    ? "rejected"
                    : trade.settled
                      ? (trade.pnl ?? 0) > 0 ? "won" : (trade.pnl ?? 0) < 0 ? "lost" : "breakeven"
                      : "pending";

                return (
                  <div
                    key={trade.id}
                    className="grid items-center px-8 py-5 border-b border-border hover:bg-[#1a1f25] transition-colors cursor-pointer group"
                    style={{ gridTemplateColumns: "44px 100px 2.5fr 120px 100px 100px 160px 120px 110px", gap: "0 32px", minWidth: "1300px" }}
                    onClick={() => router.push(`/trades/${trade.id}`)}
                  >
                    {/* # */}
                    <span className="text-[12px] text-[#919fa6] tabular-nums">{idx + 1}</span>

                    {/* Time */}
                    <div title={new Date(trade.timestamp).toLocaleString()}>
                      <span className="text-[13px] text-[#919fa6] tabular-nums">{relativeTime(trade.timestamp)}</span>
                    </div>

                    {/* Market */}
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#ffffff] font-medium truncate">{trade.marketTitle}</p>
                    </div>

                    {/* Outcome */}
                    <div>
                      <span className={`text-[13px] font-medium ${
                        outcome === "won" ? "text-gain"
                          : outcome === "lost" ? "text-loss"
                            : outcome === "rejected" ? "text-loss"
                              : outcome === "skipped" ? "text-[#919fa6]"
                                : "text-[#919fa6]/50"
                      }`}>
                        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                      </span>
                    </div>

                    {/* Size */}
                    <div className="text-right">
                      <span className="text-[13px] text-[#ffffff] tabular-nums">{isSkipped ? "—" : `$${trade.size.toFixed(0)}`}</span>
                    </div>

                    {/* Entry */}
                    <div className="text-right">
                      <span className="text-[13px] text-[#ffffff] tabular-nums">{isSkipped ? "—" : `$${trade.entryPrice.toFixed(2)}`}</span>
                    </div>

                    {/* Agent */}
                    <div className="min-w-0">
                      <span className="text-[13px] text-[#919fa6] truncate block">{trade.botName}</span>
                    </div>

                    {/* Exchange */}
                    <div>
                      <span className="text-[13px] text-[#919fa6] capitalize">{trade.exchange}</span>
                    </div>

                    {/* P&L */}
                    <div className="text-right">
                      {trade.pnl !== null ? (
                        <span className={`text-[13px] font-medium tabular-nums ${
                          trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-[#ffffff]"
                        }`}>
                          {formatMoneyFull(trade.pnl)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#919fa6]">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="px-4 md:px-8 py-5 border-t border-border text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-[13px] text-[#919fa6] hover:text-[#ffffff] font-medium transition-colors disabled:opacity-30"
              >
                {loadingMore ? "Loading..." : "View more"}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
