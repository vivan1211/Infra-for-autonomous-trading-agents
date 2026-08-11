"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  ColorType,
  CrosshairMode,
  type DeepPartial,
  type ChartOptions,
  AreaSeries,
} from "lightweight-charts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  Period,
  ChartMode,
  PortfolioDataPoint,
  TradeDataPoint,
} from "@/components/PortfolioChart";

export type { Period, ChartMode, PortfolioDataPoint, TradeDataPoint };

/* ── Helpers ── */

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function formatLegendValue(v: number): string {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTooltipDate(unix: number, period: Period): string {
  const d = new Date(unix * 1000);
  if (period === "LIVE" || period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (period === "1W" || period === "1M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatXAxis(date: string, period: Period): string {
  const d = new Date(date);
  if (period === "LIVE" || period === "1D") {
    const h = d.getHours();
    return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
  }
  if (period === "1W" || period === "1M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatTradeTooltipDate(date: string, period: Period): string {
  const d = new Date(date);
  if (period === "LIVE" || period === "1D") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (period === "1W" || period === "1M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/* ── Data grouping ── */

function trimToRange<T extends { date: string }>(data: T[], period: Period): T[] {
  if (period === "ALL") return data;
  const cutoffDays: Record<string, number> = { LIVE: 1, "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365 };
  const days = cutoffDays[period] ?? 365;
  const cutoff = new Date(Date.now() - days * 86400000);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function groupBy<T extends { date: string }>(
  data: T[], keyFn: (d: Date) => string, sumFields: (keyof T)[] = [],
): T[] {
  const map = new Map<string, T>();
  for (const p of data) {
    const key = keyFn(new Date(p.date));
    const existing = map.get(key);
    if (existing) {
      for (const field of sumFields) {
        (existing as Record<string, unknown>)[field as string] =
          ((existing[field] as number) ?? 0) + ((p[field] as number) ?? 0);
      }
      existing.date = p.date;
      if ("cash" in p) (existing as Record<string, unknown>).cash = (p as Record<string, unknown>).cash;
      if ("positions" in p) (existing as Record<string, unknown>).positions = (p as Record<string, unknown>).positions;
    } else {
      map.set(key, { ...p });
    }
  }
  return Array.from(map.values());
}

function groupByHour<T extends { date: string }>(data: T[], sf: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`, sf);
}
function groupByDay<T extends { date: string }>(data: T[], sf: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, sf);
}
function groupByWeek<T extends { date: string }>(data: T[], sf: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => {
    const s = new Date(d); s.setDate(s.getDate() - s.getDay());
    return `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`;
  }, sf);
}
function groupByMonth<T extends { date: string }>(data: T[], sf: (keyof T)[] = []): T[] {
  return groupBy(data, (d) => `${d.getFullYear()}-${d.getMonth()}`, sf);
}

function filterPortfolio(data: PortfolioDataPoint[], period: Period): PortfolioDataPoint[] {
  const trimmed = trimToRange(data, period);
  if (period === "LIVE" || period === "1D") return groupByHour(trimmed);
  if (period === "1W") return groupByDay(trimmed);
  if (period === "1M") return groupByWeek(trimmed);
  return groupByMonth(trimmed);
}

const TRADE_SUM: (keyof TradeDataPoint)[] = ["trades", "approved", "skipped", "rejected", "pnl"];

function filterTrades(data: TradeDataPoint[], period: Period): TradeDataPoint[] {
  const trimmed = trimToRange(data, period);
  if (period === "LIVE" || period === "1D") return groupByHour(trimmed, TRADE_SUM);
  if (period === "1W") return groupByDay(trimmed, TRADE_SUM);
  if (period === "1M") return groupByWeek(trimmed, TRADE_SUM);
  return groupByMonth(trimmed, TRADE_SUM);
}

function getTickInterval(len: number): number {
  if (len <= 12) return 0;
  if (len <= 24) return 2;
  if (len <= 31) return 4;
  return Math.ceil(len / 8);
}

const periods: Period[] = ["LIVE", "1D", "1W", "1M", "3M", "1Y", "ALL"];

/* ── Tooltip state ── */
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  values: { label: string; value: string; color: string }[];
}

/* ── Recharts Trade Tooltip ── */
function TradeTooltip({
  active, payload, period,
}: {
  active?: boolean;
  payload?: Array<{ payload: TradeDataPoint }>;
  period: Period;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const approved = point.approved || 0;
  const skipped = point.skipped || 0;
  const rejected = point.rejected || 0;
  const total = approved + skipped + rejected;
  return (
    <div className="bg-[#1a1a1a] border border-border rounded-lg px-3 py-2 shadow-xl min-w-[120px]">
      <p className="text-[11px] text-white/40 mb-1.5">
        {formatTradeTooltipDate(point.date, period)}
      </p>
      <p className="text-[13px] font-semibold text-white mb-1">{total} trades</p>
      {approved > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#00C807" }} />
          <span className="text-[11px] text-white/60">{approved} approved</span>
        </div>
      )}
      {skipped > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#FBBF24" }} />
          <span className="text-[11px] text-white/60">{skipped} skipped</span>
        </div>
      )}
      {rejected > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "#FF6B8A" }} />
          <span className="text-[11px] text-white/60">{rejected} rejected</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                        */
/* ══════════════════════════════════════════════════════════════════ */

interface Props {
  data: PortfolioDataPoint[];
  tradeData: TradeDataPoint[];
  mode: ChartMode;
  height?: number;
  activePeriod: Period;
  onPeriodChange: (period: Period) => void;
}

export function LightweightPortfolioChart({
  data, tradeData, mode, height = 300, activePeriod, onPeriodChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<ISeriesApi<SeriesType>[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, date: "", values: [] });

  const filteredPortfolio = filterPortfolio(data, activePeriod);
  const filteredTrades = filterTrades(tradeData, activePeriod);
  const hasPortfolioData = filteredPortfolio.length > 0;
  const hasTradeData = filteredTrades.length > 0;

  // Positions color: green if going up, pink if going down
  const positionsUp = filteredPortfolio.length >= 2
    ? filteredPortfolio[filteredPortfolio.length - 1].positions >= filteredPortfolio[0].positions
    : true;
  const positionsColor = positionsUp ? "#00C807" : "#FF6B8A";
  const cashColor = "#FFFFFF";

  /* ── Build Lightweight Chart (portfolio mode only) ── */
  const buildChart = useCallback(() => {
    if (!containerRef.current || mode !== "portfolio") return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    }

    if (!hasPortfolioData) return;

    const chartOptions: DeepPartial<ChartOptions> = {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#555",
        fontFamily: "CapsuleSansText, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.04)", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "rgba(255,255,255,0.15)", width: 1, style: 3, labelVisible: false },
        horzLine: { color: "rgba(255,255,255,0.08)", width: 1, style: 3, labelVisible: true },
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: activePeriod === "LIVE" || activePeriod === "1D",
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        barSpacing: filteredPortfolio.length <= 5 ? 80 : undefined,
      },
      handleScroll: false,
      handleScale: false,
    };

    const chart = createChart(containerRef.current, chartOptions);
    chartRef.current = chart;

    // Cash area series (white line with subtle shadow)
    const cashSeries = chart.addSeries(AreaSeries, {
      lineColor: cashColor, lineWidth: 2, lineType: 0,
      topColor: "rgba(255,255,255,0.12)",
      bottomColor: "rgba(255,255,255,0.01)",
      crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: cashColor, crosshairMarkerBackgroundColor: "#000",
      priceLineVisible: false, lastValueVisible: false,
    });
    cashSeries.setData(filteredPortfolio.map((d) => ({ time: toUnix(d.date) as never, value: d.cash })));
    seriesRefs.current.push(cashSeries);

    // Positions area series (green/red line with gradient shadow)
    const posSeries = chart.addSeries(AreaSeries, {
      lineColor: positionsColor, lineWidth: 2, lineType: 0,
      topColor: positionsUp ? "rgba(0,200,7,0.15)" : "rgba(255,107,138,0.15)",
      bottomColor: positionsUp ? "rgba(0,200,7,0.01)" : "rgba(255,107,138,0.01)",
      crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: positionsColor, crosshairMarkerBackgroundColor: "#000",
      priceLineVisible: false, lastValueVisible: false,
    });
    posSeries.setData(filteredPortfolio.map((d) => ({ time: toUnix(d.date) as never, value: d.positions })));
    seriesRefs.current.push(posSeries);

    // Tracking tooltip on crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }
      let cashVal = 0, posVal = 0;
      const cp = param.seriesData.get(cashSeries);
      const pp = param.seriesData.get(posSeries);
      if (cp && "value" in cp) cashVal = (cp as { value: number }).value;
      if (pp && "value" in pp) posVal = (pp as { value: number }).value;

      setTooltip({
        visible: true,
        x: param.point.x,
        y: param.point.y,
        date: formatTooltipDate(param.time as number, activePeriod),
        values: [
          { label: "Cash", value: formatLegendValue(cashVal), color: cashColor },
          { label: "Positions", value: formatLegendValue(posVal), color: positionsColor },
        ],
      });
    });

    chart.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activePeriod, data, height]);

  useEffect(() => {
    buildChart();
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } };
  }, [buildChart]);

  // Clean up chart when switching to trades mode
  useEffect(() => {
    if (mode === "trades" && chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefs.current = [];
    }
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chartRef.current?.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [buildChart]);

  const showEmpty = (mode === "portfolio" && !hasPortfolioData) || (mode === "trades" && !hasTradeData);

  // Tooltip positioning
  const containerWidth = containerRef.current?.clientWidth ?? 800;
  const tooltipWidth = 160;
  const tooltipLeft = tooltip.x + tooltipWidth + 20 > containerWidth
    ? tooltip.x - tooltipWidth - 15 : tooltip.x + 15;
  const tooltipTop = Math.max(0, tooltip.y - 40);

  const tradeInterval = getTickInterval(filteredTrades.length);

  return (
    <div>
      {showEmpty ? (
        <div style={{ height }} className="flex items-center justify-center text-white/30 text-sm">
          {mode === "portfolio" ? "No portfolio data yet — deploy a bot to start tracking" : "No trade data yet"}
        </div>
      ) : mode === "portfolio" ? (
        /* ── Lightweight Charts: Portfolio value ── */
        <div className="relative" style={{ height }}>
          <div ref={containerRef} style={{ height }} />
          {tooltip.visible && (
            <div
              className="absolute z-20 pointer-events-none bg-[#1a1a1a] border border-border rounded-lg px-3 py-2 shadow-xl"
              style={{ left: tooltipLeft, top: tooltipTop, minWidth: tooltipWidth }}
            >
              <div className="text-[11px] text-white/40 mb-1.5">{tooltip.date}</div>
              {tooltip.values.map((v) => (
                <div key={v.label} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: v.color }} />
                    {v.label}
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums text-white">{v.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Recharts: Stacked trade bars ── */
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredTrades} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              barSize={filteredTrades.length <= 12 ? 14 : filteredTrades.length <= 31 ? 6 : 18}
              stackOffset="none"
            >
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatXAxis(d, activePeriod)}
                interval={tradeInterval}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false} tickLine={false} dy={6}
              />
              <YAxis hide />
              <Tooltip content={<TradeTooltip period={activePeriod} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
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
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activePeriod === "LIVE" ? "bg-gain animate-pulse" : "bg-[#444]"}`} />
            )}
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}
