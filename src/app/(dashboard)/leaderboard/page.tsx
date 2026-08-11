"use client";

import { useState, useMemo } from "react";
import { Medal } from "lucide-react";
import { SparklineChart } from "@/components/SparklineChart";
import { StatusBadge } from "@/components/StatusBadge";
import { ComparisonChart } from "@/components/ComparisonChart";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { BotAvatar, getAvatarGradient } from "@/components/BotAvatar";
import { useAgents, useAgentMetrics } from "@/hooks/use-agents";
import { useTrades } from "@/hooks/use-trades";
import { PageHelpButton } from "@/components/PageHelpModal";
import { useEnvironmentFilter } from "@/context/environment-filter";

// ── helpers ────────────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  Economics: { bg: "bg-[#30363a]", text: "text-text-secondary" },
  Politics:  { bg: "bg-[#30363a]", text: "text-text-secondary" },
  Crypto:    { bg: "bg-[#30363a]", text: "text-text-secondary" },
  Weather:   { bg: "bg-[#30363a]", text: "text-text-secondary" },
  Tech:      { bg: "bg-[#30363a]", text: "text-text-secondary" },
  Markets:   { bg: "bg-[#30363a]", text: "text-text-secondary" },
};
function categoryStyle(cat: string) {
  return CATEGORY_STYLES[cat] ?? { bg: "bg-[#30363a]", text: "text-text-secondary" };
}

const AVATAR_COLORS = [
  "#0d1f2d", "#1a0a2e", "#0d2818", "#2d1b00",
  "#2d0a1a", "#0a2d2d", "#1e2d0a", "#2d0d0d",
];

const COMPARISON_COLORS = ["#00C807", "#0077FF"];

const TIME_PERIODS = ["1D", "7D", "1M", "3M", "All"] as const;
type Period = (typeof TIME_PERIODS)[number];

const PERIOD_DAYS: Record<Period, number> = { "1D": 1, "7D": 7, "1M": 30, "3M": 90, "All": 365 };


function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-5 h-5 text-amber-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-xs text-text-secondary w-5 text-center">{rank}</span>;
}

