"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Play } from "lucide-react";
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useEnvironmentFilter, type EnvironmentFilter } from "@/context/environment-filter";
import { useToast } from "@/components/toast";
import { formatCurrency, pnlColor, formatResolve } from "@/lib/utils";
import { usePortfolioStats, useKalshiBalance } from "@/hooks/use-portfolio";
import { useAgents } from "@/hooks/use-agents";
import { useTrades } from "@/hooks/use-trades";

/* ════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════ */

function cleanTicker(ticker: string): string {
  if (!ticker) return "Unknown";
  return ticker
    .replace(/^(KX|INX|FED|CPI)/, "")
    .split("-")[0]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())
    .trim() || ticker;
}

function shortDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const strategies = [
  { id: "polymarket-v2", name: "Council V2 (Polymarket)", exchange: "polymarket" },
  { id: "kalshi-v2", name: "Council V2 (Kalshi)", exchange: "kalshi" },
];

/* ════════════════════════════════════════════════════════════════ */
/*  COMPONENTS                                                      */
/* ════════════════════════════════════════════════════════════════ */

function FilterDropdown({ label, options, value, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = options.find((o) => o.value === value)?.label;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[13px] text-[#919fa6] hover:text-white transition-colors">
        <span>{activeLabel || label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 min-w-[160px] bg-[#141414] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl z-50">
            {options.map((o) => (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${value === o.value ? "text-white font-medium bg-white/[0.06]" : "text-[#919fa6] hover:bg-white/[0.04]"}`}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Robinhood-style P&L chart (no axes, clean line + gradient) ── */
function PnlChart({ data, height }: { data: { date: string; value: number }[]; height: number }) {
  const isPositive = data.length > 1 && data[data.length - 1]!.value >= data[0]!.value;
  const color = isPositive ? "#00C807" : "#FF6B8A";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: -5 }}>
        <defs>
          <linearGradient id="pnlGradV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" axisLine={false} tickLine={false}
          tick={{ fontSize: 10, fill: "#555", dy: -2 }} interval="preserveStartEnd" minTickGap={40} />
        <YAxis axisLine={false} tickLine={false}
          tick={{ fontSize: 10, fill: "#555", dx: -2 }} width={45}
          tickFormatter={(v: number) => `$${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(0)}`} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null;
          const val = Number(payload[0].value);
          return (
            <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg">
              <div className="text-[11px] text-[#919fa6] mb-0.5">{payload[0].payload.date}</div>
              <div className={`text-[13px] font-semibold tabular-nums ${val >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                {val >= 0 ? "+" : ""}${val.toFixed(2)}
              </div>
            </div>
          );
        }} cursor={{ stroke: "#333", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
          fill="url(#pnlGradV2)" dot={false} activeDot={{ r: 4, fill: color, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  PAGE                                                            */
/* ════════════════════════════════════════════════════════════════ */

export default function PortfolioV2Page() {
  const router = useRouter();
  const toast = useToast();

  /* ── Filters ── */
  const { envFilter, setEnvFilter } = useEnvironmentFilter();
  const [chartPeriod, setChartPeriod] = useState("1M");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [positionTab, setPositionTab] = useState<"open" | "settled">("open");
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [showAllSettled, setShowAllSettled] = useState(false);
  const VISIBLE_ROWS = 5;

  /* Deploy card state */
  const [selectedStrategy, setSelectedStrategy] = useState(strategies[0]!.id);
  const [deployDuration, setDeployDuration] = useState(1440);
  const [capitalLimit, setCapitalLimit] = useState("training");
  const [deploying, setDeploying] = useState(false);

  const periods = ["1D", "1W", "1M", "3M", "1Y", "All"];

  /* ── Hook calls ── */
  const envParam = envFilter !== "all" ? envFilter : undefined;
  const exchangeParam = exchangeFilter !== "all" ? exchangeFilter : undefined;
  const { balance: kalshiBalance, loading: balanceLoading } = useKalshiBalance();
  const { stats: portfolioStats } = usePortfolioStats(envParam, chartPeriod === "All" ? "ALL" : chartPeriod, exchangeParam);
  const { agents: apiAgents, loading: agentsLoading, deploy: deployAgent } = useAgents(envParam);
  const { trades: allTrades, total: totalTradeCount, counts: tradeCounts } = useTrades({
    environment: envParam,
    exchange: exchangeParam,
    per_page: 200,
  });

  const dataReady = !balanceLoading && !agentsLoading;

  const handleDeploy = useCallback(async () => {
    if (deploying) return;
    setDeploying(true);
    try {
      const strategy = strategies.find(s => s.id === selectedStrategy);
      if (!strategy) return;
      // Find the real agent by bot_type_id — strategy.id is a bot_type_id, not an agent UUID
      const matchingAgent = apiAgents?.find(a => a.bot_type_id === strategy.id);
      const agentId = matchingAgent?.id ?? strategy.id;
      const mode = capitalLimit === "live" ? "live" : "training";
      await deployAgent(agentId, mode, 0, { duration_minutes: deployDuration || undefined });
      toast.success(`${strategy.name} deployed`);
      router.push("/terminal");
    } catch (e) {
      console.error("Deploy failed:", e);
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }, [deploying, selectedStrategy, capitalLimit, deployDuration, deployAgent, apiAgents, toast, router]);

  /* ── Balance (combined or per-exchange) ── */
  const balanceData = useMemo(() => {
    if (exchangeFilter !== "all" && kalshiBalance?.exchanges) {
      const ex = kalshiBalance.exchanges[exchangeFilter as "kalshi" | "polymarket"];
      return { portfolioValue: ex?.portfolio_value ?? 0, cash: ex?.balance ?? 0 };
    }
    return { portfolioValue: kalshiBalance?.portfolio_value ?? 0, cash: kalshiBalance?.balance ?? 0 };
  }, [kalshiBalance, exchangeFilter]);

  /* ── Agents (filtered by exchange) ── */
  const agents = useMemo(() => {
    let f = apiAgents.filter((a) => a.status === "running" || a.trade_count > 0);
    if (exchangeFilter !== "all") f = f.filter((a) => a.exchange === exchangeFilter);
    return f;
  }, [apiAgents, exchangeFilter]);

  /* ── Agent IDs for filtering positions by exchange ── */
  const agentIdsByExchange = useMemo(() => {
    if (exchangeFilter === "all") return null;
    return new Set(apiAgents.filter((a) => a.exchange === exchangeFilter).map((a) => a.id));
  }, [apiAgents, exchangeFilter]);

  /* ── P&L from agents ── */
  const agentTotalPnl = useMemo(() => agents.reduce((s, a) => s + a.total_pnl, 0), [agents]);
  const agentTotalWins = useMemo(() => agents.reduce((s, a) => s + a.win_count, 0), [agents]);
  const agentTotalTrades = useMemo(() => agents.reduce((s, a) => s + a.trade_count, 0), [agents]);

  /* ── Trade stats (aggregate P&L only — settled tab uses server-side portfolioStats) ── */
  const tradeStats = useMemo(() => {
    const withPnl = allTrades.filter((t) => t.pnl != null && t.pnl !== 0 && t.status !== "error" && t.status !== "rejected" && t.status !== "skipped");

    const tradePnlSum = withPnl.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const totalPnl = agents.length > 0 ? agentTotalPnl : tradePnlSum;

    const tradeWins = withPnl.filter((t) => (t.pnl ?? 0) > 0).length;
    const tradeLosses = withPnl.filter((t) => (t.pnl ?? 0) < 0).length;
    const agentTotalSettled = agents.reduce((s, a) => s + (a.settled_count ?? 0), 0);
    const winRate = agentTotalSettled > 0
      ? Math.round((agentTotalWins / agentTotalSettled) * 100)
      : (tradeWins + tradeLosses > 0 ? Math.round((tradeWins / (tradeWins + tradeLosses)) * 100) : 0);

    const sorted = [...withPnl].sort((a, b) => new Date(b.settled_at || b.timestamp).getTime() - new Date(a.settled_at || a.timestamp).getTime());
    let winStreak = 0;
    for (const t of sorted) { if ((t.pnl ?? 0) > 0) winStreak++; else break; }

    const initialCapital = balanceData.portfolioValue - totalPnl;
    const pnlPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;

    return { totalPnl, pnlPct, winRate, winStreak };
  }, [allTrades, balanceData.portfolioValue, agentTotalPnl, agentTotalWins, agents]);

  /* ── Open positions (filtered by exchange via agent IDs) ── */
  const openPositions = useMemo(() => {
    const all = portfolioStats?.open_positions ?? [];
    const filtered = agentIdsByExchange ? all.filter((p) => agentIdsByExchange.has(p.agent_id)) : all;
    // Sort soonest-to-resolve first; positions with no/invalid date go last.
    return [...filtered].sort((a, b) => {
      const pa = a.market_close_time ? Date.parse(a.market_close_time) : NaN;
      const pb = b.market_close_time ? Date.parse(b.market_close_time) : NaN;
      const sa = isNaN(pa) ? Number.POSITIVE_INFINITY : pa;
      const sb = isNaN(pb) ? Number.POSITIVE_INFINITY : pb;
      return sa - sb;
    });
  }, [portfolioStats, agentIdsByExchange]);

  const positionsValue = balanceData.portfolioValue - balanceData.cash;

  /* ── P&L chart: cumulative trade wins - losses over time ── */
  const pnlChartData = useMemo(() => {
    const settled = allTrades
      .filter((t) => t.pnl != null && t.pnl !== 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (settled.length === 0) return [{ date: "Now", value: 0 }];

    const now = Date.now();
    const periodMs: Record<string, number> = {
      "1D": 86400000,
      "1W": 604800000,
      "1M": 2592000000,
      "3M": 7776000000,
      "1Y": 31536000000,
      "All": Infinity,
    };
    const cutoff = now - (periodMs[chartPeriod] ?? 2592000000);
    const filtered = chartPeriod === "All" ? settled : settled.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
    if (filtered.length === 0) return [{ date: "Now", value: 0 }];

    const bucketKey = (d: Date): string => {
      if (chartPeriod === "1D") return `${d.getHours()}:00`;
      if (chartPeriod === "1W" || chartPeriod === "1M") return `${d.getMonth() + 1}/${d.getDate()}`;
      return `${d.getFullYear()}-${d.getMonth() + 1}`;
    };
    const dateLabel = (d: Date): string => {
      if (chartPeriod === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      if (chartPeriod === "1W" || chartPeriod === "1M") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    };

    const buckets = new Map<string, { ts: Date; pnl: number }>();
    for (const t of filtered) {
      const d = new Date(t.timestamp);
      const key = bucketKey(d);
      const b = buckets.get(key) || { ts: d, pnl: 0 };
      b.pnl += t.pnl ?? 0;
      buckets.set(key, b);
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => a.ts.getTime() - b.ts.getTime());
    let cumulative = 0;
    return sorted.map((pt) => {
      cumulative += pt.pnl;
      return { date: dateLabel(pt.ts), value: +cumulative.toFixed(2) };
    });
  }, [allTrades, chartPeriod]);

  /* ── Trades chart: from actual trades (exchange-filtered) with won/lost/approved/skipped/rejected + winRate ── */
  const tradesChartData = useMemo(() => {
    if (allTrades.length === 0) return [];
    const approvedStatuses = new Set(["executed", "paper", "open", "pending", "pending_fill"]);
    const rejectedStatuses = new Set(["rejected", "error"]);

    // Filter to last 30 days
    const cutoff = Date.now() - 30 * 86400000;
    const recentTrades = allTrades.filter(t => new Date(t.timestamp).getTime() >= cutoff);

    const buckets = new Map<string, { date: string; ts: number; won: number; lost: number; approved: number; skipped: number; rejected: number }>();
    for (const t of recentTrades) {
      const key = shortDate(t.timestamp);
      const b = buckets.get(key) || { date: key, ts: new Date(t.timestamp).getTime(), won: 0, lost: 0, approved: 0, skipped: 0, rejected: 0 };
      if (!buckets.has(key)) b.ts = new Date(t.timestamp).getTime();

      if (t.pnl != null && t.pnl > 0) b.won++;
      else if (t.pnl != null && t.pnl < 0) b.lost++;

      if (approvedStatuses.has(t.status) && !t.settled) b.approved++;
      else if (t.status === "skipped") b.skipped++;
      else if (rejectedStatuses.has(t.status)) b.rejected++;

      buckets.set(key, b);
    }

    // Sort by date chronologically (oldest first, latest on right)
    const sorted = Array.from(buckets.values())
      .sort((a, b) => a.ts - b.ts)
      .map((b) => ({
        date: b.date,
        won: b.won,
        lost: b.lost,
        approved: b.approved,
        skipped: b.skipped,
        rejected: b.rejected,
        trades: b.won + b.lost + b.approved + b.skipped + b.rejected,
        winRate: (b.won + b.lost > 0) ? Math.round(b.won / (b.won + b.lost) * 100) : 0,
      }));
    return sorted;
  }, [allTrades]);

  /* ── MVP agent ── */
  const mvpAgent = useMemo(() => {
    if (agents.length === 0) return null;
    return agents.reduce((b, a) => a.total_pnl > b.total_pnl ? a : b, agents[0]);
  }, [agents]);

  /* ── Stat pills ── */
  const statPills = useMemo(() => [
    ...(tradeStats.winStreak > 0 ? [{ icon: "/icons/streak.jpeg", label: `${tradeStats.winStreak} win streak` }] : []),
    { icon: "/icons/win rate.jpeg", label: `${tradeStats.winRate}% win rate` },
    { icon: "/icons/open positions.jpeg", label: `${openPositions.length} open` },
    { icon: "/icons/cash.jpeg", label: `${formatCurrency(balanceData.cash)} cash` },
    { icon: "/icons/agents.jpeg", label: `${agents.length} agents` },
    { icon: "/icons/trades.jpeg", label: `${totalTradeCount || agentTotalTrades || allTrades.length} trades` },
    { icon: "/icons/approved.jpeg", label: `${tradeCounts?.approved || 0} approved` },
    { icon: "/icons/skipped.jpeg", label: `${tradeCounts?.skipped || 0} skipped` },
  ], [tradeStats, openPositions, balanceData.cash, agents, totalTradeCount, agentTotalTrades, allTrades.length, tradeCounts]);

  /* ── Portfolio breakdown computed values ── */
  const deployedPct = positionsValue > 0 && balanceData.portfolioValue > 0
    ? Math.round((positionsValue / balanceData.portfolioValue) * 100)
    : 0;
  const cashPct = 100 - deployedPct;
  const unrealizedPnl = openPositions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0);
  const unrealizedPct = balanceData.portfolioValue > 0
    ? Math.round((Math.abs(unrealizedPnl) / balanceData.portfolioValue) * 100)
    : 0;

  /* ── Sliced positions for table ── */
  const openToShow = showAllPositions ? openPositions : openPositions.slice(0, VISIBLE_ROWS);
  const settledPositions = portfolioStats?.settled_positions ?? [];
  const settledToShow = showAllSettled ? settledPositions : settledPositions.slice(0, VISIBLE_ROWS);

  return (
    <div className="min-h-screen px-6 md:px-10 lg:px-14 pt-2 pb-6 md:pt-2 md:pb-8 animate-fade-in">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-[20px] font-semibold text-white">Portfolio</h1>
        <div className="flex items-center gap-4">
          <FilterDropdown label="All modes" value={envFilter} onChange={(v) => setEnvFilter(v as EnvironmentFilter)}
            options={[{ value: "all", label: "All modes" }, { value: "training", label: "Training" }, { value: "actual", label: "Live" }]} />
          <FilterDropdown label="All exchanges" value={exchangeFilter} onChange={setExchangeFilter}
            options={[{ value: "all", label: "All exchanges" }, { value: "kalshi", label: "Kalshi" }, { value: "polymarket", label: "Polymarket" }]} />
        </div>
      </div>

      {/* ── Value + P&L (Robinhood-tight) ── */}
      <div className="mt-3" data-tour="portfolio-hero">
        <div className="text-[38px] md:text-[44px] font-bold text-white tracking-tight tabular-nums leading-none">
          {dataReady
            ? formatCurrency(balanceData.portfolioValue)
            : <span className="inline-block w-48 h-10 bg-white/[0.04] rounded animate-pulse" />
          }
        </div>
        <div className="flex items-center gap-2 mt-1">
          {dataReady ? (
            <>
              <span className={`text-[14px] font-medium tabular-nums ${pnlColor(tradeStats.totalPnl)}`}>
                {tradeStats.totalPnl >= 0 ? "+" : ""}{formatCurrency(tradeStats.totalPnl)} ({tradeStats.pnlPct >= 0 ? "+" : ""}{tradeStats.pnlPct.toFixed(2)}%)
              </span>
              <span className="text-[13px] text-[#919fa6]">All time</span>
            </>
          ) : (
            <span className="inline-block w-32 h-4 bg-white/[0.04] rounded animate-pulse" />
          )}
        </div>
      </div>

      {/* ── Two-column: Chart + Deploy Card ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">

        {/* ── LEFT: Chart (Robinhood style) ── */}
        <div className="border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
          {/* Chart */}
          <div className="flex-1 px-2 pt-4">
            <PnlChart data={pnlChartData} height={320} />
          </div>

          {/* Divider + time selector */}
          <div className="border-t border-white/[0.06] px-5 py-3">
            <div className="flex items-center gap-4">
              {periods.map((p) => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`text-[13px] font-medium transition-colors ${
                    chartPeriod === p
                      ? "text-[#00C807]"
                      : "text-[#555] hover:text-white"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Deploy a Strategy card ── */}
        <div className="hidden lg:block">
          <div className="sticky top-[120px]">
            <div className="border border-white/[0.08] rounded-xl overflow-hidden">

              {/* Card header */}
              <div className="px-5 pt-5 pb-4">
                <h3 className="text-[16px] font-semibold text-white">Deploy a Strategy</h3>
                <p className="text-[12px] text-[#919fa6] mt-1.5 leading-relaxed">
                  Choose a strategy, set your parameters, and start trading.
                </p>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Form fields */}
              <div className="px-5 py-4 space-y-5">

                {/* Strategy select */}
                <div>
                  <label className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-2 block">Strategy</label>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] cursor-pointer group">
                    <select value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value)}
                      className="w-full bg-black text-[14px] text-white focus:outline-none appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23919fa6' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0 center" }}>
                      {strategies.map((s) => (
                        <option key={s.id} value={s.id} className="bg-black">{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Run duration */}
                <div>
                  <label className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-2 block">Run for</label>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                    <select value={deployDuration} onChange={(e) => setDeployDuration(Number(e.target.value))}
                      className="w-full bg-black text-[14px] text-white focus:outline-none appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23919fa6' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0 center" }}>
                      <option value={30} className="bg-black">30 minutes</option>
                      <option value={60} className="bg-black">1 hour</option>
                      <option value={240} className="bg-black">4 hours</option>
                      <option value={480} className="bg-black">8 hours</option>
                      <option value={1440} className="bg-black">24 hours</option>
                      <option value={0} className="bg-black">Until stopped</option>
                    </select>
                  </div>
                </div>

                {/* Mode */}
                <div>
                  <label className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-2 block">Mode</label>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                    <select value={capitalLimit} onChange={(e) => setCapitalLimit(e.target.value)}
                      className="w-full bg-black text-[14px] text-white focus:outline-none appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23919fa6' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0 center" }}>
                      <option value="training" className="bg-black">Training</option>
                      <option value="live" className="bg-black">Live</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-[#919fa6]/50 mt-2">Training uses paper money. Live uses real funds.</p>
                </div>
              </div>

              {/* Deploy button */}
              <div className="px-5 pb-5 pt-1">
                <button onClick={handleDeploy} disabled={deploying}
                  className={`w-full py-3 rounded-lg text-black text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${deploying ? "bg-[#00C805]/50 cursor-not-allowed" : "bg-[#00C805] hover:bg-[#00B004]"}`}>
                  <Play className="w-4 h-4" fill="black" />
                  {deploying ? "Deploying..." : "Deploy"}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  KEY STATISTICS                                                */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14">
        <h2 className="text-[22px] font-semibold text-white">Key statistics</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex flex-wrap gap-3">
            {statPills.map((stat) => (
              <div key={stat.label}
                className="flex items-center gap-3 pl-1.5 pr-5 py-2 rounded-full border border-white/[0.08] hover:border-white/[0.15] transition-colors cursor-default">
                <img src={stat.icon} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/[0.06]" />
                <span className="text-[14px] text-white font-medium whitespace-nowrap">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  PORTFOLIO BREAKDOWN                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Portfolio breakdown</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12">

            {/* Solid circle */}
            <div className="flex-shrink-0">
              <div className="w-[120px] h-[120px] rounded-full bg-[#1a2e1a] flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold text-[#00C807] leading-none">{deployedPct}%</span>
                <span className="text-[11px] text-[#00C807]/70 mt-1">deployed</span>
              </div>
            </div>

            {/* Horizontal bars */}
            <div className="flex-1 space-y-5">
              {/* Deployed */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Deployed</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#00C807]" style={{ width: `${deployedPct}%` }} />
                </div>
                <span className="text-[14px] text-[#00C807] tabular-nums shrink-0">{formatCurrency(positionsValue > 0 ? positionsValue : 0)}</span>
              </div>

              {/* Cash */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Cash</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full bg-white" style={{ width: `${cashPct}%` }} />
                </div>
                <span className="text-[14px] text-white tabular-nums shrink-0">{formatCurrency(balanceData.cash)}</span>
              </div>

              {/* Unrealized P&L */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Unrealized P&L</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className={`h-full ${unrealizedPnl >= 0 ? "bg-[#00C807]/60" : "bg-[#FF6B8A]/60"}`} style={{ width: `${unrealizedPct}%` }} />
                </div>
                <span className={`text-[14px] tabular-nums shrink-0 ${pnlColor(unrealizedPnl)}`}>
                  {unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(unrealizedPnl)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TRADES — Robinhood "Short Interest" style                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Trades</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          {/* Legend */}
          <div className="flex items-center gap-5 mb-5">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-[#00C807]" />
              <span className="text-[12px] text-[#919fa6]">Trades</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0 border-t border-dotted border-[#919fa6]" />
              <span className="text-[12px] text-[#919fa6]">Win rate</span>
            </div>
          </div>

          {/* Chart */}
          {tradesChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={tradesChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="40%">
                <XAxis dataKey="date" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }} interval="preserveStartEnd" minTickGap={80} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }} width={28} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }} width={30}
                  tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-[#1a1a1a] border border-white/[0.06] rounded-lg px-3 py-2 shadow-lg min-w-[120px]">
                      <div className="text-[10px] text-[#919fa6] mb-1.5">{d?.date}</div>
                      <div className="flex justify-between gap-4 text-[11px] mb-0.5">
                        <span className="text-[#919fa6]">Trades</span>
                        <span className="text-white font-medium">{d?.trades}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px] mb-0.5">
                        <span style={{ color: "#00C807" }}>Won</span>
                        <span className="text-white font-medium">{d?.won}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px] mb-0.5">
                        <span style={{ color: "#FF4444" }}>Lost</span>
                        <span className="text-white font-medium">{d?.lost}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px]">
                        <span className="text-[#919fa6]">Win rate</span>
                        <span className="text-white font-medium">{d?.winRate}%</span>
                      </div>
                    </div>
                  );
                }} cursor={false} />
                <Bar yAxisId="left" dataKey="trades" fill="#00C807" radius={[2, 2, 0, 0]} barSize={10} shape={(props: unknown) => {
                  const { x, y, width, height } = props as { x: number; y: number; width: number; height: number };
                  return <rect x={x} y={y} width={width} height={height} fill="#00C807" rx={2} ry={2} style={{ shapeRendering: "crispEdges" }} />;
                }} />
                <Line yAxisId="right" dataKey="winRate" type="natural" stroke="#919fa6"
                  strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 2.5, fill: "#919fa6", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-[13px] text-[#919fa6]/60 py-16 text-center">Trade data will appear here as your agents execute trades</div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  RECENTLY SETTLED                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Recently settled</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <p className="text-[13px] text-[#919fa6] mb-5 leading-relaxed">
            Trades that have resolved. Showing the most recent outcomes across all agents.
          </p>
          {settledPositions.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {settledPositions.slice(0, 4).map((t) => {
                const pnlVal = t.pnl ?? 0;
                const pnlCardColor = pnlVal > 0 ? "text-[#00C807]" : pnlVal < 0 ? "text-[#FF6B8A]" : "text-[#919fa6]";
                const costBasis = t.total_cost > 0 ? t.total_cost : 1;
                const pctReturn = (pnlVal / costBasis) * 100;
                return (
                  <div key={t.id}
                    className="shrink-0 flex-1 min-w-[140px] border border-white/[0.08] rounded-xl px-5 py-6 hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col"
                    onClick={() => window.open(`/trades/${t.id}`, '_blank')}>
                    <div className="text-[14px] font-medium text-white leading-snug line-clamp-2 min-h-[40px]">
                      {t.market_title || cleanTicker(t.market_ticker)}
                    </div>
                    <div className="flex-1" />
                    <div className="mt-8">
                      <div className={`text-[20px] font-bold tabular-nums ${pnlCardColor}`}>
                        {pnlVal >= 0 ? "+" : ""}{formatCurrency(pnlVal)}
                      </div>
                      <div className={`text-[13px] tabular-nums mt-1 ${pnlCardColor}`}>
                        {pctReturn >= 0 ? "+" : ""}{pctReturn.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[13px] text-[#919fa6]/60 py-6">Settled trades will appear here as your positions resolve</div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  AGENTS                                                        */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Agents</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <p className="text-[13px] text-[#919fa6] mb-5 leading-relaxed">
            Active trading agents and their performance.
          </p>
          {agents.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {agents.map((agent) => {
                const positive = agent.total_pnl > 0;
                const isMvp = mvpAgent?.id === agent.id && agent.total_pnl > 0;
                const pctRet = agent.capital_allocated > 0 ? ((agent.total_pnl / agent.capital_allocated) * 100) : 0;
                return (
                  <Link key={agent.id} href={`/strategy/${agent.id}`}
                    className="shrink-0 w-[195px] border border-white/[0.08] rounded-xl px-5 py-7 hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col no-underline">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[15px] font-medium text-white leading-tight">{agent.name}</span>
                      {isMvp && <span className="text-[10px] text-[#919fa6] border border-white/[0.1] rounded px-2 py-0.5">MVP</span>}
                    </div>
                    <div className="flex-1" />
                    <div className="mt-8">
                      <div className={`text-[20px] font-bold tabular-nums ${positive ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                        {agent.total_pnl >= 0 ? "+" : ""}{formatCurrency(agent.total_pnl)}
                      </div>
                      <div className={`text-[13px] tabular-nums mt-1 ${positive ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                        {pctRet >= 0 ? "+" : ""}{pctRet.toFixed(1)}%
                      </div>
                      <div className="text-[12px] text-[#919fa6] mt-3">{agent.trade_count} trades</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-[13px] text-[#919fa6]/60 py-6">Deploy agents from the Strategy page to see them here</div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  POSITIONS                                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Positions</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">

          {/* Pill tabs */}
          <div className="flex items-center gap-3 mb-8">
            {(["open", "settled"] as const).map((tab) => (
              <button key={tab} onClick={() => { setPositionTab(tab); if (tab === "open") setShowAllPositions(false); else setShowAllSettled(false); }}
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  positionTab === tab
                    ? "text-[#00C807] border border-[#00C807]"
                    : "text-[#919fa6] border border-white/[0.1] hover:border-white/[0.2]"
                }`}>
                {tab === "open" ? `Open (${openPositions.length})` : `Settled (${portfolioStats?.settled_count ?? 0})`}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {positionTab === "open" ? (
            <div style={{ minWidth: "640px" }}>
              {/* Header */}
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.5fr 0.6fr 0.7fr 0.7fr 0.8fr 1.1fr" }}>
                <span>Market</span><span>Side</span><span>Qty</span><span>Bought</span><span>Current</span><span>P&L</span><span>Resolves</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />

              {/* Rows */}
              {openToShow.map((pos, i) => {
                const resolve = formatResolve(pos.market_close_time);
                return (
                <div key={pos.id}>
                  <div className="grid items-center py-6 text-[14px] cursor-pointer hover:bg-white/[0.02]"
                    style={{ gridTemplateColumns: "2fr 0.5fr 0.6fr 0.7fr 0.7fr 0.8fr 1.1fr" }}
                    onClick={() => window.open(`/trades/${pos.id}`, '_blank')}>
                    <span className="text-white truncate pr-3">{pos.market_title || cleanTicker(pos.market_ticker)}</span>
                    <span className="text-[#919fa6]">{(pos.side ?? "").toUpperCase()}</span>
                    <span className="text-[#919fa6] tabular-nums">{pos.count}</span>
                    <span className="text-[#919fa6] tabular-nums">{(pos.price * 100).toFixed(0)}¢</span>
                    <span className="text-white tabular-nums">{pos.current_price != null ? `${(pos.current_price * 100).toFixed(0)}¢` : "—"}</span>
                    <span className={`tabular-nums ${pos.unrealized_pnl == null ? "text-[#919fa6]" : pos.unrealized_pnl >= 0 ? "text-[#00C807]" : "text-[#FF4D4D]"}`}>
                      {pos.unrealized_pnl == null ? "—" : `${pos.unrealized_pnl >= 0 ? "+" : ""}${formatCurrency(pos.unrealized_pnl)}`}
                    </span>
                    <span className={`tabular-nums ${resolve?.soon ? "text-[#FFA500]" : "text-[#919fa6]"}`}>{resolve ? resolve.text : "—"}</span>
                  </div>
                  {i < openToShow.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                </div>
                );
              })}

              {openPositions.length === 0 && (
                <div className="text-center py-10 text-[#919fa6]/60 text-[13px]">No open positions</div>
              )}

              {openPositions.length > VISIBLE_ROWS && (
                <div className="flex items-center justify-between mt-5">
                  <span className="text-[12px] text-[#919fa6]/50 italic">
                    Showing {openToShow.length} of {openPositions.length} open positions
                  </span>
                  <button onClick={() => setShowAllPositions(!showAllPositions)}
                    className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">
                    {showAllPositions ? "Show less" : "View more"} →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ minWidth: "560px" }}>
              {/* Header */}
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr 0.7fr" }}>
                <span>Market</span><span>Side</span><span>Cost</span><span>P&L</span><span>Agent</span><span>Date</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />

              {/* Rows */}
              {settledToShow.map((t, i) => {
                const pnlRowColor = (t.pnl ?? 0) > 0 ? "text-[#00C807]" : (t.pnl ?? 0) < 0 ? "text-[#FF6B8A]" : "text-[#919fa6]";
                return (
                  <div key={t.id}>
                    <div className="grid items-center py-6 text-[14px] cursor-pointer hover:bg-white/[0.02]"
                      style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr 0.7fr" }}
                      onClick={() => window.open(`/trades/${t.id}`, '_blank')}>
                      <span className="text-white truncate pr-3">{t.market_title || cleanTicker(t.market_ticker)}</span>
                      <span className="text-[#919fa6]">{(t.side ?? "").toUpperCase()}</span>
                      <span className="text-[#919fa6] tabular-nums">{formatCurrency(t.total_cost)}</span>
                      <span className={`font-medium tabular-nums ${pnlRowColor}`}>
                        {(t.pnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(t.pnl ?? 0)}
                      </span>
                      <span className="text-[#919fa6] truncate">{t.agent_name || apiAgents.find(a => a.id === t.agent_id)?.name || "—"}</span>
                      <span className="text-[#919fa6]">{shortDate(t.timestamp)}</span>
                    </div>
                    {i < settledToShow.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                  </div>
                );
              })}

              {settledPositions.length === 0 && (
                <div className="text-center py-10 text-[#919fa6]/60 text-[13px]">No settled trades</div>
              )}

              {settledPositions.length > VISIBLE_ROWS && (
                <div className="flex items-center justify-between mt-5">
                  <span className="text-[12px] text-[#919fa6]/50 italic">
                    Showing {settledToShow.length} of {portfolioStats?.settled_count ?? 0} settled trades
                  </span>
                  <button onClick={() => setShowAllSettled(!showAllSettled)}
                    className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">
                    {showAllSettled ? "Show less" : "View more"} →
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  );
}
