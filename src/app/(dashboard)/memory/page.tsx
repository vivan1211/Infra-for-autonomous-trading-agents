"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  useWikiDashboard,
  useWikiLog,
  useWikiBots,
  useWikiCategories,
  useWikiAgents,
  useWikiTrades,
  useWikiPatterns,
  useWikiSnapshots,
  useShouldTradeAudit,
} from "@/hooks/use-wiki";
import type { ShouldTradeAuditRow } from "@/lib/api";
import InfoTip from "@/components/InfoTip";
import {
  AreaChart, Area, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════ */

const FAILURE_COLORS: Record<string, string> = {
  // Good outcomes — emerald/teal
  BOT_SKIP_CORRECT: "#34D399", CORRECT_PROCESS: "#34D399", UNLUCKY_CORRECT_PROCESS: "#5EEAD4",
  RULE_CORRECT: "#34D399",
  // Caution — amber/orange
  INSUFFICIENT_EDGE: "#FBBF24", BOT_SKIP_MISSED: "#FB923C",
  RULE_TOO_STRICT: "#FBBF24",
  // Problems — coral/rose spectrum (each slightly different for distinction)
  LUCKY_POOR_PROCESS: "#F87171", RULE_TOO_LOOSE: "#FB7185",
  LOW_RESEARCH: "#E879F9", ANCHORING_BIAS: "#C084FC", RESOLUTION_MISREAD: "#F87171",
  RISK_MANAGER_OVERRULED: "#FB923C", BASE_RATE_NEGLECT: "#F472B6", RECENCY_BIAS: "#A78BFA",
};


const QUALITY_COLORS = ["#34D399", "#FBBF24", "#F87171"];  // emerald, amber, coral — modern palette

type NavItem = "overview" | "bots" | "agents" | "categories" | "trades" | "patterns" | "activity";

const VALID_TABS: NavItem[] = ["overview", "bots", "agents", "categories", "trades", "patterns", "activity"];

function pct(v: any): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function weeksAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  if (isNaN(diff) || diff < 0) return "now";
  const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
  if (weeks < 1) return "<1w";
  return `${weeks}w`;
}

/* ════════════════════════════════════════════════════════════════ */
/*  WIKI HOME                                                       */
/* ════════════════════════════════════════════════════════════════ */

export default function MemoryPage() {
  return (
    <Suspense>
      <MemoryPageInner />
    </Suspense>
  );
}

function MemoryPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as NavItem | null;
  const activeNav: NavItem = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "overview";

  const { dashboard } = useWikiDashboard();
  const { log, loading: logLoading } = useWikiLog(15);
  const { bots } = useWikiBots();
  const { agents } = useWikiAgents();
  const { categories } = useWikiCategories();
  const { trades } = useWikiTrades();
  const { patterns } = useWikiPatterns();

  const snap: any = (dashboard as any)?.data_snapshot ?? {};
  const execCount = Number(snap.settled_count ?? snap.executed?.count ?? 0);
  const wins = Number(snap.executed?.wins ?? 0);
  const winRate = Number(snap.win_rate ?? (execCount > 0 ? wins / execCount : 0));

  return (
    <>
      {/* ── Main Content ── */}
      {activeNav === "overview" && (
        <OverviewContent snap={snap} patterns={patterns} bots={bots} winRate={winRate} />
      )}
      {activeNav === "bots" && <BotsContent bots={bots} />}
      {activeNav === "agents" && <AgentsContent agents={agents} bots={bots} />}
      {activeNav === "categories" && <CategoriesContent categories={categories} />}
      {activeNav === "trades" && <TradesContent trades={trades} />}
      {activeNav === "patterns" && <PatternsRedirect />}
      {activeNav === "activity" && <ActivityContent log={log} logLoading={logLoading} />}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  OVERVIEW COMPONENTS                                             */
/* ════════════════════════════════════════════════════════════════ */

function SystemHealthVerdict({ snap, patterns, winRate }: { snap: any; patterns: any[]; winRate: number }) {
  // Collect all patterns
  const allPats: any[] = [];
  for (const p of patterns) {
    const ps = p.data_snapshot?.patterns;
    if (Array.isArray(ps)) allPats.push(...ps);
  }
  const criticalCount = allPats.filter((p: any) => p.severity === "critical").length;
  const skipAcc = Number(snap.skip_accuracy ?? 0);
  const filterVal = Number(snap.filtering_value ?? 0);

  // Health score
  const health: "healthy" | "warning" | "critical" =
    criticalCount >= 2 || winRate < 0.35 ? "critical"
    : criticalCount >= 1 || skipAcc < 0.4 || winRate < 0.45 ? "warning"
    : "healthy";

  const config = {
    healthy: { icon: CheckCircle2, color: "border-l-gain", iconColor: "text-gain", title: "System performing well" },
    warning: { icon: AlertTriangle, color: "border-l-warning", iconColor: "text-warning", title: "Attention needed" },
    critical: { icon: XCircle, color: "border-l-loss", iconColor: "text-loss", title: "Critical issues detected" },
  }[health];

  const Icon = config.icon;

  // Build description
  const parts: string[] = [];
  if (skipAcc > 0) parts.push(`${(skipAcc * 100).toFixed(1)}% skip accuracy`);
  if (filterVal !== 0) parts.push(`${formatCurrency(Math.abs(filterVal))} filtering value ${filterVal > 0 ? "saved" : "lost"}`);
  if (criticalCount > 0) parts.push(`${criticalCount} critical pattern${criticalCount > 1 ? "s" : ""} need attention`);
  else parts.push("No critical patterns");
  const description = parts.join(" · ");

  const borderClass = health === "healthy" ? "border-gain/50" : health === "warning" ? "border-warning/50" : "border-loss/50";

  return (
    <div className={`flex items-center gap-3 py-3 border-l-2 pl-4 ${borderClass}`}>
      <Icon className={`w-4 h-4 ${config.iconColor} shrink-0`} />
      <p className="text-[13px] text-white/80">{config.title} — {description}</p>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════ */
/*  OVERVIEW (default)                                              */
/* ════════════════════════════════════════════════════════════════ */

function OverviewContent({ snap, patterns, bots, winRate }: { snap: any; patterns: any[]; bots: any[]; winRate: number }) {
  const { snapshots: dashSnapshots } = useWikiSnapshots("dashboard", "overview");
  const execCount = Number(snap.settled_count ?? snap.executed?.count ?? 0);

  const statPills = [
    `${Number(snap.total_trades ?? 0)} trades`,
    `${execCount} settled`,
    `${winRate > 0 ? (winRate * 100).toFixed(0) : 0}% win rate`,
    `${Number(snap.executed?.wins ?? 0)}W / ${Number(snap.executed?.losses ?? 0)}L`,
    snap.avg_confidence != null ? `${(Number(snap.avg_confidence) * 100).toFixed(0)}% confidence` : null,
    snap.avg_edge != null ? `${(Number(snap.avg_edge) * 100).toFixed(0)}% edge` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* Key Statistics */}
      <div>
        <h2 className="text-[22px] font-semibold text-white">Key statistics<InfoTip text="High-level performance metrics across all strategies and trades" /></h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex flex-wrap gap-3">
            {statPills.map((pill) => (
              <div key={pill}
                className="flex items-center gap-3 pl-4 pr-5 py-2 rounded-full border border-white/[0.08] hover:border-white/[0.15] transition-colors cursor-default">
                <span className="text-[14px] text-white font-medium whitespace-nowrap">{pill}</span>
              </div>
            ))}
          </div>
          {dashSnapshots.length >= 2 && (() => {
            const trendData = [...dashSnapshots].reverse().map((s: any) => ({
              week: s.period_start ? new Date(s.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
              pnl: Number(s.metrics?.cumulative?.pnl ?? s.metrics?.total_pnl ?? 0),
              win_rate: (s.metrics?.cumulative?.win_rate ?? s.metrics?.win_rate) != null ? Number(((s.metrics?.cumulative?.win_rate ?? s.metrics?.win_rate) * 100).toFixed(1)) : null,
            }));
            return (
            <div className="mt-8">
              {/* Cumulative P&L chart */}
              <div className="mb-2">
                <span className="text-[14px] text-white">Cumulative P&L</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -15, bottom: -5 }}>
                  <defs>
                    <linearGradient id="overviewPnlGrad" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#overviewPnlGrad)" dot={{ r: 3, fill: "#00C807", strokeWidth: 0 }} activeDot={{ r: 4, fill: "#00C807", strokeWidth: 0 }} />
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
            </div>
            );
          })()}
        </div>
      </div>

      {/* Filtering */}
      <div className="mt-14">
        <h2 className="text-[22px] font-semibold text-white">Filtering<InfoTip text="How effectively the system filters out bad trades before execution" /></h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="space-y-5">
            {/* Skip Accuracy */}
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-white w-[140px] shrink-0">Skip Accuracy<InfoTip text="How often skipped trades would have lost. Higher = better filtering" /></span>
              <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                <div className="h-full" style={{ width: `${(Number(snap.skip_accuracy ?? 0) * 100)}%`, backgroundColor: Number(snap.skip_accuracy ?? 0) >= 0.5 ? "#00C807" : "#FF6B8A" }} />
              </div>
              <span className="text-[14px] text-white tabular-nums shrink-0">{snap.skip_accuracy != null ? pct(snap.skip_accuracy) : "\u2014"}</span>
            </div>
            {/* Filtering Value */}
            <div className="flex items-center gap-3">
              <span className="text-[14px] text-white w-[140px] shrink-0">Filtering Value<InfoTip text="Net P&L saved by filtering out bad trades. Positive = filters adding value" /></span>
              <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                <div className="h-full bg-[#00C807]" style={{ width: `${Math.min(100, Math.abs(Number(snap.filtering_value ?? 0)) * 2)}%` }} />
              </div>
              <span className={`text-[14px] tabular-nums shrink-0 ${Number(snap.filtering_value ?? 0) >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                {formatCurrency(Number(snap.filtering_value ?? 0))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Counterfactual */}
      {bots.length > 0 && <CounterfactualSection bots={bots} />}

      {/* System Health */}
      <div className="mt-14">
        <SystemHealthVerdict snap={snap} patterns={patterns} winRate={winRate} />
      </div>

      {/* Active Patterns */}
      <ActivePatternsCards patterns={patterns} />

      {/* Analysis */}
      {snap.failure_modes && <FailureModeChart failureModes={snap.failure_modes} />}
      {snap.decision_quality && <DecisionQualityChart decisionQuality={snap.decision_quality} />}

      {/* LLM self-veto discipline */}
      <LLMVetoDisciplineSection />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  LLM SELF-VETO DISCIPLINE (sub-section of Overview)              */
/* ════════════════════════════════════════════════════════════════ */
/*
 * Audits how often each bot places a trade despite its own LLM saying
 * ``should_trade: false``. This is the LLM's meta-cognition flag — the
 * model admitting "I don't trust my own estimate enough to act on it".
 *
 * Current behaviour: Superforecaster bots IGNORE this flag by design
 * (analyze.py:198) and gate only on numerical edge. This panel exposes
 * the P&L of those "veto-override" trades so we can see empirically
 * whether ignoring the self-veto is costing money.
 *
 * Council bots use a different should_trade semantic (EV-based, from
 * the risk_manager), so their ``vetoed_false`` count is typically 0 —
 * a low-EV trade would also fail the numerical edge gate independently.
 */

function LLMVetoDisciplineSection() {
  const { audit, rows, loading, error } = useShouldTradeAudit("actual");

  // Group rows by bot_type_id → { approved_true, vetoed_false, unknown }
  const byBot = new Map<string, { name: string; approved?: ShouldTradeAuditRow; vetoed?: ShouldTradeAuditRow; unknown?: ShouldTradeAuditRow }>();
  for (const r of rows) {
    const entry = byBot.get(r.bot_type_id) ?? { name: r.bot_name ?? r.bot_type_id };
    if (r.flag === "approved_true") entry.approved = r;
    else if (r.flag === "vetoed_false") entry.vetoed = r;
    else entry.unknown = r;
    byBot.set(r.bot_type_id, entry);
  }

  const botEntries = Array.from(byBot.entries()).sort(([a], [b]) => a.localeCompare(b));
  const hasAnyVetoed = botEntries.some(([, e]) => (e.vetoed?.trades ?? 0) > 0);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2">
        <h2 className="text-[22px] font-semibold text-white">LLM self-veto discipline</h2>
        <InfoTip text="Did the bot trade when its own model said 'should_trade=false'? These are trades the LLM flagged as low-confidence meta-cognitively, but the numerical edge filter approved anyway. Only Superforecaster bots can produce these — Council's should_trade is EV-based and gets caught by the edge filter independently." />
      </div>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        {loading && <div className="text-xs text-white/60 py-2">Loading…</div>}
        {error && <div className="text-xs text-loss py-2">Failed to load: {error}</div>}
        {!loading && !error && botEntries.length === 0 && (
          <div className="text-xs text-white/60 py-2">
            No settled trades with reasoning yet. This section will populate once you have
            executed trades.
          </div>
        )}
        {!loading && !error && botEntries.length > 0 && (
          <>
            {!hasAnyVetoed && (
              <div className="text-xs text-white/60 mb-4">
                Good news: no veto-override trades across any bot in{" "}
                <span className="text-white">{audit?.environment ?? "actual"}</span> environment.
                Every settled trade either had ``should_trade=true`` or no marker.
              </div>
            )}
            <div className="border border-white/[0.08] rounded-xl overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-white/[0.03] text-white/60 text-left">
                    <th className="px-4 py-2 font-medium">Bot</th>
                    <th className="px-4 py-2 font-medium">Flag</th>
                    <th className="px-4 py-2 font-medium text-right">Trades</th>
                    <th className="px-4 py-2 font-medium text-right">P&amp;L</th>
                    <th className="px-4 py-2 font-medium text-right">Staked</th>
                    <th className="px-4 py-2 font-medium text-right">Win rate</th>
                    <th className="px-4 py-2 font-medium text-right">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {botEntries.flatMap(([botId, entry]) => {
                    const buckets: Array<{ label: string; badge: string; badgeClass: string; row?: ShouldTradeAuditRow }> = [
                      { label: "Approved", badge: "should_trade=true", badgeClass: "bg-[rgba(52,211,153,0.12)] text-gain", row: entry.approved },
                      { label: "Vetoed", badge: "should_trade=false", badgeClass: "bg-[rgba(248,113,113,0.12)] text-loss", row: entry.vetoed },
                      { label: "Unknown", badge: "no marker", badgeClass: "bg-white/[0.06] text-white/60", row: entry.unknown },
                    ];
                    return buckets
                      .filter((b) => b.row && b.row.trades > 0)
                      .map((b, i) => (
                        <tr key={`${botId}-${b.label}`} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-white">
                            {i === 0 ? entry.name : ""}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${b.badgeClass}`}>
                              {b.badge}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-white/80">{b.row!.trades}</td>
                          <td className={`px-4 py-3 text-right font-mono ${pnlColor(b.row!.total_pnl)}`}>
                            {formatCurrency(b.row!.total_pnl)}
                          </td>
                          <td className="px-4 py-3 text-right text-white/60 font-mono">
                            {formatCurrency(b.row!.staked)}
                          </td>
                          <td className="px-4 py-3 text-right text-white/80 font-mono">
                            {b.row!.win_rate_pct.toFixed(0)}%
                          </td>
                          <td className={`px-4 py-3 text-right font-mono ${pnlColor(b.row!.roi_pct)}`}>
                            {b.row!.roi_pct > 0 ? "+" : ""}
                            {b.row!.roi_pct.toFixed(1)}%
                          </td>
                        </tr>
                      ));
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  ACTIVITY (standalone tab)                                       */
/* ════════════════════════════════════════════════════════════════ */

function ActivityContent({ log, logLoading }: { log: any[]; logLoading: boolean }) {
  return (
    <div>
      <ActivityTimeline log={log} loading={logLoading} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  BOTS                                                            */
/* ════════════════════════════════════════════════════════════════ */

function BotsContent({ bots }: { bots: any[] }) {
  if (!bots.length) return <EmptyState>No bot data yet</EmptyState>;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white">Strategies</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="border border-white/[0.08] rounded-xl overflow-hidden divide-y divide-white/[0.06]">
          {bots.map((bot: any, i: number) => {
            const fm: any = bot.frontmatter || {};
            const bs: any = bot.data_snapshot || {};
            const botPnl = Number(bs.executed?.pnl ?? 0);
            const skipAcc = bs.skip_accuracy;
            const failureModes = bs.failure_modes ?? {};
            const topMode = Object.entries(failureModes).sort(([, a]: any, [, b]: any) => b - a)[0];
            return (
              <Link key={bot.page_key || i} href={`/memory/bot/${bot.page_key}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group">
                <div className="min-w-0">
                  <div className="text-[15px] text-white font-medium group-hover:text-[#60a5fa] transition-colors">
                    {fm.bot_type_id || bot.page_key}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[12px] text-white/70">
                    <span>{bot.trade_count || 0} trades<InfoTip text="Total trades analyzed by this strategy (executed + skipped + rejected)" /></span>
                    {skipAcc != null && <span>{pct(skipAcc)} skip acc<InfoTip text="How often this strategy's skipped trades would have lost" /></span>}
                    {topMode && <span>Top: {String(topMode[0]).replace(/_/g, " ")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {botPnl !== 0 && (
                    <span className={`text-[14px] font-medium tabular-nums ${pnlColor(botPnl)}`}>
                      {botPnl >= 0 ? "+" : ""}{formatCurrency(botPnl)}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  AGENTS                                                          */
/* ════════════════════════════════════════════════════════════════ */

function AgentsContent({ agents, bots }: { agents: any[]; bots: any[] }) {
  if (!agents.length) return <EmptyState>No agent data yet</EmptyState>;

  // Build a map: agent_role → list of bot names that use it
  const agentToBots: Record<string, string[]> = {};
  for (const bot of bots) {
    const scorecard = bot.data_snapshot?.agent_scorecard ?? {};
    const botName = bot.frontmatter?.bot_type_id || bot.page_key || "";
    for (const role of Object.keys(scorecard)) {
      if (!agentToBots[role]) agentToBots[role] = [];
      if (!agentToBots[role].includes(botName)) agentToBots[role].push(botName);
    }
  }

  const sorted = [...agents].sort((a: any, b: any) =>
    ((b.data_snapshot || {}).avg_score ?? 0) - ((a.data_snapshot || {}).avg_score ?? 0)
  );

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white">Agents</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div style={{ minWidth: "500px" }}>
          <div className="grid items-center pb-4 text-[14px] font-bold text-white"
            style={{ gridTemplateColumns: "2fr 1.2fr 0.6fr 0.8fr 0.6fr" }}>
            <span>Agent</span>
            <span>Strategy<InfoTip text="Which bot strategy uses this agent" /></span>
            <span className="text-right">Grade<InfoTip text="Letter grade from average score: A (8+), B (6+), C (4+), D (<4)" /></span>
            <span className="text-right">Score<InfoTip text="Average post-mortem score out of 10 across all scored trades" /></span>
            <span className="text-right">Scored<InfoTip text="Number of trades where this agent's contribution was evaluated" /></span>
          </div>
          <div className="h-[1.5px] bg-white/[0.2]" />
          {sorted.map((agent: any, i: number) => {
            const as_: any = agent.data_snapshot || {};
            const fm: any = agent.frontmatter || {};
            const score = Number(as_.avg_score ?? fm.score ?? 0);
            const grade = fm.grade || (score >= 8 ? "A" : score >= 6 ? "B" : score >= 4 ? "C" : "D");
            const n = as_.n_scored ?? 0;
            const usedBy = agentToBots[agent.page_key] || [];
            return (
              <div key={agent.page_key || i}>
                <Link href={`/memory/agent/${agent.page_key}`}
                  className="grid items-center py-5 text-[14px] hover:bg-white/[0.02] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: "2fr 1.2fr 0.6fr 0.8fr 0.6fr" }}>
                  <span className="text-white truncate pr-3">{(agent.page_key || "").replace(/_/g, " ")}</span>
                  <span className="text-white/70 truncate">{usedBy.length > 0 ? usedBy.join(", ") : "—"}</span>
                  <span className="text-white/70 text-right">{grade}</span>
                  <span className="text-white font-medium tabular-nums text-right">{score.toFixed(1)}</span>
                  <span className="text-white/70 tabular-nums text-right">{n}</span>
                </Link>
                {i < sorted.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  CATEGORIES                                                      */
/* ════════════════════════════════════════════════════════════════ */

function CategoriesContent({ categories }: { categories: any[] }) {
  if (!categories.length) return <EmptyState>No category data yet</EmptyState>;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white">Categories</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div style={{ minWidth: "500px" }}>
          <div className="grid items-center pb-4 text-[14px] font-bold text-white"
            style={{ gridTemplateColumns: "2fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr" }}>
            <span>Category</span>
            <span className="text-right">Analyzed<InfoTip text="Total markets analyzed in this category, including skipped and rejected" /></span>
            <span className="text-right">Traded<InfoTip text="Markets where a trade was actually executed" /></span>
            <span className="text-right">Bias<InfoTip text="Calibration bias: predicted probability minus actual win rate. Positive = overconfident" /></span>
            <span className="text-right">Skip Acc<InfoTip text="Skip accuracy within this category" /></span>
            <span className="text-right">P&L</span>
          </div>
          <div className="h-[1.5px] bg-white/[0.2]" />
          {categories.map((cat: any, i: number) => {
            const fm: any = cat.frontmatter || {};
            const cs: any = cat.data_snapshot || {};
            const bias = Number(cs.calibration_bias ?? 0);
            const tradedPnl = Number(cs.traded?.pnl ?? 0);
            const tradedCount = Number(cs.traded?.count ?? 0);
            return (
              <div key={cat.page_key || i}>
                <Link href={`/memory/category/${cat.page_key}`}
                  className="grid items-center py-5 text-[14px] hover:bg-white/[0.02] transition-colors cursor-pointer"
                  style={{ gridTemplateColumns: "2fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr" }}>
                  <span className="text-white truncate pr-3">{fm.sub_category || fm.category || cat.page_key}</span>
                  <span className="text-white/70 tabular-nums text-right">{cs.total_analyzed ?? cat.trade_count ?? 0}</span>
                  <span className="text-white/70 tabular-nums text-right">{tradedCount > 0 ? tradedCount : "—"}</span>
                  <span className={`tabular-nums text-right ${Math.abs(bias) < 0.03 ? "text-white/70" : Math.abs(bias) < 0.08 ? "text-warning" : "text-loss"}`}>
                    {bias !== 0 ? `${bias > 0 ? "+" : ""}${(bias * 100).toFixed(1)}%` : "—"}
                  </span>
                  <span className="text-white/70 tabular-nums text-right">{cs.skip_accuracy != null ? `${(Number(cs.skip_accuracy) * 100).toFixed(0)}%` : "—"}</span>
                  <span className={`font-medium tabular-nums text-right ${tradedPnl > 0 ? "text-[#00C807]" : tradedPnl < 0 ? "text-[#FF6B8A]" : "text-white/40"}`}>
                    {tradedPnl !== 0 ? `${tradedPnl >= 0 ? "+" : ""}${formatCurrency(tradedPnl)}` : "—"}
                  </span>
                </Link>
                {i < categories.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  TRADES                                                          */
/* ════════════════════════════════════════════════════════════════ */

function TradesContent({ trades }: { trades: any[] }) {
  const [filter, setFilter] = useState("all");

  if (!trades.length) return <EmptyState>No trade data yet</EmptyState>;

  const filtered = filter === "all" ? trades : trades.filter((t: any) => {
    const bucket = t.frontmatter?.bucket || t.data_snapshot?.signals?.bucket || "";
    const sig = t.data_snapshot?.signals || {};
    const fm = t.frontmatter || {};
    if (filter === "live") return (sig.environment || fm.environment) === "actual";
    if (filter === "training") return (sig.environment || fm.environment) === "training";
    if (filter === "won") return bucket === "won";
    if (filter === "lost") return bucket === "lost";
    if (filter === "skipped") return bucket.includes("skipped");
    if (filter === "rejected") return bucket.includes("rejected");
    if (filter === "would_have_won") return bucket.includes("would_have_won");
    if (filter === "would_have_lost") return bucket.includes("would_have_lost");
    return true;
  });

  const filters = [
    { key: "all", label: "All" },
    { key: "live", label: "Live" },
    { key: "training", label: "Training" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
    { key: "skipped", label: "Skipped" },
    { key: "rejected", label: "Rejected" },
    { key: "would_have_won", label: "Would Have Won" },
    { key: "would_have_lost", label: "Would Have Lost" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-[22px] font-semibold text-white">Trades</h2>
        <div className="flex items-center gap-1 flex-wrap">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors ${
                filter === f.key
                  ? "text-[#00C807] border border-[#00C807]"
                  : "text-white/40 border border-white/[0.08] hover:border-white/[0.15]"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div style={{ minWidth: "600px" }}>
            <div className="grid items-center pb-4 text-[14px] font-bold text-white"
              style={{ gridTemplateColumns: "2.5fr 0.8fr 0.8fr 0.8fr" }}>
              <span>Market<InfoTip text="The prediction market this trade was placed on" /></span>
              <span>Bot<InfoTip text="Which strategy analyzed and/or executed this trade" /></span>
              <span>Status<InfoTip text="Trade outcome: won, lost, skipped (AI filtered), rejected (rules blocked), or counterfactual" /></span>
              <span className="text-right">P&L<InfoTip text="Realized profit or loss from this trade" /></span>
            </div>
            <div className="h-[1.5px] bg-white/[0.2]" />
            {filtered.slice(0, 50).map((trade: any, i: number) => {
              const fm: any = trade.frontmatter || {};
              const sig: any = trade.data_snapshot?.signals || {};
              const tradePnl = Number(sig.pnl ?? fm.pnl ?? 0);
              const botId = sig.bot_type_id || fm.bot_type_id || "";
              const bucket = fm.bucket || sig.bucket || "";
              return (
                <div key={trade.page_key || i}>
                  <Link href={`/memory/trade/${trade.page_key}`}
                    className="grid items-center py-4 text-[14px] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: "2.5fr 0.8fr 0.8fr 0.8fr" }}>
                    <span className="text-white truncate pr-3">{fm.market_title || trade.page_key}</span>
                    <span className="text-white/70">{botId || "—"}</span>
                    <span className={`${bucket === "won" ? "text-[#00C807]" : bucket === "lost" ? "text-[#FF6B8A]" : "text-white/40"}`}>
                      {bucket.replace(/_/g, " ") || "—"}
                      {(sig.environment || fm.environment) === "training" && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-white/70 bg-white/[0.04]">TRAIN</span>
                      )}
                    </span>
                    <span className={`font-medium tabular-nums text-right ${tradePnl > 0 ? "text-[#00C807]" : tradePnl < 0 ? "text-[#FF6B8A]" : "text-white/40"}`}>
                      {tradePnl !== 0 ? `${tradePnl >= 0 ? "+" : ""}${formatCurrency(tradePnl)}` : "—"}
                    </span>
                  </Link>
                  {i < Math.min(filtered.length, 50) - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                </div>
              );
            })}
          </div>
        </div>
        {filtered.length > 50 && (
          <div className="flex items-center justify-between mt-5">
            <span className="text-[12px] text-white/70 italic">Showing 50 of {filtered.length} trades</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  PATTERNS (deprecated — redirects to Analysis)                   */
/* ════════════════════════════════════════════════════════════════ */

function PatternsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/memory/analysis");
  }, [router]);
  return <p className="text-[13px] text-white/60 text-center py-10">Redirecting to Analysis...</p>;
}

/** @deprecated Patterns replaced by weekly Analysis (Phase G). Kept for reference. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PatternsContent({ patterns }: { patterns: any[] }) {
  if (!patterns.length) return <EmptyState>No patterns detected yet</EmptyState>;

  // Get the main pattern page (usually "latest-patterns")
  const mainPage: any = patterns[0];
  const snap: any = mainPage?.data_snapshot ?? {};
  const patternsList: any[] = Array.isArray(snap.patterns) ? snap.patterns : [];
  const detStats: any = snap.deterministic_stats ?? {};
  const agentScorecard: Record<string, any> = detStats.agent_scorecard ?? {};
  const bucketComparison: Record<string, any> = detStats.bucket_comparison ?? {};
  const failureModes: Record<string, number> = detStats.failure_modes ?? {};

  const topAgentRaw = snap.top_agent || "";
  const worstAgentRaw = snap.worst_agent || "";
  const topAgentRole = topAgentRaw.split(":")[0]?.trim() || "";
  const topAgentReason = topAgentRaw.includes(":") ? topAgentRaw.slice(topAgentRaw.indexOf(":") + 1).trim() : "";
  const worstAgentRole = worstAgentRaw.split(":")[0]?.trim() || "";
  const worstAgentReason = worstAgentRaw.includes(":") ? worstAgentRaw.slice(worstAgentRaw.indexOf(":") + 1).trim() : "";

  const fmData = Object.entries(failureModes)
    .map(([k, count]) => ({ name: k.replace(/_/g, " "), count: Number(count) }))
    .sort((a, b) => b.count - a.count);
  const fmTotal = fmData.reduce((s, d) => s + d.count, 0);

  if (!patternsList.length) return <EmptyState>No patterns detected yet</EmptyState>;

  return (
    <div data-tour="evaluations-patterns">
      {/* Detected Patterns */}
      <div>
        <h2 className="text-[22px] font-semibold text-white">Detected patterns</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="space-y-8">
            {patternsList.map((pat: any, i: number) => (
              <div key={i}>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                    pat.severity === "critical" ? "text-loss bg-loss/10"
                    : pat.severity === "moderate" ? "text-warning bg-warning/10"
                    : "text-white/40 bg-white/[0.04]"
                  }`}>{pat.severity}</span>
                  {pat.status === "new" && <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#22d3ee]/10 text-[#22d3ee]">NEW</span>}
                  {pat.status === "active" && pat.first_seen && <span className="text-[11px] text-white/30">Active · {weeksAgo(pat.first_seen)}</span>}
                </div>
                {pat.affected_bots && Array.isArray(pat.affected_bots) && pat.affected_bots.length > 0 && pat.affected_bots[0] !== "all" && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {pat.affected_bots.map((bot: string) => (
                      <span key={bot} className="px-2 py-0.5 rounded text-[10px] text-white/70 bg-white/[0.04]">{bot}</span>
                    ))}
                  </div>
                )}
                <h3 className="text-[16px] font-semibold text-white leading-snug">{pat.title}</h3>
                {pat.times_detected > 1 && <span className="text-[11px] text-white/30 ml-2">Detected {pat.times_detected}x</span>}
                <p className="text-[14px] text-white/70 mt-2 leading-relaxed">{pat.description}</p>
                {pat.evidence && (
                  <div className="mt-3 border-l-2 border-white/[0.08] pl-4">
                    <span className="text-[12px] text-white/70 uppercase tracking-wider">Evidence<InfoTip text="Statistical basis for this pattern — the signal interaction detected" /></span>
                    <p className="text-[13px] text-white/70 mt-1 leading-relaxed">{pat.evidence}</p>
                  </div>
                )}
                {pat.suggested_action && (
                  <div className="mt-3">
                    <span className="text-[12px] text-white/70 uppercase tracking-wider">Suggested action<InfoTip text="Specific change to make: prompt edit, config change, or new filter rule" /></span>
                    <p className="text-[13px] text-white/80 font-mono mt-1 leading-relaxed">{pat.suggested_action}</p>
                  </div>
                )}
                {i < patternsList.length - 1 && <div className="h-[1px] bg-white/[0.06] mt-8" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Performance */}
      {(topAgentRole || worstAgentRole || Object.keys(agentScorecard).length > 0) && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Agent performance</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            {/* Top/Worst agent rows */}
            {(topAgentRole || worstAgentRole) && (
              <div className="mb-8">
                {topAgentRole && (
                  <div className="py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] text-white/50 uppercase tracking-wider">Top Agent</span>
                    </div>
                    <Link href={`/memory/agent/${topAgentRole.replace(/ /g, "_")}`}
                      className="text-[16px] font-semibold text-white hover:text-[#60a5fa] transition-colors">
                      {topAgentRole.replace(/_/g, " ")}
                    </Link>
                    {topAgentReason && <p className="text-[14px] text-white/70 mt-1 leading-relaxed">{topAgentReason}</p>}
                  </div>
                )}
                {topAgentRole && worstAgentRole && <div className="h-[1px] bg-white/[0.08]" />}
                {worstAgentRole && (
                  <div className="py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] text-white/50 uppercase tracking-wider">Worst Agent</span>
                    </div>
                    <Link href={`/memory/agent/${worstAgentRole.replace(/ /g, "_")}`}
                      className="text-[16px] font-semibold text-white hover:text-[#60a5fa] transition-colors">
                      {worstAgentRole.replace(/_/g, " ")}
                    </Link>
                    {worstAgentReason && <p className="text-[14px] text-white/70 mt-1 leading-relaxed">{worstAgentReason}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Agent scorecard table */}
            {Object.keys(agentScorecard).length > 0 && (
              <div style={{ minWidth: "400px" }}>
                <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                  style={{ gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr" }}>
                  <span>Agent<InfoTip text="AI agent role that contributed to trade decisions" /></span>
                  <span className="text-right">Score<InfoTip text="Average post-mortem score (0-10) across all evaluated trades" /></span>
                  <span className="text-right">Grade<InfoTip text="Letter grade: A (8+), B (6+), C (4+), D (<4)" /></span>
                  <span className="text-right">Trades<InfoTip text="Number of trades where this agent was scored" /></span>
                </div>
                <div className="h-[1.5px] bg-white/[0.2]" />
                {Object.entries(agentScorecard)
                  .sort(([, a]: [string, any], [, b]: [string, any]) => Number(b.avg ?? 0) - Number(a.avg ?? 0))
                  .map(([role, stats]: [string, any], i: number, arr) => {
                    const avg = Number(stats.avg ?? 0);
                    const grade = avg >= 8 ? "A" : avg >= 6 ? "B" : avg >= 4 ? "C" : "D";
                    return (
                      <div key={role}>
                        <Link href={`/memory/agent/${role}`}
                          className="grid items-center py-4 text-[14px] hover:bg-white/[0.02] transition-colors"
                          style={{ gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr" }}>
                          <span className="text-white hover:text-[#60a5fa] transition-colors">{role.replace(/_/g, " ")}</span>
                          <span className="text-white font-medium tabular-nums text-right">{avg.toFixed(1)}</span>
                          <span className="text-white/70 text-right">{grade}</span>
                          <span className="text-white/70 tabular-nums text-right">{Number(stats.n ?? 0)}</span>
                        </Link>
                        {i < arr.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bucket Comparison */}
      {Object.keys(bucketComparison).length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Bucket comparison</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <div style={{ minWidth: "600px" }}>
                <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                  style={{ gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.8fr 0.8fr 0.6fr" }}>
                  <span>Bucket</span>
                  <span className="text-right">Trades</span>
                  <span className="text-right">Avg Conf<InfoTip text="Average AI confidence for trades in this outcome bucket" /></span>
                  <span className="text-right">Avg Edge<InfoTip text="Average edge at entry for trades in this bucket" /></span>
                  <span className="text-right">Avg Hedge<InfoTip text="Average hedge score (0-15) for trades in this bucket" /></span>
                  <span className="text-right">Sources<InfoTip text="Average sources cited in reasoning for trades in this bucket" /></span>
                </div>
                <div className="h-[1.5px] bg-white/[0.2]" />
                {Object.entries(bucketComparison).map(([bucket, stats]: [string, any], i: number, arr) => (
                  <div key={bucket}>
                    <div className="grid items-center py-4 text-[14px]"
                      style={{ gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.8fr 0.8fr 0.6fr" }}>
                      <span className="text-white capitalize">{bucket.replace(/_/g, " ")}</span>
                      <span className="text-white/70 tabular-nums text-right">{Number(stats.n ?? 0)}</span>
                      <span className="text-white tabular-nums text-right">{stats.avg_confidence != null ? `${(Number(stats.avg_confidence) * 100).toFixed(1)}%` : "—"}</span>
                      <span className="text-white tabular-nums text-right">{stats.avg_edge != null ? `${(Number(stats.avg_edge) * 100).toFixed(1)}%` : "—"}</span>
                      <span className="text-white tabular-nums text-right">{stats.avg_hedge != null ? Number(stats.avg_hedge).toFixed(1) : "—"}</span>
                      <span className="text-white/70 tabular-nums text-right">{stats.avg_sources != null ? Number(stats.avg_sources).toFixed(1) : "—"}</span>
                    </div>
                    {i < arr.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failure Modes */}
      {fmData.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Failure modes</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div style={{ minWidth: "400px" }}>
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
                <span>Mode</span><span className="text-right">Count</span><span className="text-right">Share</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />
              {fmData.map((d, i) => (
                <div key={d.name}>
                  <div className="grid items-center py-4 text-[14px]"
                    style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
                    <span className="text-white">{d.name}</span>
                    <span className="text-white/70 tabular-nums text-right">{d.count}</span>
                    <span className="text-white/70 tabular-nums text-right">{fmTotal > 0 ? ((d.count / fmTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                  {i < fmData.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Resolved Patterns */}
      {(() => {
        const resolved = snap.resolved_patterns ?? [];
        if (!resolved.length) return null;
        return (
          <div className="mt-14">
            <h2 className="text-[22px] font-semibold text-white/30">Resolved patterns</h2>
            <div className="border-t border-white/[0.08] mt-3 pt-6">
              <div className="space-y-6">
                {resolved.map((rp: any, i: number) => (
                  <div key={rp.pattern_id || i} className="opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-gain/10 text-gain">Resolved</span>
                      {rp.times_detected > 1 && <span className="text-[11px] text-white/30">Was detected {rp.times_detected}x</span>}
                    </div>
                    <h3 className="text-[16px] font-semibold text-white/70 leading-snug">{rp.title || rp.pattern_id}</h3>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  SHARED COMPONENTS                                               */
/* ════════════════════════════════════════════════════════════════ */

function CounterfactualSection({ bots }: { bots: any[] }) {
  const rows = bots
    .map((bot: any) => {
      const bs: any = bot.data_snapshot || {};
      const skipped: any = bs.skipped || {};
      const rejected: any = bs.rejected || {};
      return {
        name: bot.frontmatter?.bot_type_id || bot.page_key,
        pageKey: bot.page_key,
        skipCount: Number(skipped.count ?? 0),
        skipCfPnl: Number(skipped.cf_pnl ?? 0),
        rejCount: Number(rejected.count ?? 0),
        rejCfPnl: Number(rejected.cf_pnl ?? 0),
        totalCf: Number(skipped.cf_pnl ?? 0) + Number(rejected.cf_pnl ?? 0),
        skipAcc: bs.skip_accuracy != null ? Number(bs.skip_accuracy) : null,
      };
    })
    .filter((r) => r.skipCount > 0 || r.rejCount > 0);

  if (!rows.length) return null;

  const totCf = rows.reduce((s, r) => s + r.totalCf, 0);

  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Counterfactual<InfoTip text="What would have happened if filtered trades were executed instead" /></h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <p className="text-[13px] text-white/70 mb-5 leading-relaxed">
          What would have happened if filtered trades were executed instead.
        </p>
        <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {/* Total card */}
          <div className="shrink-0 flex-1 min-w-[160px] border border-white/[0.08] rounded-xl px-5 py-6 flex flex-col">
            <div className="text-[14px] font-medium text-white leading-snug">Total CF P&L<InfoTip text="What total P&L would be if all filtered trades were executed. Negative (green) = money saved" /></div>
            <div className="flex-1" />
            <div className="mt-6">
              <div className={`text-[20px] font-bold tabular-nums ${totCf <= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                {totCf >= 0 ? "+" : ""}{formatCurrency(totCf)}
              </div>
              <div className="text-[12px] text-white/70 mt-2">
                {totCf <= 0 ? "Loss avoided by filtering" : "Profit missed"}
              </div>
            </div>
          </div>
          {/* Per-bot cards */}
          {rows.map((r) => (
            <Link key={r.pageKey} href={`/memory/bot/${r.pageKey}`}
              className="shrink-0 flex-1 min-w-[160px] border border-white/[0.08] rounded-xl px-5 py-6 hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col no-underline">
              <div className="text-[14px] font-medium text-white leading-snug">{r.name}</div>
              <div className="flex-1" />
              <div className="mt-6">
                <div className={`text-[20px] font-bold tabular-nums ${r.totalCf <= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                  {r.totalCf >= 0 ? "+" : ""}{formatCurrency(r.totalCf)}
                </div>
                <div className="text-[12px] text-white/70 mt-2">
                  {r.skipCount} skipped<InfoTip text="Trades the AI chose not to execute" /> · {r.rejCount} rejected<InfoTip text="Trades blocked by risk management rules" />
                  {r.skipAcc != null && <> · {(r.skipAcc * 100).toFixed(0)}% acc<InfoTip text="Skip accuracy: how often skipped trades would have lost" /></>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-white/70 text-center py-20">{children}</p>;
}

function ActivePatternsCards({ patterns }: { patterns: any[] }) {
  const allPatterns: any[] = [];
  for (const p of patterns) {
    const snap: any = p.data_snapshot || {};
    const fm: any = p.frontmatter || {};
    if (Array.isArray(snap.patterns)) {
      for (const pat of snap.patterns) {
        allPatterns.push({ ...pat, status: fm.status || "active", pageKey: p.page_key });
      }
    }
  }

  // Only show critical and moderate on Overview
  const critical = allPatterns.filter(p => p.severity === "critical");
  const moderate = allPatterns.filter(p => p.severity === "moderate");
  const visible = [...critical, ...moderate];

  if (!visible.length) {
    return (
      <div className="mt-14">
        <h2 className="text-[22px] font-semibold text-white">Active Patterns<InfoTip text="Recurring behavioral patterns detected across trades that may need attention" /></h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex items-center gap-2 py-6 justify-center">
            <CheckCircle2 className="w-4 h-4 text-gain" />
            <p className="text-[14px] text-gain">No critical patterns detected</p>
          </div>
        </div>
      </div>
    );
  }

  const renderPattern = (p: any, i: number) => {
    const sevColor = p.severity === "critical" ? "text-[#FF6B8A]" : "text-[#FBBF24]";
    return (
      <div key={i}
        className="shrink-0 flex-1 min-w-[240px] border border-white/[0.08] rounded-xl px-5 py-6 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-bold uppercase ${sevColor}`}>{p.severity}</span>
          {p.status === "new" && <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-[#22d3ee]/10 text-[#22d3ee]">NEW</span>}
          {p.status === "active" && p.first_seen && <span className="text-[11px] text-white/30">Active · {weeksAgo(p.first_seen)}</span>}
        </div>
        {p.affected_bots && Array.isArray(p.affected_bots) && p.affected_bots.length > 0 && p.affected_bots[0] !== "all" && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {p.affected_bots.map((bot: string) => (
              <span key={bot} className="px-2 py-0.5 rounded text-[10px] text-white/70 bg-white/[0.04]">{bot}</span>
            ))}
          </div>
        )}
        <div className="text-[14px] font-medium text-white leading-snug line-clamp-2">{p.title}</div>
        <div className="flex-1" />
        <div className="text-[12px] text-white/70 mt-4 line-clamp-3">{p.description}</div>
        {p.times_detected > 1 && <div className="text-[11px] text-white/30 text-right mt-auto pt-2">Detected {p.times_detected}x</div>}
      </div>
    );
  };

  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Active Patterns<InfoTip text="Recurring behavioral patterns detected across trades that may need attention" /></h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {visible.map(renderPattern)}
        </div>
      </div>
    </div>
  );
}

function FailureModeChart({ failureModes }: { failureModes: any }) {
  const data = Object.entries(failureModes)
    .map(([key, count]: [string, any]) => ({
      name: key.replace(/_/g, " "),
      count: Number(count),
      color: FAILURE_COLORS[key] || "rgba(255,255,255,0.2)",
    }))
    .sort((a, b) => b.count - a.count);

  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Failure Modes<InfoTip text="Post-mortem classification of trade outcomes: what went right or wrong" /></h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div style={{ minWidth: "400px" }}>
          {/* Header */}
          <div className="grid items-center pb-4 text-[14px] font-bold text-white"
            style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
            <span>Mode<InfoTip text="Post-mortem classification of why a trade outcome happened" /></span><span className="text-right">Count</span><span className="text-right">Share<InfoTip text="Percentage of all classified trades with this failure mode" /></span>
          </div>
          <div className="h-[1.5px] bg-white/[0.2]" />

          {/* Rows */}
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
      </div>
    </div>
  );
}

function DecisionQualityChart({ decisionQuality }: { decisionQuality: any }) {
  const data = Object.entries(decisionQuality)
    .map(([name, count]: [string, any], i) => ({
      name: name.replace(/_/g, " ").toLowerCase(),
      value: Number(count),
      color: QUALITY_COLORS[i % QUALITY_COLORS.length],
    }));

  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Decision Quality<InfoTip text="Overall quality of trade decisions: good process, lucky/unlucky outcomes, or poor process" /></h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="space-y-5">
          {data.map((d, i) => {
            const pctValue = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[140px] shrink-0">{d.name}</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${pctValue}%`, backgroundColor: d.color }} />
                </div>
                <span className="text-[14px] text-white tabular-nums shrink-0 w-[80px] text-right">
                  {d.value} <span className="text-white/70">({pctValue.toFixed(0)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivityTimeline({ log, loading }: { log: any[]; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return <div className="w-full h-32 bg-white/[0.04] rounded-xl animate-pulse" />;
  }

  if (!Array.isArray(log) || log.length === 0) {
    return <p className="text-[13px] text-white/70 text-center py-8">No activity yet</p>;
  }

  const visible = showAll ? log : log.slice(0, 15);

  return (
    <div>
      <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div style={{ minWidth: "500px" }}>
          <div className="grid items-center pb-4 text-[14px] font-bold text-white"
            style={{ gridTemplateColumns: "1.5fr 2fr 0.8fr" }}>
            <span>Event</span>
            <span>Details</span>
            <span className="text-right">Time</span>
          </div>
          <div className="h-[1.5px] bg-white/[0.2]" />
          {visible.map((entry: any, i: number) => (
            <div key={i}>
              <div className="grid items-center py-3.5 text-[14px]"
                style={{ gridTemplateColumns: "1.5fr 2fr 0.8fr" }}>
                <span className="text-white">{entry.stage || entry.action || "—"}</span>
                <span className="text-white/70 truncate">{entry.message || "—"}</span>
                <span className="text-white/70 text-right">{entry.timestamp ? timeAgo(entry.timestamp) : ""}</span>
              </div>
              {i < visible.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
            </div>
          ))}
        </div>
      </div>
      {log.length > 15 && !showAll && (
        <div className="flex items-center justify-between mt-5">
          <span className="text-[12px] text-white/70 italic">Showing {visible.length} of {log.length} events</span>
          <button onClick={() => setShowAll(true)}
            className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">
            View more →
          </button>
        </div>
      )}
    </div>
  );
}
