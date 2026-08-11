"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";


// ============ FUND VALUE CHART (Hero — Robinhood style, two lines) ============
export function FundValueChart({
  data,
  height = 300,
}: {
  data: { date: string; value: number; invested?: number }[];
  height?: number;
}) {
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;
  const portfolioColor = isPositive ? "#00C807" : "#FF6B8A";
  const investedColor = "#9E9E9E";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 0, left: -10, bottom: 20 }}>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            const portfolioVal = d?.value;
            const investedVal = d?.invested;
            const pnl = portfolioVal != null && investedVal != null ? portfolioVal - investedVal : null;
            return (
              <div className="bg-[#1a1a1a] border border-border rounded px-3 py-2 shadow-lg min-w-[160px]">
                <div className="text-[11px] text-[#9E9E9E] mb-1.5">{d?.date}</div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2 h-[2px] rounded-full" style={{ backgroundColor: portfolioColor }} />
                  <span className="text-[11px] text-[#9E9E9E]">Portfolio</span>
                  <span className="text-[13px] font-semibold text-white tabular-nums ml-auto">
                    ${Number(portfolioVal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {investedVal != null && (
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2 h-[2px] rounded-full" style={{ backgroundColor: investedColor }} />
                    <span className="text-[11px] text-[#9E9E9E]">Invested</span>
                    <span className="text-[13px] font-semibold text-white tabular-nums ml-auto">
                      ${Number(investedVal).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {pnl != null && (
                  <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border">
                    <span className="text-[11px] text-[#9E9E9E]">P&L</span>
                    <span className={`text-[13px] font-semibold tabular-nums ml-auto ${pnl >= 0 ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                      {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            );
          }}
          cursor={{ stroke: "#9E9E9E", strokeWidth: 0.5 }}
        />
        <Line
          type="monotone"
          dataKey="invested"
          stroke={investedColor}
          strokeWidth={1}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3, fill: investedColor, stroke: "#000", strokeWidth: 1.5 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={portfolioColor}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: portfolioColor, stroke: "#000", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============ SPARKLINE (inline mini chart) ============
export function Sparkline({
  data,
  width = 80,
  height = 32,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const isPositive = data[data.length - 1] >= data[0];
  const strokeColor = color || (isPositive ? "#00C807" : "#FF6B8A");
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div className="sparkline-container">
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ TRADE ACTIVITY CHART (stacked wins/losses) ============
export function TradeActivityChart({
  data,
  height = 300,
}: {
  data: { date: string; wins: number; losses: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 0, left: -10, bottom: 20 }}>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            const total = (d?.wins || 0) + (d?.losses || 0);
            return (
              <div className="bg-[#1a1a1a] border border-border rounded px-3 py-2 shadow-lg min-w-[140px]">
                <div className="text-[11px] text-[#9E9E9E] mb-1.5">{d?.date}</div>
                <div className="flex items-center justify-between gap-4 mb-0.5">
                  <span className="text-[12px] text-[#9E9E9E]">Total trades</span>
                  <span className="text-[13px] font-semibold text-white tabular-nums">{total}</span>
                </div>
                <div className="flex items-center justify-between gap-4 mb-0.5">
                  <span className="text-[12px] text-[#00C807]">Wins</span>
                  <span className="text-[13px] font-semibold text-[#00C807] tabular-nums">{d?.wins}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-[#FF6B8A]">Losses</span>
                  <span className="text-[13px] font-semibold text-[#FF6B8A] tabular-nums">{d?.losses}</span>
                </div>
              </div>
            );
          }}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar dataKey="wins" stackId="trades" fill="#00C807" opacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={8} />
        <Bar dataKey="losses" stackId="trades" fill="#FF6B8A" opacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={8} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============ PNL CHART (bot detail) ============
export function PnlChart({
  data,
  height = 250,
}: {
  data: { date: string; value: number }[];
  height?: number;
}) {
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;
  const color = isPositive ? "#00C807" : "#FF6B8A";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.12} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const val = Number(payload[0].value);
            return (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-sm">
                <div className="text-xs text-text-secondary">{payload[0].payload.date}</div>
                <div className={`text-sm font-semibold ${val >= 0 ? "text-gain" : "text-loss"}`}>
                  {val >= 0 ? "+" : "-"}${Math.abs(val).toFixed(2)}
                </div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#pnlGradient)"
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ============ BAR CHART ============
export function SimpleBarChart({
  data,
  dataKey,
  height = 200,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#6B6B6B" }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            return (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-sm">
                <div className="text-sm font-semibold">{String(payload[0].value)}</div>
              </div>
            );
          }}
        />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={32}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={Number(entry[dataKey]) >= 0 ? "#00C807" : "#FF6B8A"} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============ WIN RATE BAR CHART ============
export function WinRateChart({
  data,
  height = 200,
}: {
  data: { name: string; winRate: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#6B6B6B" }}
        />
        <YAxis
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#6B6B6B" }}
          width={30}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            return (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-sm">
                <div className="text-sm font-semibold">{payload[0].value}%</div>
              </div>
            );
          }}
        />
        <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={32} fill="#00C807" opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============ BATTLE CHART (minimal — lines only, optional dates & glow) ============
export function BattleChart({
  data,
  lines,
  height = 60,
  showDates = false,
  glowShadow = false,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; color: string; name: string }[];
  height?: number;
  showDates?: boolean;
  glowShadow?: boolean;
}) {
  const filterId = `battle-glow-${lines.map(l => l.key).join("-")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 20, bottom: showDates ? 0 : 5 }}>
        {glowShadow && (
          <defs>
            {lines.map((line) => (
              <filter key={`${filterId}-${line.key}`} id={`${filterId}-${line.key}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor={line.color} floodOpacity="0.4" />
              </filter>
            ))}
          </defs>
        )}
        {showDates && (
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6B6B6B" }}
            interval={Math.floor(data.length / 5)}
          />
        )}
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            name={line.name}
            filter={glowShadow ? `url(#${filterId}-${line.key})` : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============ COMPARISON CHART (2-3 lines) ============
export function ComparisonChart({
  data,
  lines,
  height = 300,
}: {
  data: Record<string, unknown>[];
  lines: { key: string; color: string; name: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#6B6B6B" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#6B6B6B" }}
          width={50}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-sm">
                <div className="text-xs text-text-secondary mb-1">{label}</div>
                {payload.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-text-secondary">{p.name}:</span>
                    <span className="font-semibold">${Number(p.value).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        {lines.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            name={line.name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============ HEATMAP-STYLE BAR (for insights hour of day) ============
export function HourlyChart({
  data,
  height = 180,
}: {
  data: { hour: number; trades: number; winRate: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: "#6B6B6B" }}
          tickFormatter={(v) => (v % 4 === 0 ? `${v}:00` : "")}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-sm">
                <div className="text-xs text-text-secondary">{d.hour}:00</div>
                <div className="text-sm">{d.trades} trades · {d.winRate}% win</div>
              </div>
            );
          }}
        />
        <Bar dataKey="trades" radius={[2, 2, 0, 0]} maxBarSize={14}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.winRate >= 60 ? "#00C807" : entry.winRate >= 50 ? "#FFC107" : "#FF6B8A"}
              opacity={0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
