"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCurrency, pnlColor, cfPnlColor } from "@/lib/utils";
import { useWikiBot, useWikiSnapshots } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════ */

const FAILURE_COLORS: Record<string, string> = {
  BOT_SKIP_CORRECT: "#00C807", CORRECT_PROCESS: "#00C807", UNLUCKY_CORRECT_PROCESS: "#00C807",
  RULE_CORRECT: "#00C807", INSUFFICIENT_EDGE: "#FFC107", BOT_SKIP_MISSED: "#FFC107",
  RULE_TOO_STRICT: "#FFC107", LUCKY_POOR_PROCESS: "#FF6B8A", RULE_TOO_LOOSE: "#FF6B8A",
  LOW_RESEARCH: "#FF6B8A", ANCHORING_BIAS: "#FF6B8A", RESOLUTION_MISREAD: "#FF6B8A",
  RISK_MANAGER_OVERRULED: "#FF6B8A", BASE_RATE_NEGLECT: "#FF6B8A", RECENCY_BIAS: "#FF6B8A",
};

function slugify(text: string): string {
  return text.toLowerCase().replace(/[ /_\.]/g, "-").replace(/[:\(\)]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function pct(v: any): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function gradeFor(score: number): { grade: string; color: string } {
  if (score >= 8) return { grade: "A", color: "bg-gain/20 text-gain" };
  if (score >= 6) return { grade: "B", color: "bg-[#22d3ee]/20 text-[#22d3ee]" };
  if (score >= 4) return { grade: "C", color: "bg-warning/20 text-warning" };
  return { grade: "D", color: "bg-loss/20 text-loss" };
}

function scoreBarColor(): string {
  return "rgba(255,255,255,0.25)";
}

function scoreTextColor(score: number): string {
  if (score >= 8) return "text-gain";
  if (score >= 6) return "text-[#22d3ee]";
  if (score >= 4) return "text-warning";
  return "text-loss";
}

function biasColor(bias: number): string {
  const abs = Math.abs(bias);
  if (abs < 0.03) return "text-gain";
  if (abs < 0.08) return "text-warning";
  return "text-loss";
}

function biasBarColor(bias: number): string {
  const abs = Math.abs(bias);
  if (abs < 0.03) return "#00C807";
  if (abs < 0.08) return "#FFC107";
  return "#FF6B8A";
}

/* ════════════════════════════════════════════════════════════════ */
/*  PAGE                                                            */
/* ════════════════════════════════════════════════════════════════ */

export default function BotWikiPage() {
  const { id } = useParams<{ id: string }>();
  const { bot, loading, error } = useWikiBot(id);
  const { snapshots } = useWikiSnapshots("bot", id);

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !bot) {
    return (
      <p className="text-[13px] text-white/70 text-center py-20">{error || "Bot not found"}</p>
    );
  }

  const b: any = bot;
  const fm: any = b.frontmatter ?? {};
  const snap: any = b.data_snapshot ?? {};
  const executed: any = snap.executed ?? {};
  const skipped: any = snap.skipped ?? {};
  const rejected: any = snap.rejected ?? {};
  const calibration: Record<string, any> = snap.calibration_by_category ?? {};
  const failureModes: Record<string, number> = snap.failure_modes ?? {};
  const agentScorecard: Record<string, any> = snap.agent_scorecard ?? {};
  const recentTradeIds: string[] = snap.recent_trade_ids ?? [];
  const recentTrades: any[] = snap.recent_trades ?? [];

  const totalTrades = Number(executed.count ?? 0) + Number(skipped.count ?? 0) + Number(rejected.count ?? 0);
  const winRate = Number(executed.count ?? 0) > 0
    ? Number(executed.wins ?? 0) / Number(executed.count ?? 0)
    : 0;

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <Link href="/memory?tab=bots" className="text-[13px] text-white/60 hover:text-white/80 transition-colors">
          ← Back to Strategies
        </Link>
        <h1 className="text-[28px] md:text-[36px] font-bold text-white tracking-tight mt-3">
          {fm.bot_type_id || id}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-[14px] text-white/70">
          <span>{totalTrades} trades</span>
          <span>·</span>
          <span>{Number(executed.count ?? 0)} executed</span>
          <span>·</span>
          <span>{Number(skipped.count ?? 0)} skipped</span>
          {winRate > 0 && (
            <>
              <span>·</span>
              <span className="text-white">{pct(winRate)} win rate</span>
            </>
          )}
        </div>
        {Number(snap.training_trades_excluded ?? 0) > 0 && (
          <p className="text-[12px] text-white/70 mt-1">
            {Number(snap.training_trades_excluded)} training trade{Number(snap.training_trades_excluded) !== 1 ? "s" : ""} excluded from stats
          </p>
        )}
      </div>

      {/* ══════ Execution Breakdown ══════ */}
      <div>
        <h2 className="text-[22px] font-semibold text-white">Execution breakdown</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Executed */}
            <div>
              <div className="text-[13px] text-white/70 mb-1">Executed<InfoTip text="Trades that passed all filters and were actually placed on the market" /></div>
              <div className="text-[28px] font-bold text-white tabular-nums">{Number(executed.count ?? 0)}</div>
              <div className={`text-[14px] font-medium tabular-nums mt-1 ${pnlColor(Number(executed.pnl ?? 0))}`}>
                {Number(executed.pnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(Number(executed.pnl ?? 0))} P&L<InfoTip text="Realized profit or loss from executed trades" />
              </div>
              <div className="text-[13px] text-white/70 mt-0.5">{executed.wins ?? 0}W / {executed.losses ?? 0}L</div>
            </div>
            {/* Skipped */}
            <div>
              <div className="text-[13px] text-white/70 mb-1">Skipped<InfoTip text="Trades the AI analyzed but chose not to execute" /></div>
              <div className="text-[28px] font-bold text-white tabular-nums">{Number(skipped.count ?? 0)}</div>
              <div className={`text-[14px] font-medium tabular-nums mt-1 ${cfPnlColor(Number(skipped.cf_pnl ?? 0))}`}>
                {Number(skipped.cf_pnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(Number(skipped.cf_pnl ?? 0))} CF P&L<InfoTip text="Counterfactual P&L: what would have happened if these trades were executed" />
              </div>
              <div className="text-[13px] text-white/70 mt-0.5">{skipped.would_have_won ?? 0}W / {skipped.would_have_lost ?? 0}L hypothetical</div>
            </div>
            {/* Rejected */}
            <div>
              <div className="text-[13px] text-white/70 mb-1">Rejected<InfoTip text="Trades blocked by risk management rules before execution" /></div>
              <div className="text-[28px] font-bold text-white tabular-nums">{Number(rejected.count ?? 0)}</div>
              <div className={`text-[14px] font-medium tabular-nums mt-1 ${cfPnlColor(Number(rejected.cf_pnl ?? 0))}`}>
                {Number(rejected.cf_pnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(Number(rejected.cf_pnl ?? 0))} CF P&L<InfoTip text="Counterfactual P&L: what would have happened if these trades were executed" />
              </div>
              <div className="text-[13px] text-white/70 mt-0.5">{rejected.would_have_won ?? 0}W / {rejected.would_have_lost ?? 0}L hypothetical</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ Trends ══════ */}
      {snapshots.length >= 2 && (() => {
        const trendData = [...snapshots].reverse().map((s: any) => ({
          week: s.period_start ? new Date(s.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
          pnl: Number(s.metrics?.cumulative?.pnl ?? s.metrics?.total_pnl ?? 0),
          win_rate: (s.metrics?.cumulative?.win_rate ?? s.metrics?.win_rate) != null ? Number(((s.metrics?.cumulative?.win_rate ?? s.metrics?.win_rate) * 100).toFixed(1)) : null,
        }));
        return (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Trends</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            {/* Cumulative P&L chart */}
            <div className="mb-2">
              <span className="text-[14px] text-white">Cumulative P&L</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: -5 }}>
                <defs>
                  <linearGradient id="botPnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00C807" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#00C807" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} width={50}
                  tickFormatter={(v: number) => `$${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(0)}`} />
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg">
                      <div className="text-[11px] text-white/70 mb-0.5">{d.week}</div>
                      <div className={`text-[13px] font-semibold tabular-nums ${d.pnl >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                        {d.pnl >= 0 ? "+" : ""}${Math.abs(d.pnl).toFixed(2)}
                      </div>
                      {d.win_rate != null && (
                        <div className="text-[11px] text-white/70 mt-0.5">{d.win_rate}% win rate</div>
                      )}
                    </div>
                  );
                }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="pnl" stroke="#00C807" strokeWidth={1.5}
                  fill="url(#botPnlGrad)" dot={{ r: 3, fill: "#00C807", strokeWidth: 0 }} activeDot={{ r: 4, fill: "#00C807", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Win Rate chart */}
            <div className="mt-6 mb-2">
              <span className="text-[14px] text-white">Win Rate</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: -5 }}>
                <XAxis dataKey="week" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} />
                <YAxis axisLine={false} tickLine={false} domain={[0, 100]}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} width={35}
                  tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg">
                      <div className="text-[11px] text-white/80 mb-0.5">{d.week}</div>
                      <div className="text-[13px] font-semibold tabular-nums text-white">
                        {d.win_rate != null ? `${d.win_rate}%` : "—"}
                      </div>
                    </div>
                  );
                }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="win_rate" fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line type="monotone" dataKey="win_rate" stroke="white" strokeWidth={1.5}
                  dot={{ r: 3, fill: "white", strokeWidth: 0 }} activeDot={{ r: 4, fill: "white", strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>

            {/* Weekly P&L table */}
            <div className="mt-6" style={{ minWidth: "400px" }}>
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.8fr" }}>
                <span>Week</span>
                <span className="text-right">Trades</span>
                <span className="text-right">W/L</span>
                <span className="text-right">P&L</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />
              {[...snapshots].reverse().slice(-8).map((s: any, i: number, arr: any[]) => {
                const p = s.metrics?.period ?? {};
                const weekPnl = Number(p.pnl ?? 0);
                const periodStart = s.period_start ? new Date(s.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                return (
                  <div key={s.period_start || i}>
                    <div className="grid items-center py-4 text-[14px]"
                      style={{ gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.8fr" }}>
                      <span className="text-white">{periodStart}</span>
                      <span className="text-white/70 tabular-nums text-right">{Number(p.trades ?? 0)}</span>
                      <span className="text-white/70 tabular-nums text-right">{Number(p.wins ?? 0)}W / {Number(p.losses ?? 0)}L</span>
                      <span className={`font-medium tabular-nums text-right ${weekPnl > 0 ? "text-[#00C807]" : weekPnl < 0 ? "text-[#FF6B8A]" : "text-white/40"}`}>
                        {weekPnl !== 0 ? `${weekPnl >= 0 ? "+" : ""}${formatCurrency(weekPnl)}` : "—"}
                      </span>
                    </div>
                    {i < arr.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ══════ Failure Modes ══════ */}
      {Object.keys(failureModes).length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Failure modes</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <FailureModeTable failureModes={failureModes} />
          </div>
        </div>
      )}

      {/* ══════ Agent Scorecard ══════ */}
      {Object.keys(agentScorecard).length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Agent scorecard</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <AgentScoreChart scorecard={agentScorecard} />
          </div>
        </div>
      )}

      {/* ══════ Calibration by Category ══════ */}
      {Object.keys(calibration).length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Calibration by category</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div style={{ minWidth: "500px" }}>
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr 1.2fr 0.5fr" }}>
                <span>Category</span>
                <span className="text-right">Avg Prob<InfoTip text="Average probability the bot assigned to markets in this category" /></span>
                <span className="text-right">Actual<InfoTip text="What percentage of markets in this category actually resolved YES" /></span>
                <span className="text-center">Bias<InfoTip text="Gap between predicted and actual. Positive = bot was overconfident" /></span>
                <span className="text-right">N<InfoTip text="Sample size — number of trades informing this calibration" /></span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />
              {Object.entries(calibration).map(([category, data]: [string, any], i, arr) => {
                const bias = Number(data.bias ?? 0);
                const biasAbs = Math.abs(bias);
                const biasBarWidth = Math.min(biasAbs / 0.15, 1) * 50;
                const isOver = bias > 0;
                return (
                  <div key={category}>
                    <div className="grid items-center py-4 text-[14px]"
                      style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr 1.2fr 0.5fr" }}>
                      <Link href={`/memory/category/${slugify(category)}`}
                        className="text-white hover:text-[#60a5fa] transition-colors truncate">
                        {category}
                      </Link>
                      <span className="text-white tabular-nums text-right">{pct(data.avg_prob)}</span>
                      <span className="text-white tabular-nums text-right">{pct(data.actual_rate)}</span>
                      <div className="flex items-center justify-center gap-2">
                        <div className="relative w-[80px] h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                          <div className="absolute left-1/2 top-0 w-px h-full bg-white/10" />
                          {biasAbs > 0.005 && (
                            <div className="absolute top-0 h-full rounded-sm"
                              style={{ background: biasBarColor(bias), width: `${biasBarWidth}%`, left: isOver ? "50%" : `${50 - biasBarWidth}%` }} />
                          )}
                        </div>
                        <span className={`text-[13px] font-medium tabular-nums ${biasColor(bias)}`}>
                          {bias > 0 ? "+" : ""}{(bias * 100).toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-white/70 tabular-nums text-right">{data.n ?? "—"}</span>
                    </div>
                    {i < arr.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════ Recent Trades ══════ */}
      <RecentTradesSection trades={recentTrades} fallbackIds={recentTradeIds} />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  SUB-COMPONENTS                                                  */
/* ════════════════════════════════════════════════════════════════ */

function FailureModeTable({ failureModes }: { failureModes: Record<string, number> }) {
  const data = Object.entries(failureModes)
    .map(([key, count]) => ({
      name: key.replace(/_/g, " "),
      count: Number(count),
      color: FAILURE_COLORS[key] || "rgba(255,255,255,0.2)",
    }))
    .sort((a, b) => b.count - a.count);

  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0) return null;

  return (
    <div style={{ minWidth: "400px" }}>
      <div className="grid items-center pb-4 text-[14px] font-bold text-white"
        style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
        <span>Mode</span><span className="text-right">Count</span><span className="text-right">Share</span>
      </div>
      <div className="h-[1.5px] bg-white/[0.2]" />
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="grid items-center py-4 text-[14px]"
            style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-white">{d.name}</span>
            </div>
            <span className="text-white/70 tabular-nums text-right">{d.count}</span>
            <span className="text-white/70 tabular-nums text-right">{total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%</span>
          </div>
          {i < data.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
        </div>
      ))}
    </div>
  );
}

function RecentTradesSection({ trades, fallbackIds }: { trades: any[]; fallbackIds: string[] }) {
  const [showAll, setShowAll] = useState(false);

  // Use rich trade objects if available, otherwise fall back to IDs
  const items = trades.length > 0
    ? trades
    : fallbackIds.map((id) => ({ id, title: id, side: "", date: null }));

  if (items.length === 0) return null;

  const visible = showAll ? items : items.slice(0, 5);

  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Recent trades</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div style={{ minWidth: "500px" }}>
            <div className="grid items-center pb-4 text-[14px] font-bold text-white"
              style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr" }}>
              <span>Market</span>
              <span>Side</span>
              <span className="text-right">Date</span>
            </div>
            <div className="h-[1.5px] bg-white/[0.2]" />
            {visible.map((trade: any, i: number) => (
              <div key={trade.id}>
                <Link href={`/memory/trade/${trade.id}`}
                  className="grid items-center py-4 text-[14px] hover:bg-white/[0.02] transition-colors"
                  style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr" }}>
                  <span className="text-white truncate pr-3">{trade.title}</span>
                  <span className="text-white/70 uppercase">{trade.side}</span>
                  <span className="text-white/70 text-right">
                    {trade.date ? new Date(trade.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </span>
                </Link>
                {i < visible.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
              </div>
            ))}
          </div>
        </div>
        {items.length > 5 && (
          <div className="flex items-center justify-between mt-5">
            <span className="text-[12px] text-white/70 italic">
              Showing {visible.length} of {items.length} trades
            </span>
            <button onClick={() => setShowAll(!showAll)}
              className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">
              {showAll ? "Show less" : "View more"} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentScoreChart({ scorecard }: { scorecard: Record<string, any> }) {
  const data = Object.entries(scorecard)
    .map(([role, info]: [string, any]) => ({
      name: role.replace(/_/g, " "),
      role,
      score: Number(info.avg_score ?? 0),
      n: Number(info.n ?? 0),
      grade: info.grade || (Number(info.avg_score ?? 0) >= 8 ? "A" : Number(info.avg_score ?? 0) >= 6 ? "B" : Number(info.avg_score ?? 0) >= 4 ? "C" : "D"),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-3">
      {data.map((agent) => {
        const { color } = gradeFor(agent.score);
        return (
          <div key={agent.role} className="flex items-center gap-3">
            <Link href={`/memory/agent/${agent.role}`}
              className="text-[13px] text-white font-medium w-[130px] shrink-0 hover:text-[#60a5fa] transition-colors truncate">
              {agent.name}
            </Link>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>{agent.grade}</span>
            <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
              <div className="h-full rounded-sm" style={{ width: `${(agent.score / 10) * 100}%`, background: scoreBarColor() }} />
            </div>
            <span className={`text-[18px] font-bold tabular-nums w-[32px] text-right ${scoreTextColor(agent.score)}`}>{agent.score.toFixed(1)}</span>
            <span className="text-[11px] text-white/70 w-[55px] text-right shrink-0">{agent.n} trades</span>
          </div>
        );
      })}
    </div>
  );
}
