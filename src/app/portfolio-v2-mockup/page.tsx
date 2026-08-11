"use client";

import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import {
  AreaChart, Area, Bar, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ── Mock chart data ── */
const pnlData = [
  { date: "Mar 5", value: 0 }, { date: "Mar 7", value: 1.2 }, { date: "Mar 9", value: 2.8 },
  { date: "Mar 11", value: 2.1 }, { date: "Mar 13", value: 4.5 }, { date: "Mar 15", value: 5.2 },
  { date: "Mar 17", value: 6.8 }, { date: "Mar 19", value: 7.1 }, { date: "Mar 21", value: 8.9 },
  { date: "Mar 23", value: 9.4 }, { date: "Mar 25", value: 11.2 }, { date: "Mar 27", value: 12.8 },
  { date: "Mar 29", value: 13.5 }, { date: "Mar 31", value: 14.2 }, { date: "Apr 1", value: 15.1 },
  { date: "Apr 3", value: 16.8 }, { date: "Apr 4", value: 19.66 },
];

/* ── Mock trades data (Robinhood Short Interest style) ── */
const tradesData = [
  { date: "Feb 03", trades: 12, won: 8, lost: 2, winRate: 80 },
  { date: "Feb 06", trades: 15, won: 10, lost: 3, winRate: 77 },
  { date: "Feb 10", trades: 14, won: 11, lost: 2, winRate: 85 },
  { date: "Feb 13", trades: 10, won: 7, lost: 2, winRate: 78 },
  { date: "Feb 17", trades: 8, won: 6, lost: 1, winRate: 86 },
  { date: "Feb 20", trades: 11, won: 8, lost: 2, winRate: 80 },
  { date: "Feb 24", trades: 9, won: 7, lost: 1, winRate: 88 },
  { date: "Feb 27", trades: 13, won: 9, lost: 3, winRate: 75 },
  { date: "Mar 03", trades: 11, won: 8, lost: 2, winRate: 80 },
  { date: "Mar 06", trades: 10, won: 7, lost: 2, winRate: 78 },
  { date: "Mar 10", trades: 12, won: 9, lost: 2, winRate: 82 },
  { date: "Mar 13", trades: 8, won: 6, lost: 1, winRate: 86 },
  { date: "Mar 17", trades: 14, won: 11, lost: 2, winRate: 85 },
  { date: "Mar 20", trades: 9, won: 7, lost: 1, winRate: 88 },
  { date: "Mar 24", trades: 11, won: 8, lost: 2, winRate: 80 },
  { date: "Mar 27", trades: 7, won: 5, lost: 1, winRate: 83 },
  { date: "Mar 31", trades: 13, won: 10, lost: 2, winRate: 83 },
  { date: "Apr 02", trades: 10, won: 8, lost: 1, winRate: 89 },
];

const strategies = [
  { id: "council-v2-poly", name: "Council V2 (Polymarket)", exchange: "polymarket" },
  { id: "council-v2-kalshi", name: "Council V2 (Kalshi)", exchange: "kalshi" },
];

/* ── Components ── */

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
      <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide />
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


/* ══════════════════════════════════════════════════════════════════ */
/*  PAGE                                                             */
/* ══════════════════════════════════════════════════════════════════ */

export default function PortfolioV2Mockup() {
  const [chartPeriod, setChartPeriod] = useState("1M");
  const [modeFilter, setModeFilter] = useState("all");
  const [exchangeFilter, setExchangeFilter] = useState("all");

  const [positionTab, setPositionTab] = useState<"open" | "settled">("open");

  /* Deploy card state */
  const [selectedStrategy, setSelectedStrategy] = useState(strategies[0]!.id);
  const [deployDuration, setDeployDuration] = useState(1440);
  const [capitalLimit, setCapitalLimit] = useState("1000");

  /* Mock values */
  const portfolioValue = 93.43;
  const totalPnl = 19.66;
  const pnlPct = 26.65;
  const todayPnl = 1.24;

  const periods = ["1D", "1W", "1M", "3M", "1Y", "All"];

  return (
    <div className="min-h-screen px-6 md:px-10 lg:px-14 py-6 md:py-8 animate-fade-in">

      {/* ── Header row ── */}
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-[20px] font-semibold text-white">Portfolio</h1>
        <div className="flex items-center gap-4">
          <FilterDropdown label="All modes" value={modeFilter} onChange={setModeFilter}
            options={[{ value: "all", label: "All modes" }, { value: "training", label: "Training" }, { value: "live", label: "Live" }]} />
          <FilterDropdown label="All exchanges" value={exchangeFilter} onChange={setExchangeFilter}
            options={[{ value: "all", label: "All exchanges" }, { value: "kalshi", label: "Kalshi" }, { value: "polymarket", label: "Polymarket" }]} />
        </div>
      </div>

      {/* ── Value + P&L (Robinhood-tight) ── */}
      <div className="mt-3">
        <div className="text-[38px] md:text-[44px] font-bold text-white tracking-tight tabular-nums leading-none">
          ${portfolioValue.toFixed(2)}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[14px] font-medium text-[#00C807] tabular-nums">
            +${totalPnl.toFixed(2)} (+{pnlPct.toFixed(2)}%)
          </span>
          <span className="text-[13px] text-[#919fa6]">All time</span>
        </div>
        <div className="text-[13px] text-[#919fa6] tabular-nums mt-0.5">
          <span className={todayPnl >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}>
            {todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}
          </span>
          {" "}today
        </div>
      </div>

      {/* ── Two-column: Chart + Deploy Card ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">

        {/* ── LEFT: Chart (Robinhood style, card-aligned with right) ── */}
        <div className="border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
          {/* Chart */}
          <div className="flex-1 px-2 pt-4">
            <PnlChart data={pnlData} height={320} />
          </div>

          {/* Divider + time selector (Robinhood: plain text, active = green) */}
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

              {/* Form fields — clean, no grey backgrounds */}
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
                <button className="w-full py-3 rounded-lg bg-[#00C805] hover:bg-[#00B004] text-black text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]">
                  <Play className="w-4 h-4" fill="black" />
                  Deploy
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  KEY STATISTICS — Robinhood "Related lists" style              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14">
        <h2 className="text-[22px] font-semibold text-white">Key statistics</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex flex-wrap gap-3">
            {[
              { icon: "/icons/streak.jpeg", label: "5 win streak" },
              { icon: "/icons/win rate.jpeg", label: "79% win rate" },
              { icon: "/icons/open positions.jpeg", label: "15 open" },
              { icon: "/icons/cash.jpeg", label: "$78.65 cash" },
              { icon: "/icons/agents.jpeg", label: "2 agents" },
              { icon: "/icons/trades.jpeg", label: "300 trades" },
              { icon: "/icons/approved.jpeg", label: "34 approved" },
              { icon: "/icons/skipped.jpeg", label: "215 skipped" },
            ].map((stat) => (
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
      {/*  PORTFOLIO BREAKDOWN — Robinhood "Analyst ratings" style       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Portfolio breakdown</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="flex items-center gap-8 md:gap-12">

            {/* Solid circle — Robinhood style */}
            <div className="flex-shrink-0">
              <div className="w-[120px] h-[120px] rounded-full bg-[#1a2e1a] flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold text-[#00C807] leading-none">16%</span>
                <span className="text-[11px] text-[#00C807]/70 mt-1">deployed</span>
              </div>
            </div>

            {/* Horizontal bars — full width with subtle track */}
            <div className="flex-1 space-y-5">
              {/* Deployed */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Deployed</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#00C807]" style={{ width: "16%" }} />
                </div>
                <span className="text-[14px] text-[#00C807] tabular-nums shrink-0">$14.78</span>
              </div>

              {/* Cash */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Cash</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full bg-white" style={{ width: "84%" }} />
                </div>
                <span className="text-[14px] text-white tabular-nums shrink-0">$78.65</span>
              </div>

              {/* Unrealized P&L */}
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-white w-[120px] shrink-0">Unrealized P&L</span>
                <div className="flex-1 h-[4px] bg-[#1a1a1a] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#00C807]/60" style={{ width: "26%" }} />
                </div>
                <span className="text-[14px] text-[#00C807] tabular-nums shrink-0">+$2.41</span>
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
          {/* Legend — minimal, Robinhood style */}
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

          {/* Chart — clean, Robinhood Short Interest style */}
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={tradesData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }} barCategoryGap="40%">
              {/* No grid — clean background like Robinhood */}
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
              <Line yAxisId="right" dataKey="winRate" type="monotone" stroke="#919fa6"
                strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 2.5, fill: "#919fa6", strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  RECENTLY SETTLED — Robinhood "People also own" style          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Recently settled</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <p className="text-[13px] text-[#919fa6] mb-5 leading-relaxed">
            Trades that have resolved. Showing the most recent outcomes across all agents.
          </p>
          <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {[
              { title: "Will Trump impose tariffs on EU by April?", pnl: 2.41, pct: 24.1, date: "Apr 2" },
              { title: "Fed rate decision March meeting", pnl: -0.85, pct: -8.5, date: "Mar 31" },
              { title: "Bitcoin above $70k end of March?", pnl: 1.20, pct: 12.0, date: "Mar 28" },
              { title: "US GDP Q1 above 2%?", pnl: 0.95, pct: 9.5, date: "Mar 25" },
            ].map((t) => {
              const won = t.pnl > 0;
              return (
                <div key={t.title}
                  className="shrink-0 flex-1 min-w-[140px] border border-white/[0.08] rounded-xl px-5 py-6 hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col">
                  <div className="text-[14px] font-medium text-white leading-snug line-clamp-2 min-h-[40px]">
                    {t.title}
                  </div>
                  <div className="flex-1" />
                  <div className="mt-8">
                    <div className={`text-[20px] font-bold tabular-nums ${won ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                      {won ? "+$" : "-$"}{Math.abs(t.pnl).toFixed(2)}
                    </div>
                    <div className={`text-[13px] tabular-nums mt-1 ${won ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                      {won ? "+" : ""}{t.pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  AGENTS — Robinhood "People also own" card style               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Agents</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <p className="text-[13px] text-[#919fa6] mb-5 leading-relaxed">
            Active trading agents and their performance.
          </p>
          <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {[
              { name: "Council V2 (Poly)", pnl: 14.22, pct: 28.4, trades: 185, status: "running", mvp: true },
              { name: "Council V2 (Kalshi)", pnl: 5.44, pct: 18.1, trades: 115, status: "running", mvp: false },
            ].map((agent) => {
              const positive = agent.pnl > 0;
              return (
                <div key={agent.name}
                  className="shrink-0 w-[195px] border border-white/[0.08] rounded-xl px-5 py-7 hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[15px] font-medium text-white leading-tight">{agent.name}</span>
                    {agent.mvp && <span className="text-[10px] text-[#919fa6] border border-white/[0.1] rounded px-2 py-0.5">MVP</span>}
                  </div>
                  <div className="flex-1" />
                  <div className="mt-8">
                    <div className={`text-[20px] font-bold tabular-nums ${positive ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                      {positive ? "+$" : "-$"}{Math.abs(agent.pnl).toFixed(2)}
                    </div>
                    <div className={`text-[13px] tabular-nums mt-1 ${positive ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                      {positive ? "+" : ""}{agent.pct.toFixed(1)}%
                    </div>
                    <div className="text-[12px] text-[#919fa6] mt-3">{agent.trades} trades</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  POSITIONS — Robinhood "Average Annual Return" table style      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="mt-14 lg:max-w-[calc(100%-320px-1.5rem)]">
        <h2 className="text-[22px] font-semibold text-white">Positions</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">

          {/* Pill tabs */}
          <div className="flex items-center gap-3 mb-8">
            {(["open", "settled"] as const).map((tab) => (
              <button key={tab} onClick={() => setPositionTab(tab)}
                className={`px-5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  positionTab === tab
                    ? "text-[#00C807] border border-[#00C807]"
                    : "text-[#919fa6] border border-white/[0.1] hover:border-white/[0.2]"
                }`}>
                {tab === "open" ? "Open (15)" : "Settled (285)"}
              </button>
            ))}
          </div>

          {/* Table */}
          {positionTab === "open" ? (
            <div>
              {/* Header */}
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr" }}>
                <span>Market</span><span>Side</span><span>Contracts</span><span>Value</span><span>Agent</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />

              {/* Rows */}
              {[
                { market: "Trump tariffs on EU by April?", side: "YES", contracts: 12, value: 4.80, agent: "Council V2 (Poly)" },
                { market: "Fed rate cut May 2026?", side: "NO", contracts: 8, value: 2.96, agent: "Council V2 (Poly)" },
                { market: "Bitcoin above $80k by June?", side: "YES", contracts: 5, value: 1.75, agent: "Council V2 (Poly)" },
                { market: "US GDP Q2 above 2.5%?", side: "YES", contracts: 10, value: 3.50, agent: "Council V2 (Kalshi)" },
                { market: "Unemployment below 4% June?", side: "NO", contracts: 6, value: 1.77, agent: "Council V2 (Kalshi)" },
              ].map((pos, i) => (
                <div key={i}>
                  <div className="grid items-center py-6 text-[14px] cursor-pointer hover:bg-white/[0.02]"
                    style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr" }}>
                    <span className="text-white truncate pr-3">{pos.market}</span>
                    <span className="text-[#919fa6]">{pos.side}</span>
                    <span className="text-[#919fa6] tabular-nums">{pos.contracts}</span>
                    <span className="text-white tabular-nums">${pos.value.toFixed(2)}</span>
                    <span className="text-[#919fa6] truncate">{pos.agent}</span>
                  </div>
                  <div className="h-[1px] bg-white/[0.12]" />
                </div>
              ))}

              <div className="flex items-center justify-between mt-5">
                <span className="text-[12px] text-[#919fa6]/50 italic">Showing 5 of 15 open positions</span>
                <button className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">View more →</button>
              </div>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid items-center pb-4 text-[14px] font-bold text-white"
                style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr 0.7fr" }}>
                <span>Market</span><span>Side</span><span>Cost</span><span>P&L</span><span>Agent</span><span>Date</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />

              {/* Rows */}
              {[
                { market: "Will Trump impose tariffs on EU?", side: "YES", cost: 2.00, pnl: 2.41, agent: "Council V2 (Poly)", date: "Apr 2" },
                { market: "Fed rate decision March", side: "NO", cost: 1.50, pnl: -0.85, agent: "Council V2 (Poly)", date: "Mar 31" },
                { market: "Bitcoin above $70k March?", side: "YES", cost: 1.00, pnl: 1.20, agent: "Council V2 (Poly)", date: "Mar 28" },
                { market: "US GDP Q1 above 2%?", side: "YES", cost: 1.50, pnl: 0.95, agent: "Council V2 (Kalshi)", date: "Mar 25" },
                { market: "Unemployment March report", side: "NO", cost: 2.00, pnl: -0.60, agent: "Council V2 (Kalshi)", date: "Mar 22" },
              ].map((t, i) => {
                const won = t.pnl > 0;
                return (
                  <div key={i}>
                    <div className="grid items-center py-6 text-[14px] cursor-pointer hover:bg-white/[0.02]"
                      style={{ gridTemplateColumns: "2fr 0.6fr 0.8fr 0.8fr 1.2fr 0.7fr" }}>
                      <span className="text-white truncate pr-3">{t.market}</span>
                      <span className="text-[#919fa6]">{t.side}</span>
                      <span className="text-[#919fa6] tabular-nums">${t.cost.toFixed(2)}</span>
                      <span className={`font-medium tabular-nums ${won ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                        {won ? "+$" : "-$"}{Math.abs(t.pnl).toFixed(2)}
                      </span>
                      <span className="text-[#919fa6] truncate">{t.agent}</span>
                      <span className="text-[#919fa6]">{t.date}</span>
                    </div>
                    <div className="h-[1px] bg-white/[0.12]" />
                  </div>
                );
              })}

              <div className="flex items-center justify-between mt-5">
                <span className="text-[12px] text-[#919fa6]/50 italic">Showing 5 of 285 settled trades</span>
                <button className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors">View more →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-20" />
    </div>
  );
}
