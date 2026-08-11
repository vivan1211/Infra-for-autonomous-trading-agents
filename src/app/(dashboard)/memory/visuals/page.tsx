"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useWikiAggregates } from "@/hooks/use-wiki";
import { pnlColor } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  CartesianGrid,
} from "recharts";

/* ================================================================ */
/*  HELPERS                                                          */
/* ================================================================ */

// Recharts needs raw color values for fill/stroke props.
// These match the design tokens in tailwind.config.ts.
const CHART_COLORS = {
  gain: '#00C807',
  loss: '#FF6B8A',
  warning: '#FFC107',
  orange: '#FB923C',
  amber: '#FBBF24',
  blue: '#60a5fa',
  muted: '#6B6B6B',
} as const;

function fmtPnl(v: any): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  return n >= 0 ? `+$${Math.abs(n).toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(v: any, mult = true): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  return `${(mult ? n * 100 : n).toFixed(1)}%`;
}

function fmtNum(v: any, d = 3): string {
  if (v == null) return "\u2014";
  return Number(v).toFixed(d);
}

function pnlVal(v: any): number {
  return Number(v ?? 0);
}

function colorForPnl(v: number): string {
  return v >= 0 ? CHART_COLORS.gain : CHART_COLORS.loss;
}

function severityBadge(severity: string) {
  const s = (severity ?? "").toLowerCase();
  const colors: Record<string, string> = {
    critical: "bg-loss/20 text-loss",
    high: "bg-orange-400/20 text-orange-400",
    moderate: "bg-amber-400/20 text-amber-400",
    medium: "bg-amber-400/20 text-amber-400",
    low: "bg-white/[0.06] text-white/70",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${colors[s] ?? colors.low}`}>
      {severity}
    </span>
  );
}

function DarkTooltip({ active, payload, labelKey, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color ?? p.fill ?? CHART_COLORS.gain }} />
          <span className="text-white/60">{p.payload?.[labelKey] ?? p.name ?? ""}</span>
          <span className="text-white font-medium ml-auto tabular-nums">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const AXIS_STYLE = { fontSize: 11, fill: CHART_COLORS.muted };

