"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { BotAvatar } from "@/components/BotAvatar";

export type ComparisonSeries = {
  id: string;
  bot_type_id?: string;
  name: string;
  label: string;
  winRate: number;
  pnl: number;
  trades: number;
  color: string;
  avatarBg: string;
  categories: { name: string; trades: number }[];
  data: { date: string; value: number }[];
};

const TIME_PERIODS = ["1D", "7D", "1M", "3M", "All"] as const;
type Period = (typeof TIME_PERIODS)[number];

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-[11px] text-text-tertiary mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[12px] font-semibold" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value, true)}
        </p>
      ))}
    </div>
  );
}

interface ComparisonChartProps {
  series: ComparisonSeries[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  height?: number;
}

export function ComparisonChart({ series, period, onPeriodChange, height = 290 }: ComparisonChartProps) {
  const merged: Record<string, Record<string, number>> = {};
  for (const s of series) {
    s.data.forEach(({ date, value }) => {
      if (!merged[date]) merged[date] = {};
      merged[date][s.id] = value;
    });
  }
  const chartData = Object.entries(merged)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  const left = series[0];
  const right = series[1];

  return (
    <div className="relative rounded-card w-full select-none overflow-hidden">

      {/* ── Period filter ── */}
      <div className="flex justify-center gap-0.5 pt-4 pb-3">
        {TIME_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
              period === p ? "bg-[#111] text-white" : "text-text-tertiary hover:text-text-tertiary"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Names + Stats row ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center pb-4 px-3 md:px-6">
        {/* Left: name above stats, right-aligned toward VS */}
        {left ? (
          <div className="flex flex-col items-end pr-3 md:pr-6 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 max-w-full">
              <span className="text-[10px] font-mono text-text-tertiary whitespace-nowrap">{left.label}</span>
              <span className="text-[11px] md:text-[12px] font-medium text-text-tertiary truncate">{left.name}</span>
            </div>
            <span className="text-[24px] md:text-[30px] font-black tabular-nums leading-none" style={{ color: left.color }}>
              {formatCurrency(left.pnl, true)}
            </span>
            <span className="text-[11px] text-text-tertiary mt-1">{left.winRate}% win rate</span>
          </div>
        ) : <div />}

        {/* VS divider */}
        <span className="text-[12px] font-semibold text-text-tertiary tracking-wider">VS</span>

        {/* Right: name above stats, left-aligned from VS */}
        {right ? (
          <div className="flex flex-col items-start pl-3 md:pl-6 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 max-w-full">
              <span className="text-[11px] md:text-[12px] font-medium text-text-tertiary truncate">{right.name}</span>
              <span className="text-[10px] font-mono text-text-tertiary whitespace-nowrap">{right.label}</span>
            </div>
            <span className="text-[24px] md:text-[30px] font-black tabular-nums leading-none" style={{ color: right.color }}>
              {formatCurrency(right.pnl, true)}
            </span>
            <span className="text-[11px] text-text-tertiary mt-1">{right.winRate}% win rate</span>
          </div>
        ) : <div />}
      </div>

      {/* ── Image + Chart section ── */}
      <div className="relative" style={{ height }}>

        {/* Left avatar — circular, behind chart */}
        {left && (
          <div className="absolute inset-y-0 left-0 w-1/3 pointer-events-none overflow-hidden hidden sm:flex items-center justify-center">
            <div className="opacity-50" style={{ marginLeft: "16px" }}>
              <BotAvatar agentId={left.id} botTypeId={left.bot_type_id} size={240} faceRight />
            </div>
          </div>
        )}

        {/* Right avatar — circular, behind chart */}
        {right && (
          <div className="absolute inset-y-0 right-0 w-1/3 pointer-events-none overflow-hidden hidden sm:flex items-center justify-center">
            <div className="opacity-50" style={{ marginRight: "16px" }}>
              <BotAvatar agentId={right.id} botTypeId={right.bot_type_id} size={240} faceRight={false} />
            </div>
          </div>
        )}

        {/* Chart — center-aligned, wider on mobile since avatars are hidden */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div style={{ height: "85%" }} className="w-[92%] sm:w-[44%]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#666", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => { const d = new Date(v); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#666", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  width={40}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
                />
                {series.map((s) => (
                  <Area
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2.5}
                    fill={`url(#grad-${s.id})`}
                    dot={false}
                    activeDot={{ r: 3, stroke: s.color, strokeWidth: 2, fill: "#000" }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Pills ── */}
      <div className="flex items-center justify-center gap-2 md:gap-3 py-4 px-2">
        {series.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-full text-[11px] md:text-[12px] font-semibold"
            style={{
              backgroundColor: `${s.color}14`,
              border: `1px solid ${s.color}30`,
              color: s.color,
            }}
          >
            <span className="font-mono text-[10px] opacity-60">{s.label}</span>
            <span>·</span>
            <span>{s.trades} trades</span>
          </div>
        ))}
      </div>
    </div>
  );
}
