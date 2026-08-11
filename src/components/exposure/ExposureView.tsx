"use client";

import { useState, useRef, useEffect } from "react";
import { ExchangeBadge, SideBadge, CategoryPill } from "@/components/ui";
import { BarChart3, Users, ChevronDown, Check } from "lucide-react";
import { useMarkets, useCategories, useMarketPositions } from "@/hooks/use-markets";
import { pnlColor } from "@/lib/utils";
import { useEnvironmentFilter } from "@/context/environment-filter";

const TODAY = new Date();

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  return d.toDateString() === TODAY.toDateString();
}
function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const weekOut = new Date(TODAY);
  weekOut.setDate(weekOut.getDate() + 7);
  return d >= TODAY && d <= weekOut;
}
function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const monthOut = new Date(TODAY);
  monthOut.setDate(monthOut.getDate() + 30);
  return d >= TODAY && d <= monthOut;
}
function isClosed(dateStr: string) {
  return new Date(dateStr) < TODAY;
}

function formatCloseDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type ExchangeFilter = "All" | "kalshi" | "polymarket";
type ClosingFilter = "All" | "Today" | "This Week" | "This Month" | "Closed";

type ViewMode = "positions" | "all";

function FilterDropdown({ value, onChange, options, className = "" }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button onClick={() => setOpen(!open)} className="h-8 flex items-center gap-2 bg-black border border-border rounded-lg text-[13px] text-white px-3 pr-7 hover:border-[#555] transition-colors whitespace-nowrap">
        {selected?.label || value}
        <ChevronDown className={`w-3 h-3 text-white/40 absolute right-2 top-1/2 -translate-y-1/2 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-black border border-border rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)] min-w-full w-max max-h-[280px] overflow-y-auto">
          {options.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                value === opt.value ? "text-white bg-white/[0.06]" : "text-white/50 hover:text-white/80 hover:bg-white/[0.03]"
              }`}>
              <span className="w-4 shrink-0">{value === opt.value && <Check className="w-3.5 h-3.5 text-white" />}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExposureView() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>("All");
  const [closingFilter, setClosingFilter] = useState<ClosingFilter>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("positions");

  const { envFilter } = useEnvironmentFilter();
  const { markets: apiMarkets, loading, loadingMore, hasMore, loadMore } = useMarkets({ category: activeCategory === "All" ? undefined : activeCategory });
  const { categories: apiCategories } = useCategories();
  const envParam = envFilter !== "all" ? envFilter : undefined;
  const { positions: marketPositions } = useMarketPositions(envParam);

  const categories = apiCategories.length > 0
    ? ["All", ...apiCategories.map((c) => c.name || c.tag)]
    : ["All"];

  // Helper: convert position group to bot array
  const positionsToBots = (group: { positions: Array<{ agent_id: string; agent_name: string; side: string; size: number; confidence: number; pnl: number }> } | undefined) =>
    (group?.positions ?? []).map(p => ({
      botId: p.agent_id,
      botName: p.agent_name,
      side: p.side as "YES" | "NO",
      size: p.size,
      confidence: p.confidence,
      pnl: p.pnl,
    }));

  // Build market list from exchange API, enriched with DB positions
  const apiMarketList = apiMarkets.map((m) => ({
        id: m.ticker, title: m.title, ticker: m.ticker,
        category: m.category || "Other", exchange: (m.exchange || "kalshi") as "kalshi" | "polymarket",
        yesPrice: m.yes_price, volume: m.volume,
        closeDate: m.close_time ?? "2099-01-01",
        bots: positionsToBots(marketPositions[m.ticker]),
      }));

  // In "My Positions" mode: also include position markets not in the exchange API
  // (e.g., closed/expired markets where user still has unsettled trades)
  const apiTickerSet = new Set(apiMarkets.map(m => m.ticker));
  const positionOnlyMarkets = viewMode === "positions"
    ? Object.entries(marketPositions)
        .filter(([ticker]) => !apiTickerSet.has(ticker))
        .map(([ticker, group]) => ({
          id: ticker, title: group.title || ticker, ticker,
          category: "Other", exchange: "kalshi" as "kalshi" | "polymarket",
          yesPrice: 0, volume: 0,
          closeDate: "",
          bots: positionsToBots(group),
        }))
    : [];

  const baseMarkets = [...apiMarketList, ...positionOnlyMarkets];

  // In live mode with "positions" view, only show markets where bots have positions
  const viewFiltered = viewMode === "positions"
    ? baseMarkets.filter((m) => m.bots.length > 0)
    : apiMarketList; // "All Markets" only shows exchange API markets (not position-only)

  const filtered = viewFiltered
    .filter((m) => activeCategory === "All" || m.category === activeCategory)
    .filter((m) => exchangeFilter === "All" || m.exchange === exchangeFilter)
    .filter((m) => {
      if (closingFilter === "All")        return true;
      if (closingFilter === "Today")      return isToday(m.closeDate);
      if (closingFilter === "This Week")  return isThisWeek(m.closeDate);
      if (closingFilter === "This Month") return isThisMonth(m.closeDate);
      if (closingFilter === "Closed")     return isClosed(m.closeDate);
      return true;
    });

  const grouped = filtered.reduce((acc, m) => {
    const cat = m.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as Record<string, any[]>);

  const EXCHANGE_OPTIONS: { value: ExchangeFilter; label: string }[] = [
    { value: "All", label: "All Exchanges" },
    { value: "kalshi", label: "Kalshi" },
    { value: "polymarket", label: "Polymarket" },
  ];

  const CLOSING_OPTIONS: { value: ClosingFilter; label: string }[] = [
    { value: "All", label: "All" },
    { value: "Today", label: "Today" },
    { value: "This Week", label: "This Week" },
    { value: "This Month", label: "This Month" },
    { value: "Closed", label: "Closed" },
  ];

  return (
    <>
      {/* Subtitle */}
      <p className="text-[13px] text-text-tertiary mt-1 mb-6">
        {filtered.length} markets{viewMode === "positions" ? " with agent positions" : " across all bots"}
      </p>

      {/* View mode toggle */}
      <div className="flex items-center gap-1 mb-4 bg-[#0a0a0a] border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode("positions")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            viewMode === "positions"
              ? "bg-[#111] text-text-primary"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          My Positions
        </button>
        <button
          onClick={() => setViewMode("all")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            viewMode === "all"
              ? "bg-[#111] text-text-primary"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          All Markets
        </button>
      </div>

      {/* Filters — single row of dropdowns */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {categories.length > 1 && (
          <FilterDropdown
            value={activeCategory}
            onChange={setActiveCategory}
            options={[
              ...categories.map(c => ({ value: String(c), label: c === "All" ? "All Categories" : String(c) }))
            ]}
          />
        )}
        <FilterDropdown
          value={exchangeFilter}
          onChange={(v) => setExchangeFilter(v as ExchangeFilter)}
          options={EXCHANGE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
        <FilterDropdown
          value={closingFilter}
          onChange={(v) => setClosingFilter(v as ClosingFilter)}
          options={CLOSING_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
      </div>

      {/* Markets list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-[13px]">
          {loading ? "Loading markets..." : viewMode === "positions"
            ? "No agent positions yet. Deploy an agent to start trading, or switch to \"All Markets\" to browse."
            : "No markets available"}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, categoryMarkets]) => (
            <div key={category}>
              {/* Category section header */}
              <div className="flex items-center gap-2 mb-3">
                <CategoryPill category={category} />
                <span className="text-[12px] text-text-tertiary">{categoryMarkets.length} markets</span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {categoryMarkets.map((market) => {
                  const closed = isClosed(market.closeDate);
                  return (
                    <div
                      key={market.id}
                      className={`border rounded-xl overflow-hidden transition-colors ${
                        closed
                          ? "bg-black border-border opacity-70"
                          : "bg-black border-border hover:border-border"
                      }`}
                    >
                      <div className="p-5">
                        {/* Top row: title + YES price */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-[13px] font-semibold text-text-primary leading-snug">
                                {market.title}
                              </h3>
                              {closed && (
                                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0a0a0a] text-text-tertiary border border-border">
                                  CLOSED
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <ExchangeBadge exchange={market.exchange} />
                              <span className="text-[11px] font-mono text-text-tertiary">{market.ticker}</span>
                              <span className="text-[11px] text-text-tertiary/40">·</span>
                              <span className="text-[11px] text-text-tertiary">
                                {closed ? "Closed" : "Closes"} {formatCloseDate(market.closeDate)}
                              </span>
                              {isToday(market.closeDate) && !closed && (
                                <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded">
                                  Closes Today
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-0.5">YES Price</div>
                            <div className="text-[22px] font-bold text-text-primary tabular-nums leading-none">
                              {market.yesPrice.toFixed(0)}<span className="text-[13px] font-medium text-text-tertiary">¢</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 border-t border-border pt-3">
                          <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-text-secondary font-medium">${(market.volume / 1000).toFixed(0)}k</span>
                            <span>vol</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                            <Users className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-text-secondary font-medium">{market.bots.length}</span>
                            <span>agents trading</span>
                          </div>
                        </div>

                        {/* Bot positions */}
                        {market.bots.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                            <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">
                              Agent Positions
                            </div>
                            {market.bots.map((bp: { botId: string; botName: string; side: "YES" | "NO"; size: number; confidence: number; pnl: number }) => (
                              <div
                                key={bp.botId}
                                className="flex items-center justify-between py-2 px-3 bg-[#0a0a0a] rounded-lg border border-border"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-text-primary">{bp.botName}</span>
                                  <SideBadge side={bp.side} />
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-[12px] text-text-tertiary tabular-nums">${bp.size.toFixed(0)}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-text-tertiary/60">conf</span>
                                    <span className="text-[12px] font-medium text-text-secondary tabular-nums">{bp.confidence}%</span>
                                  </div>
                                  <span className={`text-[13px] font-semibold tabular-nums ${pnlColor(bp.pnl)}`}>
                                    {bp.pnl >= 0 ? "+" : ""}${Math.abs(bp.pnl).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}

                            {/* Consensus indicator */}
                            {market.bots.length >= 2 && (() => {
                              const yesBots = market.bots.filter((b: { side: string }) => b.side === "YES").length;
                              const noBots = market.bots.filter((b: { side: string }) => b.side === "NO").length;
                              const isAgreement = yesBots === 0 || noBots === 0;
                              return (
                                <div className={`mt-2 px-3 py-2 rounded-lg text-[12px] font-medium ${
                                  isAgreement ? "bg-gain/10 text-gain border border-gain/20" : "bg-warning/10 text-warning border border-warning/20"
                                }`}>
                                  {isAgreement
                                    ? `All ${market.bots.length} agents agree on ${yesBots > 0 ? "YES" : "NO"}`
                                    : `Divergence: ${yesBots} agent${yesBots > 1 ? "s" : ""} YES vs ${noBots} agent${noBots > 1 ? "s" : ""} NO`
                                  }
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-[13px] font-medium text-gain hover:text-gain/80 transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load More Markets"}
          </button>
        </div>
      )}
    </>
  );
}