/* ================================================================ */
/*  CARD / SECTION PRIMITIVES                                        */
/* ================================================================ */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub, valueClass = "text-white" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card>
      <p className="text-[13px] text-white/60 mb-1">{label}</p>
      <p className={`text-[28px] font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-[12px] text-white/40 mt-1">{sub}</p>}
    </Card>
  );
}

function SectionDivider() {
  return <div className="border-t border-border" />;
}

/* ================================================================ */
/*  MAIN PAGE                                                        */
/* ================================================================ */

export default function VisualsPage() {
  const { aggregates, loading, error } = useWikiAggregates();

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-surface rounded-xl h-[400px]" />
        ))}
      </div>
    );
  }

  if (error || !aggregates) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "No aggregate data yet"}</p>;
  }

  const snap: any = aggregates?.data_snapshot ?? {};
  const agg: any = { ...snap, trade_count: aggregates?.trade_count, last_trade_at: aggregates?.last_trade_at };

  return (
    <div className="space-y-12">
      <Section1_MakingMoney agg={agg} />
      <SectionDivider />
      <Section2_WhatToDo agg={agg} />
      <SectionDivider />
      <Section3_WhichBot agg={agg} />
      <SectionDivider />
      <Section4_EdgeSignal agg={agg} />
      <SectionDivider />
      <Section5_Categories agg={agg} />
      <SectionDivider />
      <Section6_YesNo agg={agg} />
      <SectionDivider />
      <Section7_Trend agg={agg} />
      <SectionDivider />
      <Section8_Calibration agg={agg} />
      <SectionDivider />
      <Section9_Signals agg={agg} />
      <SectionDivider />
      <Section10_RiskGate agg={agg} />
      <SectionDivider />
      <Section11_LeftOnTable agg={agg} />
      <SectionDivider />
      <Section12_PlaceEverything agg={agg} />
    </div>
  );
}

/* ================================================================ */
/*  S1 - AM I MAKING MONEY?                                          */
/* ================================================================ */

function Section1_MakingMoney({ agg }: { agg: any }) {
  const o = agg.overall ?? {};
  const realPnl = pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);
  const winRate = o.win_rate != null ? Number(o.win_rate) : null;
  const brier = agg.calibration?.brier_score ?? o.brier_score ?? null;
  const maxDd = o.max_drawdown ?? null;
  const sharpe = o.sharpe ?? o.sharpe_ratio ?? null;
  const confEdgeGap = o.conf_edge_gap ?? agg.conf_edge_inversion?.avg_gap ?? null;
  const settled = Number(o.settled ?? o.settled_count ?? 0);
  const winLo = o.win_rate_ci_lo ?? o.ci_lower ?? null;
  const winHi = o.win_rate_ci_hi ?? o.ci_upper ?? null;

  // Pipeline funnel
  const totalSignals = Number(o.total_signals ?? o.signal_count ?? agg.bimodality?.total_signals ?? 0);
  const reachedResearch = Number(o.reached_research ?? agg.bimodality?.reached_research ?? 0);
  const placed = Number(o.placed ?? o.placed_count ?? 0);

  // Benchmark: counterfactual (place everything)
  const cf = agg.counterfactual ?? {};
  const cfWinRate = cf.overall_cf_win_rate ?? cf.cf_win_rate ?? null;
  const cfPnl = pnlVal(cf.overall_cf_pnl ?? cf.cf_pnl ?? 0);
  const filterSavings = realPnl - cfPnl;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;1 Am I Making Money?</h2>

      {/* 3x2 metric grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Realized PnL"
          value={fmtPnl(realPnl)}
          sub={`on ${settled} settled`}
          valueClass={pnlColor(realPnl)}
        />
        <MetricCard
          label="Win Rate"
          value={winRate != null ? fmtPct(winRate) : "\u2014"}
          sub={winLo != null && winHi != null ? `[${fmtPct(winLo)}\u2013${fmtPct(winHi)}] n=${settled}` : `n=${settled}`}
        />
        <MetricCard
          label="Brier Score"
          value={brier != null ? fmtNum(brier) : "\u2014"}
          sub="baseline: 0.250"
        />
        <MetricCard
          label="Max Drawdown"
          value={maxDd != null ? (typeof maxDd === "number" && maxDd < 1 ? fmtPct(maxDd) : fmtPnl(maxDd)) : "\u2014"}
          valueClass="text-loss"
        />
        <MetricCard
          label="Sharpe Ratio"
          value={sharpe != null ? `${Number(sharpe) >= 0 ? "+" : ""}${Number(sharpe).toFixed(2)}` : "\u2014"}
        />
        <MetricCard
          label="Conf-Edge Gap"
          value={confEdgeGap != null ? `+${Number(confEdgeGap).toFixed(3)}` : "\u2014"}
          sub="threshold: 0.30"
        />
      </div>

      {/* Win Rate Gauge */}
      {winRate != null && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Win Rate Gauge</p>
          <WinRateGauge rate={winRate} lo={winLo} hi={winHi} />
        </Card>
      )}

      {/* Benchmark Comparison */}
      <Card className="mb-6">
        <p className="text-[13px] text-white/60 mb-4">Benchmark Comparison</p>
        <BenchmarkBars
          fleetWin={winRate}
          cfWin={cfWinRate}
          fleetPnl={realPnl}
          cfPnl={cfPnl}
          filterSavings={filterSavings}
          brier={brier}
        />
      </Card>

      {/* Pipeline Funnel */}
      {totalSignals > 0 && (
        <Card>
          <p className="text-[13px] text-white/60 mb-3">Pipeline Funnel</p>
          <PipelineFunnel
            signals={totalSignals}
            research={reachedResearch}
            placed={placed}
            settled={settled}
            pnl={realPnl}
          />
        </Card>
      )}
    </div>
  );
}

function WinRateGauge({ rate, lo, hi }: { rate: number; lo: any; hi: any }) {
  const pct = (v: number) => Math.max(0, Math.min(100, v * 100));
  const pos = pct(rate);
  const loP = lo != null ? pct(Number(lo)) : null;
  const hiP = hi != null ? pct(Number(hi)) : null;

  return (
    <div className="relative h-10">
      {/* Track */}
      <div className="absolute top-4 left-0 right-0 h-2 bg-surface rounded-full" />
      {/* CI Band */}
      {loP != null && hiP != null && (
        <div
          className="absolute top-4 h-2 bg-gain/20 rounded-full"
          style={{ left: `${loP}%`, width: `${hiP - loP}%` }}
        />
      )}
      {/* Dot */}
      <div
        className="absolute top-2.5 w-4 h-4 rounded-full bg-gain border-2 border-black shadow-lg"
        style={{ left: `calc(${pos}% - 8px)` }}
      />
      {/* Labels */}
      <div className="absolute top-8 left-0 text-[10px] text-white/40">0%</div>
      <div className="absolute top-8 left-1/4 -translate-x-1/2 text-[10px] text-white/40">25%</div>
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] text-white/40">50%</div>
      <div className="absolute top-8 left-3/4 -translate-x-1/2 text-[10px] text-white/40">75%</div>
      <div className="absolute top-8 right-0 text-[10px] text-white/40">100%</div>
      {/* Value label */}
      <div className="absolute -top-1 text-[13px] font-semibold text-white" style={{ left: `calc(${pos}% - 14px)` }}>
        {fmtPct(rate)}
      </div>
      {loP != null && hiP != null && (
        <div className="absolute top-8 text-[10px] text-white/50" style={{ left: `calc(${(loP + hiP) / 2}% - 30px)` }}>
          [{fmtPct(Number(lo))}&ndash;{fmtPct(Number(hi))}] 95% CI
        </div>
      )}
    </div>
  );
}

function BenchmarkBars({ fleetWin, cfWin, fleetPnl, cfPnl, filterSavings, brier }: any) {
  const winData = [
    { name: "Fleet actual", value: fleetWin != null ? Number(fleetWin) * 100 : 0 },
    { name: "Place everything", value: cfWin != null ? Number(cfWin) * 100 : 0 },
    { name: "Random coin flip", value: 50 },
  ];
  const pnlData = [
    { name: "Fleet actual", value: Number(fleetPnl) },
    { name: "Place everything", value: Number(cfPnl) },
    { name: "Random coin flip", value: 0 },
  ];
  const brierImprovement = brier != null ? ((0.25 - Number(brier)) / 0.25 * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
      {/* Win Rate bars */}
      <div>
        <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">Win Rate</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={winData} layout="vertical" margin={{ left: 120, right: 40 }}>
            <XAxis type="number" domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={(v: number) => `${v.toFixed(1)}%`} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {winData.map((_, i) => (
                <Cell key={i} fill={i === 0 ? CHART_COLORS.gain : i === 1 ? CHART_COLORS.orange : CHART_COLORS.muted} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* PnL bars */}
      <div>
        <p className="text-[12px] text-white/50 mb-2 uppercase tracking-wide">PnL</p>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={pnlData} layout="vertical" margin={{ left: 120, right: 40 }}>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {pnlData.map((d, i) => (
                <Cell key={i} fill={d.value >= 0 ? CHART_COLORS.gain : CHART_COLORS.loss} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary text */}
      <div className="flex flex-wrap gap-4 text-[13px] text-white/70">
        {filterSavings !== 0 && (
          <span>Your filter <span className="text-gain font-medium">SAVES you {fmtPnl(filterSavings)}</span> in avoided losses</span>
        )}
        {brierImprovement != null && (
          <span>Brier {fmtNum(brier)} = <span className="text-gain font-medium">{brierImprovement}% better</span> than random (0.250)</span>
        )}
      </div>
    </div>
  );
}

function PipelineFunnel({ signals, research, placed, settled, pnl }: any) {
  const steps = [
    { label: "signals", n: signals },
    { label: "reached research", n: research },
    { label: "placed", n: placed },
    { label: "settled", n: settled },
    { label: "PnL", n: null, pnl },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap text-[14px]">
      {steps.map((step, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-white/30">&rarr;</span>}
          <span className="text-white font-semibold tabular-nums">
            {step.pnl != null ? fmtPnl(step.pnl) : step.n}
          </span>
          <span className="text-white/50">{step.label}</span>
          {step.n != null && signals > 0 && (
            <span className="text-white/30 text-[12px]">({(step.n / signals * 100).toFixed(0)}%)</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ================================================================ */
/*  S2 - WHAT SHOULD I DO RIGHT NOW?                                 */
/* ================================================================ */

function Section2_WhatToDo({ agg }: { agg: any }) {
  const recs: any[] = Array.isArray(agg.recommendations) ? agg.recommendations : [];
  if (recs.length === 0) return null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;2 What Should I Do Right Now?</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 text-white/50 font-medium">#</th>
              <th className="text-left py-2 pr-3 text-white/50 font-medium">Severity</th>
              <th className="text-left py-2 pr-3 text-white/50 font-medium">Action</th>
              <th className="text-left py-2 pr-3 text-white/50 font-medium">What</th>
              <th className="text-left py-2 text-white/50 font-medium">See</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r: any, i: number) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="py-3 pr-3 text-white/40 tabular-nums">{i + 1}</td>
                <td className="py-3 pr-3">{severityBadge(r.severity ?? "low")}</td>
                <td className="py-3 pr-3 text-white font-medium uppercase text-[12px] tracking-wide">{r.action ?? r.type ?? "\u2014"}</td>
                <td className="py-3 pr-3 text-white/80">{r.what ?? r.description ?? r.message ?? "\u2014"}</td>
                <td className="py-3 text-white/40">{r.see ?? r.section ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  S3 - WHICH BOT WORKS?                                            */
/* ================================================================ */

function Section3_WhichBot({ agg }: { agg: any }) {
  const perBot: any[] = Array.isArray(agg.per_bot) ? agg.per_bot : [];
  const weeklyPerBot: any = agg.weekly_per_bot ?? {};
  const skipReasons: any = agg.skip_reasons ?? {};
  const perAgent: any[] = Array.isArray(agg.per_agent) ? agg.per_agent : [];
  if (perBot.length === 0) return null;

  // PnL bar chart data
  const pnlData = perBot.map((b: any) => ({
    name: b.bot_name ?? b.bot_type_id ?? "unknown",
    value: pnlVal(b.real_pnl ?? b.pnl ?? b.total_pnl),
  }));

  // Weekly PnL table
  const weeks: string[] = weeklyPerBot.weeks ?? [];
  const bots: string[] = weeklyPerBot.bots ?? [];
  const rows: any[] = weeklyPerBot.rows ?? [];

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;3 Which Bot Works?</h2>

      {/* Summary table */}
      <Card className="mb-6 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 text-white/50 font-medium">Bot</th>
              <th className="text-right py-2 pr-4 text-white/50 font-medium">Trades</th>
              <th className="text-right py-2 pr-4 text-white/50 font-medium">Placed</th>
              <th className="text-right py-2 pr-4 text-white/50 font-medium">Settled</th>
              <th className="text-right py-2 pr-4 text-white/50 font-medium">Win Rate</th>
              <th className="text-right py-2 pr-4 text-white/50 font-medium">Real PnL</th>
              <th className="text-right py-2 text-white/50 font-medium">CF PnL</th>
            </tr>
          </thead>
          <tbody>
            {perBot.map((b: any, i: number) => {
              const botPnl = pnlVal(b.real_pnl ?? b.pnl ?? b.total_pnl);
              const cfP = pnlVal(b.cf_pnl ?? 0);
              const wr = b.win_rate;
              const ci = b.win_rate_ci_lo != null ? `[${fmtPct(b.win_rate_ci_lo)}\u2013${fmtPct(b.win_rate_ci_hi)}]` : "";
              return (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="py-3 pr-4 text-white font-medium">{b.bot_name ?? b.bot_type_id ?? "\u2014"}</td>
                  <td className="py-3 pr-4 text-white/70 text-right tabular-nums">{b.trades ?? b.trade_count ?? "\u2014"}</td>
                  <td className="py-3 pr-4 text-white/70 text-right tabular-nums">{b.placed ?? b.placed_count ?? "\u2014"}</td>
                  <td className="py-3 pr-4 text-white/70 text-right tabular-nums">{b.settled ?? b.settled_count ?? "\u2014"}</td>
                  <td className="py-3 pr-4 text-white text-right tabular-nums">
                    {wr != null ? fmtPct(wr) : "\u2014"} <span className="text-white/40 text-[11px]">{ci}</span>
                  </td>
                  <td className={`py-3 pr-4 text-right tabular-nums font-medium ${pnlColor(botPnl)}`}>{fmtPnl(botPnl)}</td>
                  <td className={`py-3 text-right tabular-nums font-medium ${pnlColor(cfP)}`}>{fmtPnl(cfP)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* PnL bar chart */}
      <Card className="mb-6">
        <p className="text-[13px] text-white/60 mb-3">Real PnL by Bot</p>
        <ResponsiveContainer width="100%" height={Math.max(100, pnlData.length * 40 + 20)}>
          <BarChart data={pnlData} layout="vertical" margin={{ left: 120, right: 40 }}>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {pnlData.map((d, i) => (
                <Cell key={i} fill={colorForPnl(d.value)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Weekly PnL table */}
      {weeks.length > 0 && bots.length > 0 && (
        <Card className="mb-6 overflow-x-auto">
          <p className="text-[13px] text-white/60 mb-3">Weekly PnL by Bot</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-white/50 font-medium">Week</th>
                {bots.map((bot: string) => (
                  <th key={bot} className="text-right py-2 pr-4 text-white/50 font-medium">{bot}</th>
                ))}
                <th className="text-right py-2 text-white/50 font-medium">Fleet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, i: number) => {
                const fleet = bots.reduce((s: number, bot: string) => s + pnlVal(row[bot]), 0);
                return (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-3 pr-4 text-white/70">{row.week ?? weeks[i] ?? `W${i}`}</td>
                    {bots.map((bot: string) => {
                      const v = pnlVal(row[bot]);
                      return (
                        <td key={bot} className={`py-3 pr-4 text-right tabular-nums font-medium ${pnlColor(v)}`}>{fmtPnl(v)}</td>
                      );
                    })}
                    <td className={`py-3 text-right tabular-nums font-medium ${pnlColor(fleet)}`}>{fmtPnl(fleet)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Skip profiles per bot */}
      {Object.keys(skipReasons).length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-4">Skip Profiles by Bot</p>
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(skipReasons).map(([bot, reasons]: [string, any]) => {
              const items: { reason: string; count: number }[] = Array.isArray(reasons)
                ? reasons
                : Object.entries(reasons ?? {}).map(([r, c]) => ({ reason: r, count: Number(c) }));
              const total = items.reduce((s, x) => s + x.count, 0);
              return (
                <div key={bot}>
                  <p className="text-[12px] text-white/50 mb-2 font-medium">{bot}</p>
                  {items.sort((a, b) => b.count - a.count).map((item, i) => {
                    const pctW = total > 0 ? (item.count / total * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 mb-1.5">
                        <span className="text-[12px] text-white/60 w-40 truncate">{item.reason}</span>
                        <div className="flex-1 h-3 bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-white/[0.15] rounded-full" style={{ width: `${pctW}%` }} />
                        </div>
                        <span className="text-[11px] text-white/50 tabular-nums w-12 text-right">{pctW.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Agent calibration (best/worst Brier) */}
      {perAgent.length > 0 && (
        <Card>
          <p className="text-[13px] text-white/60 mb-3">Agent Calibration (Brier &mdash; lower is better)</p>
          <div className="space-y-2">
            {perAgent
              .filter((a: any) => a.brier_score != null)
              .sort((a: any, b: any) => Number(a.brier_score) - Number(b.brier_score))
              .map((agent: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-[13px]">
                  <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-gain" : i === perAgent.length - 1 ? "bg-loss" : "bg-white/20"}`} />
                  <span className="text-white/70 w-48 truncate">{agent.agent_name ?? agent.name ?? "agent"}</span>
                  <span className="text-white font-medium tabular-nums">{fmtNum(agent.brier_score)}</span>
                  {i === 0 && <span className="text-[11px] text-gain">best</span>}
                  {i === perAgent.filter((a: any) => a.brier_score != null).length - 1 && i > 0 && (
                    <span className="text-[11px] text-loss">worst</span>
                  )}
                </div>
              ))}
            <p className="text-[11px] text-white/40 mt-2">random baseline = 0.250</p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S4 - DOES MY EDGE SIGNAL WORK?                                   */
