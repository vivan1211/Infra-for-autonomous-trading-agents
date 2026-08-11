"use client";

import { formatMoneyFull } from "@/lib/utils";

interface OverviewStatsProps {
  totalPnl: number;
  totalTrades: number;
  activeTrades: number;
  winPct: string;
  winCount: number;
  lossCount: number;
  avgConf: number;
  avgSize: number;
  activeAgents: number;
  rejected: number;
  skipped: number;
}

export function OverviewStats({
  totalPnl,
  totalTrades,
  activeTrades,
  winPct,
  winCount,
  lossCount,
  avgConf,
  avgSize,
  activeAgents,
  rejected,
  skipped,
}: OverviewStatsProps) {
  const stats = [
    { label: "Net P&L", value: formatMoneyFull(totalPnl), color: totalPnl > 0 ? "text-gain" : totalPnl < 0 ? "text-loss" : "text-[#ffffff]" },
    { label: "Trades", value: totalTrades.toLocaleString() },
    { label: "Open", value: activeTrades.toString() },
    { label: "Win Rate", value: `${winPct}%`, sub: `${winCount}W / ${lossCount}L` },
    { label: "Avg Conf", value: `${avgConf}%` },
    { label: "Avg Size", value: `$${avgSize}` },
    { label: "Agents", value: activeAgents.toString() },
    { label: "Rejected", value: rejected.toLocaleString() },
    { label: "Skipped", value: skipped.toLocaleString() },
  ];

  return (
    <div className="mb-4">
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg px-3 py-3">
            <div className="text-[11px] text-[#919fa6] uppercase tracking-wider mb-1">{stat.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[18px] font-bold tabular-nums ${stat.color || "text-[#ffffff]"}`}>{stat.value}</span>
            </div>
            {stat.sub && <div className="text-[11px] text-[#919fa6] mt-0.5">{stat.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
