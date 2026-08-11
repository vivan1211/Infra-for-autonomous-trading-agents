"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { useWikiSweep } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot,
} from "recharts";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[ /_\.]/g, "-").replace(/[:\(\)]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function fmtDelta(v: number): string {
  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
}

export default function SweepPage() {
  const { sweep, loading, error } = useWikiSweep();

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !sweep) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "Sweep data not available"}</p>;
  }

  const s: any = sweep;
  const snap: any = s.data_snapshot ?? s;
  const tradeCount = Number(snap.trade_count ?? 0);
  const confSweep: any[] = Array.isArray(snap.confidence_sweep) ? snap.confidence_sweep : [];
  const edgeSweep: any[] = Array.isArray(snap.edge_sweep) ? snap.edge_sweep : [];
  const catStats: Record<string, any> = snap.category_stats ?? {};
  const optConf: any = snap.optimal_confidence ?? {};
  const optEdge: any = snap.optimal_edge ?? {};

  const confThresh = optConf.threshold != null ? Number(optConf.threshold) : null;
  const edgeThresh = optEdge.threshold != null ? Number(optEdge.threshold) : null;
  const confDelta = optConf.net_delta != null ? Number(optConf.net_delta) : null;
  const edgeDelta = optEdge.net_delta != null ? Number(optEdge.net_delta) : null;
  const confKept = optConf.kept != null ? Number(optConf.kept) : null;
  const edgeKept = optEdge.kept != null ? Number(optEdge.kept) : null;

  return (
    <>
      {/* Optimal Thresholds — key-value rows */}
      <div>
        <h2 className="text-[22px] font-semibold text-white">Optimal thresholds</h2>
        <p className="text-[13px] text-white/70 mt-1">{tradeCount} trades analyzed</p>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div style={{ minWidth: "400px" }}>
            <div className="grid items-center pb-4 text-[14px] font-bold text-white"
              style={{ gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr" }}>
              <span>Parameter</span>
              <span className="text-right">Threshold<InfoTip text="The minimum confidence/edge value — trades below this would be filtered" /></span>
              <span className="text-right">Net Delta<InfoTip text="P&L improvement vs having no filter. Positive = filtering saves money" /></span>
              <span className="text-right">Trades Kept<InfoTip text="How many trades pass this threshold — the ones you'd still execute" /></span>
            </div>
            <div className="h-[1.5px] bg-white/[0.2]" />
            <div className="grid items-center py-4 text-[14px]"
              style={{ gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr" }}>
              <span className="text-white">Confidence</span>
              <span className="text-white font-medium tabular-nums text-right">{confThresh != null ? `${(confThresh * 100).toFixed(0)}%` : "—"}</span>
              <span className={`font-medium tabular-nums text-right ${confDelta != null ? pnlColor(confDelta) : "text-white"}`}>{confDelta != null ? fmtDelta(confDelta) : "—"}</span>
              <span className="text-white/70 tabular-nums text-right">{confKept != null ? `${confKept} (${tradeCount > 0 ? Math.round((confKept / tradeCount) * 100) : 0}%)` : "—"}</span>
            </div>
            <div className="h-[1px] bg-white/[0.12]" />
            <div className="grid items-center py-4 text-[14px]"
              style={{ gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr" }}>
              <span className="text-white">Edge</span>
              <span className="text-white font-medium tabular-nums text-right">{edgeThresh != null ? `${(edgeThresh * 100).toFixed(0)}%` : "—"}</span>
              <span className={`font-medium tabular-nums text-right ${edgeDelta != null ? pnlColor(edgeDelta) : "text-white"}`}>{edgeDelta != null ? fmtDelta(edgeDelta) : "—"}</span>
              <span className="text-white/70 tabular-nums text-right">{edgeKept != null ? `${edgeKept} (${tradeCount > 0 ? Math.round((edgeKept / tradeCount) * 100) : 0}%)` : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Sweep Chart */}
      {confSweep.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Confidence sweep</h2>
          <p className="text-[13px] text-white/70 mt-1">Net P&L delta at each confidence threshold</p>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <SweepChart
              data={confSweep}
              gradientId="confGrad"
              optimalThreshold={confThresh}
              optimalDelta={confDelta}
            />
          </div>
        </div>
      )}

      {/* Edge Sweep Chart */}
      {edgeSweep.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Edge sweep</h2>
          <p className="text-[13px] text-white/70 mt-1">Net P&L delta at each edge threshold</p>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <SweepChart
              data={edgeSweep}
              gradientId="edgeGrad"
              optimalThreshold={edgeThresh}
              optimalDelta={edgeDelta}
            />
          </div>
        </div>
      )}

      {/* Category P&L */}
      {Object.keys(catStats).length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Category P&L</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div style={{ minWidth: "400px" }}>
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.6fr 0.6fr 0.8fr" }}>
                <span>Category</span>
                <span className="text-right">Trades</span>
                <span className="text-right">Wins</span>
                <span className="text-right">P&L</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />
              {Object.entries(catStats)
                .sort(([, a]: [string, any], [, b]: [string, any]) => Number(b.pnl ?? 0) - Number(a.pnl ?? 0))
                .map(([cat, stats]: [string, any], i: number, arr: [string, any][]) => {
                  const catPnl = Number(stats.pnl ?? 0);
                  return (
                    <div key={cat}>
                      <Link href={`/memory/category/${slugify(cat)}`}
                        className="grid items-center py-4 text-[14px] hover:bg-white/[0.02] transition-colors"
                        style={{ gridTemplateColumns: "2fr 0.6fr 0.6fr 0.8fr" }}>
                        <span className="text-white capitalize">{cat.replace(/_/g, " ")}</span>
                        <span className="text-white/70 tabular-nums text-right">{Number(stats.n ?? 0)}</span>
                        <span className="text-white/70 tabular-nums text-right">{Number(stats.wins ?? 0)}</span>
                        <span className={`font-medium tabular-nums text-right ${catPnl > 0 ? "text-[#00C807]" : catPnl < 0 ? "text-[#FF6B8A]" : "text-white/40"}`}>
                          {catPnl !== 0 ? `${catPnl >= 0 ? "+" : ""}${formatCurrency(catPnl)}` : "—"}
                        </span>
                      </Link>
                      {i < arr.length - 1 && <div className="h-[1px] bg-white/[0.12]" />}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  SWEEP CHART                                                     */
/* ════════════════════════════════════════════════════════════════ */

function SweepChart({ data, gradientId, optimalThreshold, optimalDelta }: {
  data: any[]; gradientId: string; optimalThreshold: number | null; optimalDelta: number | null;
}) {
  const chartData = data.map((d: any) => ({
    threshold: Number(d.threshold),
    thresholdLabel: `${(Number(d.threshold) * 100).toFixed(0)}%`,
    net_delta: Number(d.net_delta ?? 0),
    kept: Number(d.kept ?? 0),
    win_rate: d.win_rate != null ? Number(d.win_rate) : null,
  }));

  const maxDelta = Math.max(...chartData.map(d => d.net_delta));
  const isPositive = maxDelta >= 0;
  const color = isPositive ? "#00C807" : "#FF6B8A";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: -5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="thresholdLabel" axisLine={false} tickLine={false}
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }} interval="preserveStartEnd" minTickGap={40} />
        <YAxis axisLine={false} tickLine={false}
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }} width={50}
          tickFormatter={(v: number) => `$${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(0)}`} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null;
          const d = payload[0].payload;
          return (
            <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg">
              <div className="text-[11px] text-white/70 mb-0.5">Threshold: {d.thresholdLabel}</div>
              <div className={`text-[13px] font-semibold tabular-nums ${d.net_delta >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                {fmtDelta(d.net_delta)}
              </div>
              <div className="text-[11px] text-white/70 mt-0.5">{d.kept} trades kept</div>
              {d.win_rate != null && (
                <div className="text-[11px] text-white/70">{(d.win_rate * 100).toFixed(0)}% win rate</div>
              )}
            </div>
          );
        }} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="net_delta" stroke={color} strokeWidth={1.5}
          fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 3, fill: color, strokeWidth: 0 }} />
        {optimalThreshold != null && optimalDelta != null && (
          <ReferenceDot
            x={`${(optimalThreshold * 100).toFixed(0)}%`}
            y={optimalDelta}
            r={5}
            fill="white"
            stroke="white"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