/* ================================================================ */

function Section4_EdgeSignal({ agg }: { agg: any }) {
  const buckets: any[] = agg.hit_rate_by_signed_edge ?? agg.conf_edge_inversion?.by_bucket ?? [];
  const corr = agg.correlations ?? {};
  const pearsonR = corr.signed_edge_r ?? corr.pearson_r ?? agg.conf_edge_inversion?.pearson_r ?? null;
  const confEdgeGap = agg.overall?.conf_edge_gap ?? agg.conf_edge_inversion?.avg_gap ?? null;

  if (!Array.isArray(buckets) || buckets.length === 0) return null;

  const winData = buckets.map((b: any) => ({
    name: b.bucket ?? b.label ?? b.range ?? "",
    winRate: b.win_rate != null ? Number(b.win_rate) * 100 : 0,
    n: b.n ?? b.count ?? 0,
  }));

  const pnlData = buckets.map((b: any) => ({
    name: b.bucket ?? b.label ?? b.range ?? "",
    pnl: pnlVal(b.pnl ?? b.real_pnl ?? 0),
    winRate: b.win_rate != null ? Number(b.win_rate) * 100 : 0,
    n: b.n ?? b.count ?? 0,
  }));

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;4 Does My Edge Signal Work?</h2>

      {/* Win Rate by bucket */}
      <Card className="mb-6">
        <p className="text-[13px] text-white/60 mb-3">Win Rate by Signed-Edge Bucket</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={winData} margin={{ left: 10, right: 30, top: 10, bottom: 5 }}>
            <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={(v: number) => `${v.toFixed(1)}%`} />} />
            <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {winData.map((d, i) => (
                <Cell key={i} fill={d.winRate >= 50 ? CHART_COLORS.gain : CHART_COLORS.loss} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* PnL by bucket */}
      <Card className="mb-6">
        <p className="text-[13px] text-white/60 mb-3">PnL by Signed-Edge Bucket</p>
        <ResponsiveContainer width="100%" height={Math.max(160, pnlData.length * 36 + 20)}>
          <BarChart data={pnlData} layout="vertical" margin={{ left: 110, right: 40 }}>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={100} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {pnlData.map((d, i) => (
                <Cell key={i} fill={colorForPnl(d.pnl)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Pearson callout */}
      <div className="grid grid-cols-2 gap-4">
        {pearsonR != null && (
          <Card>
            <p className="text-[13px] text-white/60 mb-1">Pearson r(signed_edge, real_won)</p>
            <p className={`text-[28px] font-bold tabular-nums ${Number(pearsonR) < 0 ? "text-loss" : "text-gain"}`}>
              {Number(pearsonR).toFixed(3)}
            </p>
            {Number(pearsonR) < -0.3 && <p className="text-[12px] text-loss mt-1">ANTI-PREDICTIVE</p>}
          </Card>
        )}
        {confEdgeGap != null && (
          <Card>
            <p className="text-[13px] text-white/60 mb-1">Conf-Edge Gap at Placement</p>
            <p className="text-[28px] font-bold tabular-nums text-white">+{Number(confEdgeGap).toFixed(3)}</p>
            <p className="text-[12px] text-white/40 mt-1">threshold: 0.30</p>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ================================================================ */
/*  S5 - WHICH CATEGORIES MAKE MONEY?                                */
/* ================================================================ */

function Section5_Categories({ agg }: { agg: any }) {
  const cats: any[] = Array.isArray(agg.categories) ? agg.categories : [];
  if (cats.length === 0) return null;

  const sorted = [...cats].sort((a, b) => pnlVal(a.pnl ?? a.real_pnl) - pnlVal(b.pnl ?? b.real_pnl));
  const chartData = sorted.map((c: any) => ({
    name: c.category ?? c.name ?? "unknown",
    pnl: pnlVal(c.pnl ?? c.real_pnl),
    winRate: c.win_rate != null ? Number(c.win_rate) * 100 : null,
    n: c.n ?? c.trades ?? c.count ?? 0,
  }));

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;5 Which Categories Make Money?</h2>
      <Card>
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 36 + 20)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 60 }}>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={70} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
                    <p className="text-white font-medium">{d.name}</p>
                    <p className="text-white/60">n={d.n} &middot; {d.winRate != null ? `${d.winRate.toFixed(0)}% win` : ""}</p>
                    <p className={d.pnl >= 0 ? "text-gain" : "text-loss"}>{fmtPnl(d.pnl)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={colorForPnl(d.pnl)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Win rate labels */}
        <div className="mt-4 flex flex-wrap gap-3 text-[12px]">
          {chartData.map((d, i) => (
            <span key={i} className="text-white/50">
              {d.name}: <span className={d.pnl >= 0 ? "text-gain" : "text-loss"}>{fmtPnl(d.pnl)}</span>
              {d.winRate != null && <span className="text-white/40 ml-1">({d.winRate.toFixed(0)}% win, n={d.n})</span>}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  S6 - YES OR NO - WHICH SIDE WINS?                                */
/* ================================================================ */

function Section6_YesNo({ agg }: { agg: any }) {
  const sides: any = agg.sides ?? {};
  const yes = sides.YES ?? sides.yes ?? {};
  const no = sides.NO ?? sides.no ?? {};
  if (!yes.placed && !no.placed && !yes.settled && !no.settled) return null;

  const yPnl = pnlVal(yes.pnl ?? yes.real_pnl);
  const nPnl = pnlVal(no.pnl ?? no.real_pnl);
  const yWin = yes.win_rate != null ? Number(yes.win_rate) * 100 : null;
  const nWin = no.win_rate != null ? Number(no.win_rate) * 100 : null;
  const totalPnl = yPnl + nPnl;
  const noShare = totalPnl !== 0 ? (nPnl / totalPnl * 100).toFixed(0) : "\u2014";

  const pnlBars = [
    { name: "NO", value: nPnl, winLabel: nWin != null ? `${nWin.toFixed(1)}% win` : "" },
    { name: "YES", value: yPnl, winLabel: yWin != null ? `${yWin.toFixed(1)}% win` : "" },
  ];
  const winBars = [
    { name: "NO", value: nWin ?? 0 },
    { name: "YES", value: yWin ?? 0 },
  ];

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;6 YES or NO &mdash; Which Side Wins?</h2>

      {/* Side cards */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card>
          <p className="text-[15px] font-semibold text-white mb-4">NO SIDE</p>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-white/60">Placed</span><span className="text-white tabular-nums">{no.placed ?? no.placed_count ?? "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Settled</span><span className="text-white tabular-nums">{no.settled ?? no.settled_count ?? "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Win Rate</span><span className="text-white tabular-nums">{nWin != null ? `${nWin.toFixed(1)}%` : "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Real PnL</span><span className={`tabular-nums font-medium ${pnlColor(nPnl)}`}>{fmtPnl(nPnl)}</span></div>
          </div>
        </Card>
        <Card>
          <p className="text-[15px] font-semibold text-white mb-4">YES SIDE</p>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-white/60">Placed</span><span className="text-white tabular-nums">{yes.placed ?? yes.placed_count ?? "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Settled</span><span className="text-white tabular-nums">{yes.settled ?? yes.settled_count ?? "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Win Rate</span><span className="text-white tabular-nums">{yWin != null ? `${yWin.toFixed(1)}%` : "\u2014"}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Real PnL</span><span className={`tabular-nums font-medium ${pnlColor(yPnl)}`}>{fmtPnl(yPnl)}</span></div>
          </div>
        </Card>
      </div>

      {/* PnL comparison bar */}
      <Card className="mb-6">
        <p className="text-[13px] text-white/60 mb-3">PnL Comparison</p>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={pnlBars} layout="vertical" margin={{ left: 50, right: 40 }}>
            <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={40} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {pnlBars.map((d, i) => (
                <Cell key={i} fill={colorForPnl(d.value)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {totalPnl !== 0 && (
          <p className="text-[12px] text-white/50 mt-2">NO side carries {noShare}% of total alpha ({fmtPnl(nPnl)} of {fmtPnl(totalPnl)})</p>
        )}
      </Card>

      {/* Win Rate comparison */}
      <Card>
        <p className="text-[13px] text-white/60 mb-3">Win Rate Comparison</p>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={winBars} layout="vertical" margin={{ left: 50, right: 40 }}>
            <XAxis type="number" domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={(v: number) => `${v.toFixed(1)}%`} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} fill={CHART_COLORS.gain} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
        {nWin != null && yWin != null && (
          <p className="text-[12px] text-white/50 mt-2">Spread: {(nWin - yWin).toFixed(1)} percentage points</p>
        )}
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  S7 - AM I GETTING BETTER OR WORSE?                               */
/* ================================================================ */

function Section7_Trend({ agg }: { agg: any }) {
  const weeklyPerBot: any = agg.weekly_per_bot ?? {};
  const rollingWindow: any = agg.rolling_window ?? {};
  const windows: any[] = Array.isArray(rollingWindow.windows) ? rollingWindow.windows : [];
  const slopes: any = rollingWindow.slopes ?? {};

  const weeks: string[] = weeklyPerBot.weeks ?? [];
  const bots: string[] = weeklyPerBot.bots ?? [];
  const rows: any[] = weeklyPerBot.rows ?? [];

  // Fleet weekly PnL
  const fleetWeeklyPnl = rows.map((row: any, i: number) => {
    const fleet = bots.reduce((s: number, bot: string) => s + pnlVal(row[bot]), 0);
    return { name: row.week ?? weeks[i] ?? `W${i}`, pnl: fleet, placed: row.placed ?? 0 };
  });

  // Fleet weekly win rate
  const fleetWeeklyWinRate = rows.map((row: any, i: number) => ({
    name: row.week ?? weeks[i] ?? `W${i}`,
    winRate: row.fleet_win_rate != null ? Number(row.fleet_win_rate) * 100 : null,
  })).filter((d) => d.winRate != null);

  // Per-bot weekly PnL for line chart
  const perBotWeeklyLine = rows.map((row: any, i: number) => {
    const point: any = { name: row.week ?? weeks[i] ?? `W${i}` };
    bots.forEach((bot: string) => { point[bot] = pnlVal(row[bot]); });
    return point;
  });

  const BOT_COLORS = [CHART_COLORS.gain, CHART_COLORS.orange, CHART_COLORS.blue, CHART_COLORS.amber, "#a78bfa", "#f472b6"];

  // Rolling 7-day PnL
  const rollingData = windows.map((w: any) => ({
    name: w.window_end ?? w.date ?? "",
    pnl: pnlVal(w.pnl ?? w.rolling_pnl),
  }));

  const hasContent = fleetWeeklyPnl.length > 0 || rollingData.length > 0;
  if (!hasContent) return null;

  const winRateSlope = slopes.win_rate_slope ?? null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;7 Am I Getting Better or Worse?</h2>

      {/* Fleet weekly PnL bar */}
      {fleetWeeklyPnl.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Fleet PnL by Week</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fleetWeeklyPnl} margin={{ left: 10, right: 30, top: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `$${v}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {fleetWeeklyPnl.map((d, i) => (
                  <Cell key={i} fill={colorForPnl(d.pnl)} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Fleet weekly win rate bar */}
      {fleetWeeklyWinRate.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Fleet Win Rate by Week</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={fleetWeeklyWinRate} margin={{ left: 10, right: 30, top: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={(v: number) => `${v.toFixed(1)}%`} />} />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={28} fill={CHART_COLORS.gain} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Per-bot weekly PnL line chart */}
      {bots.length > 0 && perBotWeeklyLine.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Per-Bot Weekly PnL</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={perBotWeeklyLine} margin={{ left: 10, right: 30, top: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `$${v}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
                      <p className="text-white/50 mb-1">{label}</p>
                      {payload.map((p: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke }} />
                          <span className="text-white/60">{p.name}</span>
                          <span className={`font-medium tabular-nums ml-auto ${Number(p.value) >= 0 ? "text-gain" : "text-loss"}`}>{fmtPnl(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {bots.map((bot: string, i: number) => (
                <Line
                  key={bot}
                  type="monotone"
                  dataKey={bot}
                  stroke={BOT_COLORS[i % BOT_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BOT_COLORS[i % BOT_COLORS.length], strokeWidth: 0 }}
                  name={bot}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            {bots.map((bot: string, i: number) => (
              <span key={bot} className="flex items-center gap-1.5 text-[12px] text-white/60">
                <span className="w-2.5 h-[3px] rounded-full" style={{ backgroundColor: BOT_COLORS[i % BOT_COLORS.length] }} />
                {bot}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Rolling 7-day PnL */}
      {rollingData.length > 0 && (
        <Card>
          <p className="text-[13px] text-white/60 mb-3">Rolling 7-Day PnL</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rollingData} margin={{ left: 10, right: 30, top: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `$${v}`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
              <Line type="monotone" dataKey="pnl" stroke={CHART_COLORS.gain} strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS.gain, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
          {winRateSlope != null && (
            <p className="text-[12px] text-white/50 mt-3">
              Edge Decay: win-rate slope <span className={Number(winRateSlope) < 0 ? "text-loss" : "text-gain"}>{Number(winRateSlope).toFixed(4)}/window</span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S8 - CAN I TRUST MY PREDICTIONS?                                */
/* ================================================================ */

function Section8_Calibration({ agg }: { agg: any }) {
  const cal = agg.calibration ?? {};
  const brier = cal.brier_score ?? null;
  const buckets: any[] = Array.isArray(cal.reliability_bins) ? cal.reliability_bins : [];
  if (buckets.length === 0 && brier == null) return null;

  // Scatter data for calibration chart
  const scatterData = buckets.map((b: any) => ({
    predicted: b.predicted ?? b.avg_confidence ?? (b.lower != null && b.upper != null ? (Number(b.lower) + Number(b.upper)) / 2 : 0),
    actual: b.actual ?? b.win_rate ?? 0,
    n: b.count ?? b.n ?? 0,
    label: b.bin_label ?? b.bin ?? "",
  }));
  // Convert to [0,1] numbers
  const scatterNorm = scatterData.map((d) => ({
    ...d,
    x: Number(d.predicted),
    y: Number(d.actual),
  }));

  // Diagonal reference points
  const diagLine = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;8 Can I Trust My Predictions?</h2>

      {/* Calibration scatter */}
      {scatterNorm.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Calibration Chart (Predicted vs Actual)</p>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 1]}
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                name="Predicted P(YES)"
                tickFormatter={(v) => v.toFixed(1)}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 1]}
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={35}
                name="Actual YES Rate"
                tickFormatter={(v) => v.toFixed(1)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
                      <p className="text-white/60">{d.label}</p>
                      <p className="text-white">Predicted: {(d.x * 100).toFixed(1)}%</p>
                      <p className="text-white">Actual: {(d.y * 100).toFixed(1)}%</p>
                      <p className="text-white/50">n={d.n}</p>
                    </div>
                  );
                }}
              />
              {/* Diagonal (perfect calibration line) */}
              <Scatter data={diagLine} fill="none" line={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "6 4", strokeWidth: 1 }} shape={(() => <></>) as any} />
              {/* Data points */}
              <Scatter data={scatterNorm} fill={CHART_COLORS.gain}>
                {scatterNorm.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS.gain} r={6} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-white/40">
            <span>/ line = perfect calibration</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gain" /> your results</span>
          </div>
        </Card>
      )}

      {/* Brier callout */}
      {brier != null && (
        <Card className="mb-6">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[13px] text-white/60 mb-1">Brier Score</p>
              <p className="text-[28px] font-bold tabular-nums text-white">{fmtNum(brier)}</p>
            </div>
            <div className="text-[13px] text-white/50">
              <p>You: {fmtNum(brier)} vs Random: 0.250</p>
              <p className="text-gain">{((0.25 - Number(brier)) / 0.25 * 100).toFixed(1)}% better than guessing</p>
            </div>
          </div>
        </Card>
      )}

      {/* Reliability buckets table */}
      {buckets.length > 0 && (
        <Card>
          <p className="text-[13px] text-white/60 mb-3">Reliability Buckets</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-white/50 font-medium">Predicted P(YES)</th>
                <th className="text-right py-2 pr-3 text-white/50 font-medium">n</th>
                <th className="text-right py-2 pr-3 text-white/50 font-medium">Actual YES%</th>
                <th className="text-right py-2 pr-3 text-white/50 font-medium">Perfect</th>
                <th className="text-right py-2 text-white/50 font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b: any, i: number) => {
                const predicted = Number(b.predicted ?? b.avg_confidence ?? 0);
                const actual = Number(b.actual ?? b.win_rate ?? 0);
                const gap = (actual - predicted) * 100;
                return (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-3 pr-3 text-white/70">{b.bin_label ?? b.bin ?? `${fmtPct(b.lower, false)}\u2013${fmtPct(b.upper, false)}`}</td>
                    <td className="py-3 pr-3 text-white/60 text-right tabular-nums">{b.count ?? b.n ?? "\u2014"}</td>
                    <td className="py-3 pr-3 text-white text-right tabular-nums">{fmtPct(actual, false)}</td>
                    <td className="py-3 pr-3 text-white/50 text-right tabular-nums">{fmtPct(predicted, false)}</td>
                    <td className={`py-3 text-right tabular-nums font-medium ${Math.abs(gap) > 20 ? "text-loss" : Math.abs(gap) < 5 ? "text-gain" : "text-white/60"}`}>
                      {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S9 - WHAT SIGNALS PREDICT WINS?                                  */
/* ================================================================ */

function Section9_Signals({ agg }: { agg: any }) {
  const corr = agg.correlations ?? {};
  const wonCorr: Record<string, number> = corr.won_correlations ?? corr.real_won ?? {};
  const entries = Object.entries(wonCorr)
    .map(([k, v]) => ({ name: k.replace(/_/g, " "), value: Number(v) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  if (entries.length === 0) return null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;9 What Signals Predict Wins?</h2>
      <Card>
        <p className="text-[13px] text-white/60 mb-3">Correlation with real_won (sorted by |r|)</p>
        <ResponsiveContainer width="100%" height={Math.max(180, entries.length * 32 + 20)}>
          <BarChart data={entries} layout="vertical" margin={{ left: 120, right: 40 }}>
            <XAxis type="number" domain={[-1, 1]} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
                    <p className="text-white">{d.name}</p>
                    <p className={d.value >= 0 ? "text-gain" : "text-loss"}>r = {d.value.toFixed(3)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={14}>
              {entries.map((d, i) => (
                <Cell key={i} fill={d.value >= 0 ? CHART_COLORS.gain : CHART_COLORS.loss} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 text-[12px] text-white/50">
          Top predictors: {entries.slice(0, 3).map((e) => `${e.name} (r=${e.value.toFixed(3)})`).join(", ")}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  S10 - IS MY RISK GATE HELPING?                                   */
/* ================================================================ */

function Section10_RiskGate({ agg }: { agg: any }) {
  const rm = agg.risk_manager_audit ?? {};
  const bio = agg.bimodality ?? {};
  const o = agg.overall ?? {};

  const totalSignals = Number(o.total_signals ?? bio.total_signals ?? 0);
  const droppedPre = Number(bio.dropped_pre_research ?? 0);
  const reachedResearch = Number(bio.reached_research ?? o.reached_research ?? 0);
  const rejectedPost = Number(bio.rejected_post_research ?? 0);
  const placed = Number(o.placed ?? o.placed_count ?? 0);
  const settled = Number(o.settled ?? o.settled_count ?? 0);
  const winRate = o.win_rate != null ? Number(o.win_rate) : null;
  const realPnl = pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);

  const endorsedTrades = rm.endorsed_trades ?? rm.endorsed_count ?? null;
  const endorsedWin = rm.endorsed_win_rate ?? null;
  const endorsedPnl = rm.endorsed_pnl ?? null;
  const overriddenTrades = rm.overridden_trades ?? rm.overridden_count ?? null;
  const overriddenPnl = rm.overridden_pnl ?? null;
  const cfLossAvoided = rm.cf_loss_avoided ?? rm.loss_avoided ?? null;
  const avoidedRate = rm.correctly_avoided_rate ?? null;

  const hasRM = endorsedTrades != null || cfLossAvoided != null;
  if (totalSignals === 0 && !hasRM) return null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;10 Is My Risk Gate Helping?</h2>

      {/* Pipeline flow */}
      {totalSignals > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Trade Flow</p>
          <div className="space-y-2 text-[14px]">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold tabular-nums">{totalSignals}</span>
              <span className="text-white/50">signals</span>
            </div>
            {droppedPre > 0 && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-white/30">&rarr;</span>
                <span className="text-loss tabular-nums">{droppedPre}</span>
                <span className="text-white/50">dropped pre-research</span>
              </div>
            )}
            <div className="flex items-center gap-2 pl-4">
              <span className="text-white font-semibold tabular-nums">{reachedResearch}</span>
              <span className="text-white/50">reached research</span>
            </div>
            {rejectedPost > 0 && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-white/30">&rarr;</span>
                <span className="text-loss tabular-nums">{rejectedPost}</span>
                <span className="text-white/50">rejected post-research</span>
              </div>
            )}
            <div className="flex items-center gap-2 pl-4">
              <span className="text-white font-semibold tabular-nums">{placed}</span>
              <span className="text-white/50">placed</span>
              <span className="text-white/30">&rarr;</span>
              <span className="text-white tabular-nums">{settled}</span>
              <span className="text-white/50">settled</span>
              <span className="text-white/30">&rarr;</span>
              {winRate != null && <span className="text-white tabular-nums">{fmtPct(winRate)} win</span>}
              <span className="text-white/30">&rarr;</span>
              <span className={`font-semibold tabular-nums ${pnlColor(realPnl)}`}>{fmtPnl(realPnl)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* RM performance cards */}
      {hasRM && (
        <div className="grid grid-cols-3 gap-4">
          {endorsedTrades != null && (
            <Card>
              <p className="text-[13px] text-white/60 mb-1">RM Endorsed</p>
              <p className="text-[22px] font-bold text-white tabular-nums">{endorsedTrades} trades</p>
              {endorsedWin != null && <p className="text-[13px] text-white/60 mt-1">{fmtPct(endorsedWin)} win</p>}
              {endorsedPnl != null && <p className={`text-[13px] mt-1 font-medium tabular-nums ${pnlColor(pnlVal(endorsedPnl))}`}>{fmtPnl(endorsedPnl)}</p>}
            </Card>
          )}
          {overriddenTrades != null && (
            <Card>
              <p className="text-[13px] text-white/60 mb-1">RM Overridden</p>
              <p className="text-[22px] font-bold text-white tabular-nums">{overriddenTrades} trades</p>
              {overriddenPnl != null && <p className={`text-[13px] mt-1 font-medium tabular-nums ${pnlColor(pnlVal(overriddenPnl))}`}>{fmtPnl(overriddenPnl)}</p>}
            </Card>
          )}
          {cfLossAvoided != null && (
            <Card>
              <p className="text-[13px] text-white/60 mb-1">CF Loss Avoided</p>
              <p className="text-[22px] font-bold text-gain tabular-nums">{fmtPnl(cfLossAvoided)}</p>
              {avoidedRate != null && <p className="text-[13px] text-white/60 mt-1">{fmtPct(avoidedRate)} correctly avoided</p>}
              <p className="text-[12px] text-white/40 mt-1">saved by not placing</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S11 - WHAT AM I LEAVING ON THE TABLE?                            */
/* ================================================================ */

function Section11_LeftOnTable({ agg }: { agg: any }) {
  const cfDeep: any = agg.cf_deep_dive ?? {};
  const cfClusters: any[] = Array.isArray(cfDeep.top_missed) ? cfDeep.top_missed : [];
  const skipReasons: any = agg.skip_reasons ?? {};

  // Flatten all skip reasons across bots
  const allSkipReasons: Record<string, number> = {};
  if (typeof skipReasons === "object" && !Array.isArray(skipReasons)) {
    Object.values(skipReasons).forEach((botReasons: any) => {
      const items = Array.isArray(botReasons)
        ? botReasons
        : Object.entries(botReasons ?? {}).map(([r, c]) => ({ reason: r, count: Number(c) }));
      items.forEach((item: any) => {
        const reason = item.reason ?? item.name ?? "other";
        allSkipReasons[reason] = (allSkipReasons[reason] ?? 0) + (item.count ?? 0);
      });
    });
  }
  const skipEntries = Object.entries(allSkipReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  const totalSkips = skipEntries.reduce((s, x) => s + x.count, 0);

  if (cfClusters.length === 0 && skipEntries.length === 0) return null;

  const clusterData = cfClusters.map((c: any) => ({
    name: c.cluster ?? c.name ?? c.label ?? "unknown",
    cfPnl: pnlVal(c.cf_pnl ?? c.pnl),
    missed: c.missed_trades ?? c.count ?? 0,
  })).sort((a, b) => b.cfPnl - a.cfPnl);

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;11 What Am I Leaving on the Table?</h2>

      {/* CF PnL by cluster */}
      {clusterData.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">Best Missed Opportunities (skipped trades that would have won)</p>
          <ResponsiveContainer width="100%" height={Math.max(120, clusterData.length * 36 + 20)}>
            <BarChart data={clusterData} layout="vertical" margin={{ left: 120, right: 50 }}>
              <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<DarkTooltip labelKey="name" valueFormatter={fmtPnl} />} />
              <Bar dataKey="cfPnl" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {clusterData.map((d, i) => (
                  <Cell key={i} fill={colorForPnl(d.cfPnl)} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[12px] text-white/40 mt-2">
            Total top missed profit: {fmtPnl(clusterData.reduce((s, d) => s + Math.max(0, d.cfPnl), 0))}
          </p>
        </Card>
      )}

      {/* Skip reason breakdown */}
      {skipEntries.length > 0 && (
        <Card>
          <p className="text-[13px] text-white/60 mb-4">Why Were Trades Skipped? ({totalSkips} total)</p>
          {skipEntries.map((s, i) => {
            const pctW = totalSkips > 0 ? (s.count / totalSkips * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3 mb-2">
                <span className="text-[12px] text-white/60 w-44 truncate">{s.reason.replace(/_/g, " ")}</span>
                <div className="flex-1 h-4 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-white/[0.12] rounded-full" style={{ width: `${pctW}%` }} />
                </div>
                <span className="text-[12px] text-white/50 tabular-nums w-16 text-right">{pctW.toFixed(1)}%</span>
                <span className="text-[11px] text-white/30 tabular-nums w-10 text-right">({s.count})</span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S12 - WHAT IF I PLACED EVERYTHING?                               */
/* ================================================================ */

function Section12_PlaceEverything({ agg }: { agg: any }) {
  const cf = agg.counterfactual ?? {};
  const cfWinRate = cf.overall_cf_win_rate ?? cf.cf_win_rate ?? null;
  const cfPnl = pnlVal(cf.overall_cf_pnl ?? cf.cf_pnl ?? 0);
  const cfWinLo = cf.cf_win_rate_ci_lo ?? null;
  const cfWinHi = cf.cf_win_rate_ci_hi ?? null;
  const totalSkipped = cf.total_skipped ?? cf.skipped_count ?? null;

  const o = agg.overall ?? {};
  const realPnl = pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);
  const filterSavings = realPnl - cfPnl;

  // CF by category
  const cfByCat: any[] = Array.isArray(cf.by_category) ? cf.by_category : [];
  const catData = [...cfByCat]
    .map((c: any) => ({
      name: c.category ?? c.name ?? "unknown",
      cfPnl: pnlVal(c.cf_pnl ?? c.pnl),
      winRate: c.cf_win_rate ?? c.win_rate ?? null,
      n: c.n ?? c.count ?? c.trades ?? 0,
    }))
    .sort((a, b) => a.cfPnl - b.cfPnl);

  // CF by side
  const cfBySide: any = cf.by_side ?? {};
  const cfYes = cfBySide.YES ?? cfBySide.yes ?? {};
  const cfNo = cfBySide.NO ?? cfBySide.no ?? {};

  if (cfWinRate == null && catData.length === 0) return null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-6">&sect;12 What If I Placed Everything?</h2>

      {/* Headline card */}
      <Card className="mb-6 border-border">
        <div className="text-[14px] text-white/80 space-y-2">
          {totalSkipped != null && (
            <p>If you placed ALL <span className="text-white font-semibold">{totalSkipped}</span> skipped trades:</p>
          )}
          <p>
            <span className="text-white font-semibold">{cfWinRate != null ? fmtPct(cfWinRate) : "\u2014"}</span> would win
            {cfWinLo != null && cfWinHi != null && (
              <span className="text-white/40"> [{fmtPct(cfWinLo)}&ndash;{fmtPct(cfWinHi)}]</span>
            )}
            {" "}&rarr; but CF PnL = <span className={`font-semibold ${pnlColor(cfPnl)}`}>{fmtPnl(cfPnl)}</span>
          </p>
          {filterSavings > 0 && (
            <p className="text-gain">
              Your filter is working: avoiding <span className="font-semibold">{fmtPnl(filterSavings)}</span> in losses
            </p>
          )}
        </div>
      </Card>

      {/* CF PnL by category */}
      {catData.length > 0 && (
        <Card className="mb-6">
          <p className="text-[13px] text-white/60 mb-3">CF PnL by Category</p>
          <ResponsiveContainer width="100%" height={Math.max(140, catData.length * 36 + 20)}>
            <BarChart data={catData} layout="vertical" margin={{ left: 80, right: 50 }}>
              <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS_STYLE} axisLine={false} tickLine={false} width={70} />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg text-[12px]">
                      <p className="text-white">{d.name}</p>
                      <p className="text-white/60">n={d.n} {d.winRate != null ? ` | ${fmtPct(d.winRate)} win` : ""}</p>
                      <p className={d.cfPnl >= 0 ? "text-gain" : "text-loss"}>{fmtPnl(d.cfPnl)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="cfPnl" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {catData.map((d, i) => (
                  <Cell key={i} fill={colorForPnl(d.cfPnl)} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* CF by side */}
      {(cfYes.n != null || cfNo.n != null) && (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <p className="text-[15px] font-semibold text-white mb-4">YES SIDE (CF)</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-white/60">n</span><span className="text-white tabular-nums">{cfYes.n ?? cfYes.count ?? "\u2014"}</span></div>
              <div className="flex justify-between"><span className="text-white/60">CF Win%</span><span className="text-white tabular-nums">{cfYes.cf_win_rate != null ? fmtPct(cfYes.cf_win_rate) : "\u2014"}</span></div>
              <div className="flex justify-between">
                <span className="text-white/60">CF PnL</span>
                <span className={`tabular-nums font-medium ${pnlColor(pnlVal(cfYes.cf_pnl))}`}>{fmtPnl(cfYes.cf_pnl)}</span>
              </div>
            </div>
          </Card>
          <Card>
            <p className="text-[15px] font-semibold text-white mb-4">NO SIDE (CF)</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-white/60">n</span><span className="text-white tabular-nums">{cfNo.n ?? cfNo.count ?? "\u2014"}</span></div>
              <div className="flex justify-between"><span className="text-white/60">CF Win%</span><span className="text-white tabular-nums">{cfNo.cf_win_rate != null ? fmtPct(cfNo.cf_win_rate) : "\u2014"}</span></div>
              <div className="flex justify-between">
                <span className="text-white/60">CF PnL</span>
                <span className={`tabular-nums font-medium ${pnlColor(pnlVal(cfNo.cf_pnl))}`}>{fmtPnl(cfNo.cf_pnl)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
