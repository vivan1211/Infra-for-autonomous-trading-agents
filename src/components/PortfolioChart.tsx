"use client";

import {
  ComposedChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const periods = ["LIVE", "1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
export type Period = (typeof periods)[number];

export type ChartMode = "portfolio" | "trades";

export interface PortfolioDataPoint {
  date: string;
  cash: number;
  positions: number;
}

export interface TradeDataPoint {
  date: string;
  trades: number;
  approved?: number;
  skipped?: number;
  rejected?: number;
  pnl: number;
}

function formatXAxis(date: string, period: Period): string {
  const d = new Date(date);
  if (period === "LIVE" || period === "1D") {
    const h = d.getHours();
    return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
  }
  if (period === "1W") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (period === "1M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (period === "3M" || period === "1Y" || period === "ALL") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return String(d.getFullYear());
}

function formatTooltipDate(date: string, period: Period): string {
  const d = new Date(date);
  if (period === "LIVE" || period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (period === "1W" || period === "1M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (period === "3M" || period === "1Y" || period === "ALL") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return String(d.getFullYear());
}

// --- Real data grouping functions (no fake data) ---

function groupBy<T extends { date: string }>(
  data: T[],
  keyFn: (d: Date) => string,
  sumFields: (keyof T)[] = [],
): T[] {
  const map = new Map<string, T>();
  for (const p of data) {
    const key = keyFn(new Date(p.date));
    const existing = map.get(key);
    if (existing) {
      // For portfolio: keep last value (overwrite). For trades: sum counts.
      for (const field of sumFields) {
        (existing as Record<string, unknown>)[field as string] =
          ((existing[field] as number) ?? 0) + ((p[field] as number) ?? 0);
      }
      // Always keep the latest date for the group
      existing.date = p.date;
      // For portfolio data, keep last cash/positions
      if ("cash" in p) (existing as Record<string, unknown>).cash = (p as Record<string, unknown>).cash;
      if ("positions" in p) (existing as Record<string, unknown>).positions = (p as Record<string, unknown>).positions;
    } else {
      map.set(key, { ...p });
    }
  }
  return Array.from(map.values());
}

function groupByHour<T extends { date: string }>(data: T[], sumFields: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`, sumFields);
}

function groupByDay<T extends { date: string }>(data: T[], sumFields: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, sumFields);
}

function groupByWeek<T extends { date: string }>(data: T[], sumFields: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => {
    // Start of week (Sunday)
    const start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    return `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
  }, sumFields);
}

function groupByMonth<T extends { date: string }>(data: T[], sumFields: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}`, sumFields);
}

function trimToRange<T extends { date: string }>(data: T[], period: Period): T[] {
  if (period === "ALL") return data;
  const cutoffDays: Record<string, number> = { "LIVE": 1, "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };
  const days = cutoffDays[period] ?? 365;
  const cutoff = new Date(Date.now() - days * 86400000);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function filterPortfolio(data: PortfolioDataPoint[], period: Period): PortfolioDataPoint[] {
  const trimmed = trimToRange(data, period);
  if (period === "LIVE" || period === "1D") return groupByHour(trimmed);
  if (period === "1W") return groupByDay(trimmed);
  if (period === "1M") return groupByWeek(trimmed);
  if (period === "3M") return groupByMonth(trimmed);
  if (period === "1Y") return groupByMonth(trimmed);
  // ALL
  return groupByMonth(trimmed);
}

const TRADE_SUM_FIELDS: (keyof TradeDataPoint)[] = ["trades", "approved", "skipped", "rejected", "pnl"];

function filterTrades(data: TradeDataPoint[], period: Period): TradeDataPoint[] {
  const trimmed = trimToRange(data, period);
  if (period === "LIVE" || period === "1D") return groupByHour(trimmed, TRADE_SUM_FIELDS);
  if (period === "1W") return groupByDay(trimmed, TRADE_SUM_FIELDS);
  if (period === "1M") return groupByWeek(trimmed, TRADE_SUM_FIELDS);
  if (period === "3M") return groupByMonth(trimmed, TRADE_SUM_FIELDS);
  if (period === "1Y") return groupByMonth(trimmed, TRADE_SUM_FIELDS);
  return groupByMonth(trimmed, TRADE_SUM_FIELDS);
}

function PortfolioTooltip({
  active, payload, period,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string; payload: PortfolioDataPoint }>;
  period: Period;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-border rounded px-3 py-2 shadow-lg min-w-[140px]">
      <p className="text-[11px] text-text-tertiary mb-1.5">
        {formatTooltipDate(payload[0].payload.date, period)}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-[11px] text-text-secondary">{p.name}</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: p.color }}>
            ${p.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
}

function TradeTooltip({
  active, payload, period,
}: {
  active?: boolean;
  payload?: Array<{ payload: TradeDataPoint; name?: string; color?: string; value?: number }>;
  period: Period;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const approved = point.approved || 0;
  const skipped = point.skipped || 0;
  const rejected = point.rejected || 0;
  const total = approved + skipped + rejected;
  return (
    <div className="bg-[#1a1a1a] border border-border rounded px-3 py-2 shadow-lg min-w-[120px]">
      <p className="text-[11px] text-text-tertiary mb-1.5">
        {formatTooltipDate(point.date, period)}
      </p>
      <p className="text-[13px] font-semibold text-text-primary mb-1">{total} trades</p>
      {approved > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#00C807" }} />
          <span className="text-[11px] text-text-secondary">{approved} approved</span>
        </div>
      )}
      {skipped > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#FBBF24" }} />
          <span className="text-[11px] text-text-secondary">{skipped} skipped</span>
        </div>
      )}
      {rejected > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#FF6B8A" }} />
          <span className="text-[11px] text-text-secondary">{rejected} rejected</span>
        </div>
      )}
    </div>
  );
}

// Compute tick interval so we don't crowd the x-axis
function getTickInterval(dataLength: number): number {
  if (dataLength <= 12) return 0;
  if (dataLength <= 24) return 2;
  if (dataLength <= 31) return 4;
  return Math.ceil(dataLength / 8);
}

export function PortfolioChart({ data, tradeData, mode, height = 280, activePeriod, onPeriodChange }: {
  data: PortfolioDataPoint[];
  tradeData: TradeDataPoint[];
  mode: ChartMode;
  positive?: boolean;
  height?: number;
  activePeriod: Period;
  onPeriodChange: (period: Period) => void;
}) {
  // Positions color: green if latest > first, red if down
  const positionsUp = data.length >= 2 ? data[data.length - 1].positions >= data[0].positions : true;
  const positionsColor = positionsUp ? "#00C807" : "#FF6B8A";
  const cashColor = "#60A5FA";

  const filteredPortfolio = filterPortfolio(data, activePeriod);
  const filteredTrades = filterTrades(tradeData, activePeriod);

  const portfolioInterval = getTickInterval(filteredPortfolio.length);
  const tradeInterval = getTickInterval(filteredTrades.length);

  const hasPortfolioData = filteredPortfolio.length > 0;
  const hasTradeData = filteredTrades.length > 0;

  return (
    <div>
      {mode === "portfolio" && !hasPortfolioData ? (
        <div style={{ height }} className="flex items-center justify-center text-text-tertiary text-sm">
          No portfolio data yet — deploy a bot to start tracking
        </div>
      ) : mode === "trades" && !hasTradeData ? (
        <div style={{ height }} className="flex items-center justify-center text-text-tertiary text-sm">
          No trade data yet
        </div>
      ) : mode === "portfolio" ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredPortfolio} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cashColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={cashColor} stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={positionsColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={positionsColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatXAxis(d, activePeriod)}
                interval={portfolioInterval}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip
                content={<PortfolioTooltip period={activePeriod} />}
                cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="cash"
                stroke={cashColor}
                strokeWidth={2}
                fill="url(#cashGrad)"
                dot={false}
                activeDot={{ r: 4, stroke: cashColor, strokeWidth: 2, fill: "#121212" }}
                name="Cash"
              />
              <Area
                type="monotone"
                dataKey="positions"
                stroke={positionsColor}
                strokeWidth={2}
                fill="url(#posGrad)"
                dot={false}
                activeDot={{ r: 4, stroke: positionsColor, strokeWidth: 2, fill: "#121212" }}
                name="Positions"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredTrades} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barSize={filteredTrades.length <= 12 ? 14 : filteredTrades.length <= 31 ? 6 : 18} stackOffset="none">
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatXAxis(d, activePeriod)}
                interval={tradeInterval}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis hide />
              <Tooltip content={<TradeTooltip period={activePeriod} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              {/* Stacked bars: approved (green), skipped (yellow), rejected (pink) */}
              <Bar dataKey="approved" stackId="trades" fill="#00C807" fillOpacity={0.7} radius={[0, 0, 0, 0]} name="Approved" />
              <Bar dataKey="skipped" stackId="trades" fill="#FBBF24" fillOpacity={0.6} radius={[0, 0, 0, 0]} name="Skipped" />
              <Bar dataKey="rejected" stackId="trades" fill="#FF6B8A" fillOpacity={0.6} radius={[2, 2, 0, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time Selectors */}
      <div className="flex items-center gap-0 mt-3 border-b border-border">
        {periods.map((period) => (
          <button
            key={period}
            onClick={() => onPeriodChange(period)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-all border-b-2 -mb-px ${
              activePeriod === period
                ? "text-text-primary border-white"
                : "text-text-tertiary border-transparent hover:text-text-secondary"
            }`}
          >
            {period === "LIVE" && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  activePeriod === "LIVE" ? "bg-gain animate-pulse" : "bg-[#444]"
                }`}
              />
            )}
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}