function BarStat({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-16 h-1.5 bg-[#30363a] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-text-tertiary" style={{ width: `${value}%` }} />
      </div>
      <span className="text-[13px] tabular-nums text-text-primary">{value}%</span>
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("1M");
  const days = PERIOD_DAYS[period];

  const { envFilter } = useEnvironmentFilter();
  const envParam = envFilter !== "all" ? envFilter : undefined;
  const { agents: apiAgents, loading } = useAgents(envParam);
  const { trades: allTrades } = useTrades({
    per_page: 200,
    environment: envFilter !== "all" ? envFilter : undefined,
  });

  const agentIds = useMemo(() => apiAgents.map(a => a.id), [apiAgents]);
  const { metrics: agentMetrics } = useAgentMetrics(agentIds);

  // Build sparkline data from real trades grouped by agent
  const agentSparklines = useMemo(() => {
    const byAgent: Record<string, Array<{ x: number; y: number }>> = {};
    if (!allTrades.length) return byAgent;
    const sorted = [...allTrades].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const cumPnl: Record<string, number> = {};
    const idx: Record<string, number> = {};
    for (const t of sorted) {
      if (!cumPnl[t.agent_id]) { cumPnl[t.agent_id] = 0; idx[t.agent_id] = 0; byAgent[t.agent_id] = []; }
      cumPnl[t.agent_id] += t.pnl ?? 0;
      byAgent[t.agent_id].push({ x: idx[t.agent_id]++, y: cumPnl[t.agent_id] });
    }
    return byAgent;
  }, [allTrades]);

  // Compute per-agent period-filtered stats from actual trades
  const agentPeriodStats = useMemo(() => {
    const stats: Record<string, { pnl: number; trades: number; placed: number; skipped: number; wins: number }> = {};
    if (!allTrades.length) return stats;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    for (const t of allTrades) {
      if (new Date(t.timestamp) < cutoff) continue;
      if (!stats[t.agent_id]) stats[t.agent_id] = { pnl: 0, trades: 0, placed: 0, skipped: 0, wins: 0 };
      stats[t.agent_id].trades += 1;
      const isPlaced = ["executed", "paper", "open", "pending", "pending_fill"].includes(t.status);
      if (isPlaced) {
        stats[t.agent_id].placed += 1;
        stats[t.agent_id].pnl += t.pnl ?? 0;
        if (t.pnl != null && t.pnl > 0) stats[t.agent_id].wins += 1;
      } else if (t.status === "skipped") {
        stats[t.agent_id].skipped += 1;
      }
    }
    return stats;
  }, [allTrades, days]);

  // Demo mode: use mock data. Live mode: filter by environment.
  const leaderboardAgents = useMemo(() => {
    // Only show agents with trades or running status
    const filtered = apiAgents.filter(a => a.trade_count > 0 || a.status === "running");
    return filtered
      .map((a, i) => ({
        id: a.id,
        bot_type_id: a.bot_type_id,
        name: a.name,
        strategy: a.strategy || "",
        pnl: a.total_pnl,
        periodPnl: period === "All" ? a.total_pnl : (agentPeriodStats[a.id]?.pnl ?? 0),
        periodTrades: period === "All" ? a.trade_count : (agentPeriodStats[a.id]?.trades ?? 0),
        periodPlaced: period === "All" ? a.trade_count : (agentPeriodStats[a.id]?.placed ?? 0),
        periodSkipped: period === "All" ? 0 : (agentPeriodStats[a.id]?.skipped ?? 0),
        winRate: (a.settled_count ?? 0) > 0 ? Math.round((a.win_count / a.settled_count) * 100) : 0,
        trades: a.trade_count,
        confidence: Math.round((agentMetrics[a.id]?.avg_confidence ?? 0) * 100),
        bestCategory: agentMetrics[a.id]?.best_category ?? "N/A",
        sparkline: agentSparklines[a.id] ?? [],
        status: a.status === "running" ? "active" : a.status,
        mode: a.mode || "training",
        initials: a.name.slice(0, 2).toUpperCase(),
        rank: i + 1,
        avatarBg: AVATAR_COLORS[i % AVATAR_COLORS.length],
        categories: (agentMetrics[a.id]?.categories ?? []).map(c => ({ name: c.name, trades: c.trades })),
      }))
      .sort((a, b) => b.pnl - a.pnl)
      .map((a, i) => ({ ...a, rank: i + 1 }));
  }, [apiAgents, agentMetrics, agentSparklines, agentPeriodStats]);

  const comparisonSeries = useMemo(
    () => {
      // Pick top 2 bots for comparison, prioritizing those with actual trades
      const withTrades = leaderboardAgents.filter(a => a.trades > 0);
      const comparisonPair = withTrades.length >= 2
        ? withTrades.slice(0, 2)
        : withTrades.length === 1
          ? [withTrades[0], ...leaderboardAgents.filter(a => a.id !== withTrades[0].id).slice(0, 1)]
          : leaderboardAgents.slice(0, 2);

      return comparisonPair.map((a, i) => {
        // Build real comparison data from trades
        const agentTrades = allTrades
          .filter(t => t.agent_id === a.id)
          .sort((x, y) => x.timestamp.localeCompare(y.timestamp));

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const periodTrades = agentTrades.filter(t => new Date(t.timestamp) >= cutoff);

        let cumPnl = 0;
        const data = periodTrades.length > 0
          ? periodTrades.map(t => {
              cumPnl += t.pnl ?? 0;
              return { date: t.timestamp.slice(0, 10), value: cumPnl };
            })
          : [];

        const periodPnl = periodTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

        return {
          id: a.id,
          bot_type_id: (a as Record<string, unknown>).bot_type_id as string | undefined,
          name: a.name,
          label: a.initials,
          winRate: a.winRate,
          pnl: periodPnl,
          trades: periodTrades.filter(t => ["executed", "paper", "open", "pending", "pending_fill"].includes(t.status)).length,
          color: COMPARISON_COLORS[i],
          avatarBg: getAvatarGradient(a.id, (a as Record<string, unknown>).bot_type_id as string | undefined),
          categories: a.categories ?? [],
          data,
        };
      });
    },
    [leaderboardAgents, days, allTrades]
  );

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-[24px] md:text-[34px] font-bold tracking-tight text-text-primary">Benchmarking</h1>
            <PageHelpButton pageKey="benchmarking" />
          </div>
        </div>
        <p className="text-[13px] text-text-tertiary mt-1">Performance ranked by P&amp;L</p>
      </div>

      {leaderboardAgents.length === 0 ? (
        <div className="text-center py-20 text-text-tertiary text-[14px]">
          {loading ? "Loading agents..." : "No agents deployed yet"}
        </div>
      ) : (
        <>
          {/* 1 — Head-to-Head Comparison Chart */}
          <div data-tour="comparison-chart">
          <ComparisonChart
            series={comparisonSeries}
            period={period}
            onPeriodChange={setPeriod}
          />
          </div>

          {/* 2 — All Agents Table */}
          <div data-tour="leaderboard-table">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[18px] font-semibold text-text-primary">All Agents</h2>

              <div className="flex items-center gap-1" data-tour="period-selector">
                {TIME_PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                      period === p
                        ? "bg-[#30363a] text-white"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-t border-border">
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[5%]">Rank</th>
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3">Agent</th>
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[12%]">Win Rate</th>
                    <th className="text-right text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[7%]">Trades</th>
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[12%]">Confidence</th>
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[10%]">Best Category</th>
                    <th className="text-right text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[8%]">P&L</th>
                    <th className="text-center text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[8%]">{period}</th>
                    <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 w-[8%]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardAgents.map((agent) => {
                    const { bg: catBg, text: catText } = categoryStyle(agent.bestCategory);
                    const filteredPlaced = (agent as Record<string, unknown>).periodPlaced as number ?? agent.trades;
                    const filteredSkipped = (agent as Record<string, unknown>).periodSkipped as number ?? 0;
                    const filteredPnl = (agent as Record<string, unknown>).periodPnl as number ?? agent.pnl;
                    return (
                      <tr
                        key={agent.id}
                        className="border-t border-border hover:bg-[#30363a]/20 transition-colors group"
                      >
                        {/* Rank */}
                        <td className="py-4 pr-3">
                          <div className="flex items-center justify-start">
                            <RankBadge rank={agent.rank} />
                          </div>
                        </td>

                        {/* Bot */}
                        <td className="py-4 pr-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BotAvatar agentId={agent.id} botTypeId={(agent as Record<string, unknown>).bot_type_id as string | undefined} size={32} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-text-primary truncate">{agent.name}</p>
                              <p className="text-[11px] text-text-tertiary truncate">{agent.strategy}</p>
                            </div>
                          </div>
                        </td>

                        {/* Win Rate */}
                        <td className="py-4 pr-3"><BarStat value={agent.winRate} /></td>

                        {/* Trades */}
                        <td className="py-4 pr-3 text-right">
                          <span className="text-[13px] font-semibold text-text-primary tabular-nums">{filteredPlaced}</span>
                          {filteredSkipped > 0 && (
                            <span className="text-[11px] text-text-tertiary ml-1">· {filteredSkipped} skip</span>
                          )}
                        </td>

                        {/* Confidence */}
                        <td className="py-4 pr-3"><BarStat value={agent.confidence} /></td>

                        {/* Best Category */}
                        <td className="py-4 pr-3">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium ${catBg} ${catText}`}>
                            {agent.bestCategory}
                          </span>
                        </td>

                        {/* P&L */}
                        <td className="py-4 pr-3 text-right">
                          <span className={`text-[13px] font-semibold tabular-nums ${pnlColor(filteredPnl)}`}>
                            {formatCurrency(filteredPnl, true)}
                          </span>
                        </td>

                        {/* Sparkline */}
                        <td className="py-4 pr-3 text-center">
                          <SparklineChart data={agent.sparkline} positive={filteredPnl >= 0} color="rgba(255,255,255,0.6)" width={64} height={24} />
                        </td>

                        {/* Status + Mode */}
                        <td className="py-4">
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={agent.status as "active" | "paused" | "error" | "paper" | "live" | "executed" | "skipped"} />
                            <span className={`text-[10px] font-medium uppercase tracking-wider ${(agent as Record<string, unknown>).mode === "live" ? "text-amber-400/70" : "text-text-tertiary"}`}>
                              {(agent as Record<string, unknown>).mode === "live" ? "Live" : "Paper"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
