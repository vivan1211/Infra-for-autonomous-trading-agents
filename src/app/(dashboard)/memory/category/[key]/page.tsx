"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { useWikiCategory } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";

const FAILURE_COLORS: Record<string, string> = {
  BOT_SKIP_CORRECT: "#34D399", CORRECT_PROCESS: "#34D399", UNLUCKY_CORRECT_PROCESS: "#5EEAD4",
  RULE_CORRECT: "#34D399", INSUFFICIENT_EDGE: "#FBBF24", BOT_SKIP_MISSED: "#FB923C",
  RULE_TOO_STRICT: "#FBBF24", LUCKY_POOR_PROCESS: "#F87171", RULE_TOO_LOOSE: "#FB7185",
  LOW_RESEARCH: "#E879F9", ANCHORING_BIAS: "#C084FC", RESOLUTION_MISREAD: "#F87171",
  RISK_MANAGER_OVERRULED: "#FB923C", BASE_RATE_NEGLECT: "#F472B6", RECENCY_BIAS: "#A78BFA",
};

function pct(v: any): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

export default function CategoryWikiPage() {
  const { key } = useParams<{ key: string }>();
  const { category, loading, error } = useWikiCategory(key);
  const [showAllTrades, setShowAllTrades] = useState(false);

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !category) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "Category not found"}</p>;
  }

  const c: any = category;
  const fm: any = c.frontmatter ?? {};
  const snap: any = c.data_snapshot ?? {};
  const traded: any = snap.traded ?? {};
  const failureModes: Record<string, number> = snap.failure_modes ?? {};
  const recentTrades: any[] = snap.recent_trades ?? [];
  const recentTradeIds: string[] = snap.recent_trade_ids ?? [];

  const totalAnalyzed = Number(snap.total_analyzed ?? 0);
  const tradedCount = Number(traded.count ?? 0);
  const wins = Number(traded.wins ?? 0);
  const losses = Number(traded.losses ?? 0);
  const tradedPnl = Number(traded.pnl ?? 0);
  const winRate = tradedCount > 0 ? wins / tradedCount : 0;

  const avgBotProb = snap.avg_bot_probability != null ? Number(snap.avg_bot_probability) : null;
  const actualResRate = snap.actual_resolution_rate != null ? Number(snap.actual_resolution_rate) : null;
  const calBias = snap.calibration_bias != null ? Number(snap.calibration_bias) : null;
  const skipAcc = snap.skip_accuracy != null ? Number(snap.skip_accuracy) : null;

  const categoryName = fm.sub_category || fm.category || key.replace(/-/g, " ");

  // Failure mode data
  const fmData = Object.entries(failureModes)
    .map(([k, count]) => ({ name: k.replace(/_/g, " "), key: k, count: Number(count), color: FAILURE_COLORS[k] || "rgba(255,255,255,0.2)" }))
    .sort((a, b) => b.count - a.count);
  const fmTotal = fmData.reduce((s, d) => s + d.count, 0);

  // Trade items
  const tradeItems = recentTrades.length > 0
    ? recentTrades
    : recentTradeIds.map((id) => ({ id, title: id, side: "", date: null }));
  const visibleTrades = showAllTrades ? tradeItems : tradeItems.slice(0, 5);

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <Link href="/memory?tab=categories" className="text-[13px] text-white/60 hover:text-white/80 transition-colors">
          ← Back to Categories
        </Link>
        <h1 className="text-[28px] md:text-[36px] font-bold text-white tracking-tight mt-3 capitalize">
          {categoryName}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-[14px] text-white/70">
          <span>{totalAnalyzed} analyzed</span>
          <span>·</span>
          <span>{tradedCount} traded</span>
          {winRate > 0 && (
            <>
              <span>·</span>
              <span className="text-white">{(winRate * 100).toFixed(0)}% win rate</span>
            </>
          )}
          {tradedPnl !== 0 && (
            <>
              <span>·</span>
              <span className={pnlColor(tradedPnl)}>{tradedPnl >= 0 ? "+" : ""}{formatCurrency(tradedPnl)} P&L</span>
            </>
          )}
        </div>
      </div>

      {/* Performance */}
      <div>
        <h2 className="text-[22px] font-semibold text-white">Performance</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="divide-y divide-white/[0.06]">
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/70">Total Analyzed<InfoTip text="Total markets analyzed in this category, including skipped and rejected" /></span>
              <span className="text-[13px] font-medium tabular-nums text-white">{totalAnalyzed}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/70">Traded<InfoTip text="Markets where a trade was actually executed in this category" /></span>
              <div className="text-right">
                <span className="text-[13px] font-medium tabular-nums text-white">{tradedCount}</span>
                {tradedCount > 0 && <span className="text-[12px] text-white/70 ml-2">{wins}W / {losses}L</span>}
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/70">Win Rate<InfoTip text="Percentage of executed trades in this category that won" /></span>
              <span className="text-[13px] font-medium tabular-nums text-white">{winRate > 0 ? `${(winRate * 100).toFixed(1)}%` : "—"}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/70">P&L<InfoTip text="Realized profit or loss from executed trades in this category" /></span>
              <span className={`text-[13px] font-medium tabular-nums ${tradedPnl !== 0 ? pnlColor(tradedPnl) : "text-white"}`}>
                {tradedPnl !== 0 ? `${tradedPnl >= 0 ? "+" : ""}${formatCurrency(tradedPnl)}` : "—"}
              </span>
            </div>
            {skipAcc != null && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-white/70">Skip Accuracy<InfoTip text="How often skipped trades in this category would have lost" /></span>
                <span className="text-[13px] font-medium tabular-nums text-white">{pct(skipAcc)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calibration */}
      {(avgBotProb != null || actualResRate != null || calBias != null) && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Calibration</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div className="divide-y divide-white/[0.06]">
              {avgBotProb != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/70">Avg Bot Probability<InfoTip text="Mean probability the bots assigned to YES for markets in this category" /></span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{pct(avgBotProb)}</span>
                </div>
              )}
              {actualResRate != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/70">Actual Resolution Rate<InfoTip text="What percentage of markets actually resolved YES" /></span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{pct(actualResRate)}</span>
                </div>
              )}
              {calBias != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/70">Calibration Bias<InfoTip text="Predicted minus actual. Positive = overconfident, negative = underconfident" /></span>
                  <span className={`text-[13px] font-medium tabular-nums ${Math.abs(calBias) < 0.03 ? "text-white" : Math.abs(calBias) < 0.08 ? "text-warning" : "text-loss"}`}>
                    {calBias > 0 ? "+" : ""}{(calBias * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {/* Bias scale — keep this, it's unique */}
            {calBias != null && (
              <div className="mt-6">
                <div className="relative w-full h-[4px] bg-white/[0.06] rounded-full">
                  <div className="absolute left-1/2 top-[-4px] bottom-[-4px] w-[1px] bg-white/10" />
                  <div
                    className="absolute top-[-3px] w-2.5 h-[10px] rounded-full"
                    style={{
                      left: `${50 + calBias * 100 * 2}%`,
                      transform: "translateX(-50%)",
                      background: Math.abs(calBias) < 0.03 ? "rgba(255,255,255,0.5)" : Math.abs(calBias) < 0.08 ? "#FBBF24" : "#F87171",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-white/70">Underconfident</span>
                  <span className="text-[11px] text-white/70">Overconfident</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Failure Modes — table style */}
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
                <div key={d.key}>
                  <div className="grid items-center py-4 text-[14px]"
                    style={{ gridTemplateColumns: "2fr 0.8fr 0.8fr" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-white">{d.name}</span>
                    </div>
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

      {/* Recent Trades — table with titles */}
      {tradeItems.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Recent trades</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <div style={{ minWidth: "400px" }}>
                <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                  style={{ gridTemplateColumns: "2.5fr 0.6fr 1fr" }}>
                  <span>Market</span>
                  <span>Side</span>
                  <span className="text-right">Date</span>
                </div>
                <div className="h-[1.5px] bg-white/[0.2]" />
                {visibleTrades.map((trade: any, i: number) => (
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
                    {i < visibleTrades.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                  </div>
                ))}
              </div>
            </div>
            {tradeItems.length > 5 && (
              <div className="flex items-center justify-between mt-5">
                <span className="text-[12px] text-white/70 italic">
                  Showing {visibleTrades.length} of {tradeItems.length} trades
                </span>
                <button onClick={() => setShowAllTrades(!showAllTrades)}
                  className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">
                  {showAllTrades ? "Show less" : "View more"} →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
