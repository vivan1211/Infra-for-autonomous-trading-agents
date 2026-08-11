"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useMemo } from "react";
import { useWikiAggregates } from "@/hooks/use-wiki";

/* ================================================================ */
/*  HELPERS                                                          */
/* ================================================================ */

function fmtPnl(v: any, dashOnZero = false): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (dashOnZero && n === 0) return "\u2014";
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

function rawColor(v: number): string {
  return v >= 0 ? "#00C807" : "#FF6B8A";
}

/** Convert "2026-W15" → "Apr 6 – 12" */
function isoWeekToDateRange(isoWeek: string): string {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return isoWeek;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mon1 = new Date(jan4);
  mon1.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const monday = new Date(mon1);
  monday.setUTCDate(mon1.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mMon = months[monday.getUTCMonth()];
  const mSun = months[sunday.getUTCMonth()];
  if (mMon === mSun) return `${mMon} ${monday.getUTCDate()} – ${sunday.getUTCDate()}`;
  return `${mMon} ${monday.getUTCDate()} – ${mSun} ${sunday.getUTCDate()}`;
}

/* ================================================================ */
/*  SHARED UI                                                        */
/* ================================================================ */

function SectionHeader({ title, first }: { title: string; first?: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 72 }}>
      <h2 className="text-[22px] font-semibold text-white">{title}</h2>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 24 }} />
    </div>
  );
}

function UnderlineTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div
      className="flex items-center gap-6 mb-8"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        paddingTop: 0,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="text-[14px] font-semibold transition-colors py-3 relative"
          style={{ color: active === t ? "#fff" : "#919fa6", background: "transparent", border: "none" }}
        >
          {t}
          {active === t && <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full" style={{ background: "#00C807" }} />}
        </button>
      ))}
    </div>
  );
}

function HBar({ label, valueFmt, pct, color = "#fff", labelW = 120, valueW = 60 }: {
  label: string; valueFmt?: string; pct: number; color?: string; labelW?: number; valueW?: number;
}) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
      <span className="text-[14px] text-white truncate" style={{ width: labelW, minWidth: labelW }}>{label}</span>
      <div className="flex-1 h-[4px]" style={{ background: "#1a1a1a", borderRadius: 2 }}>
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 2 }} />
      </div>
      <span className="text-[14px] text-white tabular-nums text-right" style={{ width: valueW, minWidth: valueW, color }}>
        {valueFmt ?? ""}
      </span>
    </div>
  );
}

function FilterDropdown({ label, options, value, onChange }: {
  label?: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[13px] text-white/40">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg text-[13px] bg-surface border border-white/10 text-white/70 outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function WeekDropdown({ weeks, value, onChange }: { weeks: string[]; value: string; onChange: (v: string) => void }) {
  if (weeks.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-white/40">Week:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg text-[13px] bg-surface border border-white/10 text-white/70 outline-none"
      >
        <option value="all">All Weeks</option>
        {weeks.map((w) => (
          <option key={w} value={w}>{isoWeekToDateRange(w)}</option>
        ))}
      </select>
    </div>
  );
}

/* ================================================================ */
/*  BREAKDOWN TABLE (shared by all 6 tabs)                           */
/* ================================================================ */

type BreakdownRow = {
  label: string;
  placed: number;
  cf: number;
  placedWon: number;
  placedDecided: number;
  cfWon: number;
  cfDecided: number;
  placedPnl: number;
  cfPnl: number;
};

function computeTotals(rows: BreakdownRow[]): BreakdownRow {
  const t: BreakdownRow = { label: "TOTAL", placed: 0, cf: 0, placedWon: 0, placedDecided: 0, cfWon: 0, cfDecided: 0, placedPnl: 0, cfPnl: 0 };
  rows.forEach((r) => {
    t.placed += r.placed;
    t.cf += r.cf;
    t.placedWon += r.placedWon;
    t.placedDecided += r.placedDecided;
    t.cfWon += r.cfWon;
    t.cfDecided += r.cfDecided;
    t.placedPnl += r.placedPnl;
    t.cfPnl += r.cfPnl;
  });
  return t;
}

function wrPct(won: number, decided: number): string {
  if (decided === 0) return "\u2014";
  return `${(won / decided * 100).toFixed(1)}%`;
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  const total = computeTotals(rows);
  const cols = "2fr 0.6fr 0.6fr 0.8fr 0.8fr 0.8fr 0.8fr";

  /* Find best (most positive) and worst (most negative) PnL per column for highlighting */
  const placedPnls = rows.filter((r) => r.placedPnl !== 0).map((r) => r.placedPnl);
  const cfPnls = rows.filter((r) => r.cfPnl !== 0).map((r) => r.cfPnl);
  const bestPlacedPnl = placedPnls.length > 0 ? Math.max(...placedPnls) : null;
  const worstPlacedPnl = placedPnls.length > 0 ? Math.min(...placedPnls) : null;
  const bestCfPnl = cfPnls.length > 0 ? Math.max(...cfPnls) : null;
  const worstCfPnl = cfPnls.length > 0 ? Math.min(...cfPnls) : null;

  function pnlCellColor(val: number, best: number | null, worst: number | null): string {
    if (best !== null && val > 0 && val === best) return "#00C807";
    if (worst !== null && val < 0 && val === worst) return "#FF6B8A";
    return "#fff";
  }

  const renderRow = (r: BreakdownRow, i: number, isTotal: boolean) => (
    <div
      key={isTotal ? "total" : i}
      className="grid items-center"
      style={{
        gridTemplateColumns: cols,
        padding: "14px 0",
        borderBottom: isTotal ? "none" : "1px solid rgba(255,255,255,0.08)",
        fontSize: 14,
        background: isTotal ? "rgba(255,255,255,0.03)" : "transparent",
      }}
    >
      <span className={`text-white ${isTotal ? "font-bold" : "font-medium"}`}>{r.label}</span>
      <span className={`text-right tabular-nums text-white ${isTotal ? "font-bold" : ""}`}>{!isTotal && r.placed === 0 ? "\u2014" : r.placed}</span>
      <span className={`text-right tabular-nums text-white ${isTotal ? "font-bold" : ""}`}>{!isTotal && r.cf === 0 ? "\u2014" : r.cf}</span>
      <span className={`text-right tabular-nums text-white ${isTotal ? "font-bold" : ""}`}>{wrPct(r.placedWon, r.placedDecided)}</span>
      <span className={`text-right tabular-nums text-white ${isTotal ? "font-bold" : ""}`}>{wrPct(r.cfWon, r.cfDecided)}</span>
      <span
        className={`text-right tabular-nums ${isTotal ? "font-bold" : ""}`}
        style={{ color: isTotal ? rawColor(r.placedPnl) : pnlCellColor(r.placedPnl, bestPlacedPnl, worstPlacedPnl) }}
      >
        {!isTotal && r.placedPnl === 0 && r.placed === 0 ? "\u2014" : fmtPnl(r.placedPnl)}
      </span>
      <span
        className={`text-right tabular-nums ${isTotal ? "font-bold" : ""}`}
        style={{ color: isTotal ? rawColor(r.cfPnl) : pnlCellColor(r.cfPnl, bestCfPnl, worstCfPnl) }}
      >
        {!isTotal && r.cfPnl === 0 && r.cf === 0 ? "\u2014" : fmtPnl(r.cfPnl)}
      </span>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 640 }}>
        {/* Header */}
        <div
          className="grid text-[13px] font-bold text-white/50"
          style={{ gridTemplateColumns: cols, borderBottom: "1.5px solid rgba(255,255,255,0.15)", padding: "0 0 12px 0" }}
        >
          <span />
          <span className="text-right">Placed</span>
          <span className="text-right">CF</span>
          <span className="text-right">Placed WR</span>
          <span className="text-right">CF WR</span>
          <span className="text-right">Placed PnL</span>
          <span className="text-right">CF PnL</span>
        </div>
        {/* Rows */}
        {rows.map((r, i) => renderRow(r, i, false))}
        {/* Total */}
        <div style={{ borderTop: "1.5px solid rgba(255,255,255,0.15)" }}>
          {renderRow(total, -1, true)}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */
/*  MAIN PAGE                                                        */
/* ================================================================ */

export default function OverviewV2Page() {
  const { aggregates, loading, error } = useWikiAggregates();

  /* Global filter state */
  const [globalBot, setGlobalBot] = useState("All");
  const [globalTime, setGlobalTime] = useState("All Time");
  const [globalWeek, setGlobalWeek] = useState("all");
  const [globalMonth, setGlobalMonth] = useState("all");

  /* Section tab state */
  const [breakdownTab, setBreakdownTab] = useState("By Week");
  const [diagTab, setDiagTab] = useState("Pipeline");

  /* Per-breakdown-tab filters */
  const [bdBot, setBdBot] = useState("All");
  const [bdWeek, setBdWeek] = useState("all");

  /* ── Parse data (safe when aggregates is null) ─────────────────── */

  const rawSnap = aggregates?.data_snapshot;
  const snap: any = typeof rawSnap === "string" ? JSON.parse(rawSnap) : (rawSnap ?? {});
  const o = snap.overall ?? {};

  /* Weekly per bot data */
  const wpb: any = snap.weekly_per_bot ?? {};
  const allWeeks: string[] = wpb.weeks ?? [];
  const allBots: string[] = wpb.bots ?? [];
  const weeklyRows: any = wpb.rows ?? {};

  const botOptions = ["All", ...allBots];

  /* Months from weeks */
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    allWeeks.forEach((w) => {
      const match = w.match(/^(\d{4})-W(\d{2})$/);
      if (match) {
        const year = parseInt(match[1], 10);
        const week = parseInt(match[2], 10);
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dow = jan4.getUTCDay() || 7;
        const mon1 = new Date(jan4);
        mon1.setUTCDate(jan4.getUTCDate() - (dow - 1));
        const monday = new Date(mon1);
        monday.setUTCDate(mon1.getUTCDate() + (week - 1) * 7);
        const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        months.add(`${mNames[monday.getUTCMonth()]} ${year}`);
      }
    });
    return Array.from(months);
  }, [allWeeks]);

  /* ── Aggregate weekly data by global filters ───────────────────── */

  const filteredWeeks = useMemo(() => {
    if (globalTime === "All Time") return allWeeks;
    if (globalTime === "Week" && globalWeek !== "all") return [globalWeek];
    if (globalTime === "Month" && globalMonth !== "all") {
      return allWeeks.filter((w) => {
        const match = w.match(/^(\d{4})-W(\d{2})$/);
        if (!match) return false;
        const year = parseInt(match[1], 10);
        const week = parseInt(match[2], 10);
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dow = jan4.getUTCDay() || 7;
        const mon1 = new Date(jan4);
        mon1.setUTCDate(jan4.getUTCDate() - (dow - 1));
        const monday = new Date(mon1);
        monday.setUTCDate(mon1.getUTCDate() + (week - 1) * 7);
        const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${mNames[monday.getUTCMonth()]} ${year}` === globalMonth;
      });
    }
    return allWeeks;
  }, [globalTime, globalWeek, globalMonth, allWeeks]);

  const filteredBots = globalBot === "All" ? allBots : allBots.filter((b) => b === globalBot);

  const globalAgg = useMemo(() => {
    let nPlaced = 0, nDecided = 0, nWon = 0, realPnl = 0;
    let cfDecided = 0, cfWon = 0, cfPnl = 0, nTrades = 0;
    filteredBots.forEach((bot) => {
      filteredWeeks.forEach((wk) => {
        const cell = weeklyRows[bot]?.[wk];
        if (!cell) return;
        nTrades += cell.n_trades ?? 0;
        nPlaced += cell.n_placed ?? 0;
        nDecided += cell.n_decided ?? 0;
        nWon += cell.n_won ?? 0;
        realPnl += cell.real_pnl ?? 0;
        cfDecided += cell.cf_n_decided ?? 0;
        cfWon += cell.cf_n_won ?? 0;
        cfPnl += cell.cf_pnl ?? 0;
      });
    });
    return { nPlaced, nDecided, nWon, realPnl, cfDecided, cfWon, cfPnl, nTrades };
  }, [filteredBots, filteredWeeks, weeklyRows]);

  /* ── Early returns (after all hooks) ───────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl h-[400px]" style={{ background: "#0a0a0a" }} />
        ))}
      </div>
    );
  }

  if (error || !aggregates) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "No aggregate data yet"}</p>;
  }

  /* Use overall stats when unfiltered, aggregated when filtered */
  const isFiltered = globalBot !== "All" || globalTime !== "All Time";

  const kpiRealPnl = isFiltered ? globalAgg.realPnl : pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);
  const kpiCfPnl = isFiltered ? globalAgg.cfPnl : pnlVal(o.cf_pnl_sum ?? 0);
  const kpiWon = isFiltered ? globalAgg.nWon : Number(o.real_n_won ?? 0);
  const kpiDecided = isFiltered ? globalAgg.nDecided : Number(o.n_real_settled ?? 0);
  const kpiWinRate = kpiDecided > 0 ? kpiWon / kpiDecided : null;
  const kpiCfWon = isFiltered ? globalAgg.cfWon : Number(o.cf_n_won ?? 0);
  const kpiCfDecided = isFiltered ? globalAgg.cfDecided : Number(o.n_cf_settled ?? 0);
  const kpiCfWinRate = kpiCfDecided > 0 ? kpiCfWon / kpiCfDecided : null;
  const kpiSharpe = !isFiltered ? o.trade_sharpe : null;
  const kpiMaxDd = !isFiltered ? o.max_drawdown : null;

  /* Summary bar data (always overall) */
  const overallRealPnl = pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);
  const overallCfPnl = pnlVal(o.cf_pnl_sum ?? 0);
  const filterSavings = overallRealPnl - overallCfPnl;
  const overallWinRate = o.real_win_rate != null ? Number(o.real_win_rate) : null;
  const brier = snap.calibration?.brier ?? null;
  const brierImprove = brier != null ? ((0.25 - Number(brier)) / 0.25 * 100) : null;

  /* Diagnostics data */
  const skipReasons: any = snap.skip_reasons ?? {};
  const rawPerAgent = snap.per_agent ?? {};
  const perAgent: any[] = [];
  Object.entries(rawPerAgent).forEach(([botId, roles]: [string, any]) => {
    Object.entries(roles ?? {}).forEach(([role, stats]: [string, any]) => {
      perAgent.push({ agent_name: `${botId} / ${role}`, bot_id: botId, role, ...stats });
    });
  });
  const wonCorr: any = snap.correlations?.won_correlations ?? {};
  const calBuckets: any[] = Array.isArray(snap.calibration?.buckets) ? snap.calibration.buckets : [];
  const bioObj = snap.bimodality ?? {};
  const totalSignals = Object.values(bioObj).reduce((s: number, b: any) => s + (b?.n_total ?? 0), 0) as number;
  const reachedResearch = Object.values(bioObj).reduce((s: number, b: any) => s + (b?.n_research_reaching ?? 0), 0) as number;
  const rm: any = snap.risk_manager_audit ?? {};
  const marketByWeek = snap.market_by_week ?? {};

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div>

      {/* ============================================================ */}
      {/* GLOBAL FILTERS                                                */}
      {/* ============================================================ */}

      <div className="flex flex-wrap items-center justify-end gap-4 mb-8">
        <FilterDropdown label="Bot:" options={botOptions} value={globalBot} onChange={setGlobalBot} />
        <FilterDropdown label="Period:" options={["All Time", "Week", "Month"]} value={globalTime} onChange={(v) => { setGlobalTime(v); setGlobalWeek("all"); setGlobalMonth("all"); }} />
        {globalTime === "Week" && (
          <WeekDropdown weeks={allWeeks} value={globalWeek} onChange={setGlobalWeek} />
        )}
        {globalTime === "Month" && monthOptions.length > 0 && (
          <select
            value={globalMonth}
            onChange={(e) => setGlobalMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[13px] bg-surface border border-white/10 text-white/70 outline-none"
          >
            <option value="all">All Months</option>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {/* ============================================================ */}
      {/* KPI CARDS                                                     */}
      {/* ============================================================ */}

      <div className="flex gap-3 overflow-x-auto pb-2" style={{ marginBottom: 48 }}>
        {[
          {
            title: "Realized PnL",
            value: fmtPnl(kpiRealPnl),
            cf: `CF: ${fmtPnl(kpiCfPnl)}`,
            sub: `on ${kpiDecided} settled`,
            color: rawColor(kpiRealPnl),
            cfColor: rawColor(kpiCfPnl),
          },
          {
            title: "Win Rate",
            value: kpiWinRate != null ? fmtPct(kpiWinRate) : "\u2014",
            cf: kpiCfWinRate != null ? `CF: ${fmtPct(kpiCfWinRate)}` : "CF: \u2014",
            sub: `n=${kpiDecided}`,
            color: kpiWinRate != null ? rawColor(kpiWinRate - 0.5) : "#fff",
            cfColor: kpiCfWinRate != null ? rawColor(kpiCfWinRate - 0.5) : "#919fa6",
          },
          {
            title: "Sharpe Ratio",
            value: kpiSharpe != null ? `${Number(kpiSharpe) >= 0 ? "+" : ""}${Number(kpiSharpe).toFixed(2)}` : "\u2014",
            cf: "CF: \u2014",
            sub: kpiSharpe != null ? "trade-level" : (isFiltered ? "overall only" : ""),
            color: kpiSharpe != null ? rawColor(Number(kpiSharpe)) : "#919fa6",
            cfColor: "#919fa6",
          },
          {
            title: "Max Drawdown",
            value: kpiMaxDd != null ? fmtPnl(-Math.abs(Number(kpiMaxDd))) : "\u2014",
            cf: "CF: \u2014",
            sub: kpiMaxDd != null ? "peak-to-trough" : (isFiltered ? "overall only" : ""),
            color: "#FF6B8A",
            cfColor: "#919fa6",
          },
        ].map((card, i) => (
          <div
            key={i}
            className="rounded-xl flex-shrink-0 flex flex-col"
            style={{ minWidth: 195, width: 195, border: "1px solid rgba(255,255,255,0.08)", padding: "24px 20px" }}
          >
            <span className="text-[14px] font-medium text-white" style={{ lineHeight: 1.2, marginBottom: 6 }}>{card.title}</span>
            <div className="flex-1" />
            <div style={{ marginTop: 28 }}>
              <div className="text-[20px] font-bold tabular-nums" style={{ color: card.color }}>{card.value}</div>
              <div className="text-[13px] tabular-nums" style={{ color: card.cfColor, marginTop: 4 }}>{card.cf}</div>
              {card.sub && <div className="text-[13px]" style={{ color: "#919fa6", marginTop: 8 }}>{card.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ============================================================ */}
      {/* SUMMARY BARS                                                  */}
      {/* ============================================================ */}

      {overallWinRate != null && (
        <div className="flex items-center gap-12" style={{ marginBottom: 56 }}>
          <div
            className="rounded-full flex flex-col items-center justify-center flex-shrink-0"
            style={{ width: 120, height: 120, background: "#1a2e1a" }}
          >
            <span className="text-[20px] font-bold tabular-nums" style={{ color: "#00C807" }}>
              {(Number(overallWinRate) * 100).toFixed(0)}%
            </span>
            <span className="text-[11px]" style={{ color: "#00C807" }}>win rate</span>
          </div>
          <div className="flex-1">
            <HBar label="Win Rate" valueFmt={fmtPct(overallWinRate)} pct={Number(overallWinRate) * 100} color="#fff" />
            <HBar
              label="Brier vs Random"
              valueFmt={brier != null ? `${brierImprove?.toFixed(1)}% better` : "\u2014"}
              pct={brierImprove != null ? Math.min(100, brierImprove) : 0}
              color="#fff"
            />
            <HBar
              label="Filter Savings"
              valueFmt={fmtPnl(filterSavings)}
              pct={overallCfPnl !== 0 ? Math.min(100, Math.abs(filterSavings / overallCfPnl) * 100) : 0}
              color="#fff"
              valueW={90}
            />
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* BREAKDOWN                                                     */}
      {/* ============================================================ */}

      <SectionHeader title="Breakdown" />

      <UnderlineTabs
        tabs={["By Week", "Category", "Market Expiry", "Entry Price", "Confidence", "Edge"]}
        active={breakdownTab}
        onChange={(t) => { setBreakdownTab(t); setBdBot("All"); setBdWeek("all"); }}
      />

      {/* Per-tab filters */}
      <div className="flex flex-wrap items-center justify-end gap-4 mb-6">
        <FilterDropdown label="Bot:" options={["All", ...allBots]} value={bdBot} onChange={(v) => { setBdBot(v); setBdWeek("all"); }} />
        {breakdownTab !== "By Week" && (
          <WeekDropdown weeks={allWeeks} value={bdWeek} onChange={setBdWeek} />
        )}
      </div>

      {/* Tab content */}
      {breakdownTab === "By Week" && (
        <ByWeekTab weeklyRows={weeklyRows} allWeeks={allWeeks} allBots={allBots} botFilter={bdBot} />
      )}
      {breakdownTab === "Category" && (
        <CategoryTab snap={snap} botFilter={bdBot} weekFilter={bdWeek} marketByWeek={marketByWeek} />
      )}
      {breakdownTab === "Market Expiry" && (
        <BucketBreakdownTab snap={snap} field="timing" botFilter={bdBot} weekFilter={bdWeek} marketByWeek={marketByWeek} />
      )}
      {breakdownTab === "Entry Price" && (
        <BucketBreakdownTab snap={snap} field="price" botFilter={bdBot} weekFilter={bdWeek} marketByWeek={marketByWeek} />
      )}
      {breakdownTab === "Confidence" && (
        <GenericBucketTab data={snap.hit_rate_by_confidence} />
      )}
      {breakdownTab === "Edge" && (
        <GenericBucketTab data={snap.hit_rate_by_signed_edge} />
      )}

      {/* ============================================================ */}
      {/* DIAGNOSTICS                                                   */}
      {/* ============================================================ */}

      <SectionHeader title="Diagnostics" />

      <UnderlineTabs
        tabs={["Pipeline", "Correlations", "Skip Profile", "Agent Calibration", "Brier Score", "Reliability Table"]}
        active={diagTab}
        onChange={setDiagTab}
      />

      {diagTab === "Pipeline" && (
        <PipelineTab
          totalSignals={totalSignals}
          reachedResearch={reachedResearch}
          placed={Number(o.n_placed ?? 0)}
          settled={Number(o.n_real_settled ?? 0)}
          realPnl={overallRealPnl}
          rm={rm}
        />
      )}
      {diagTab === "Correlations" && <CorrelationsTab wonCorr={wonCorr} />}
      {diagTab === "Skip Profile" && <SkipProfileTab skipReasons={skipReasons} />}
      {diagTab === "Agent Calibration" && <AgentCalibrationTab perAgent={perAgent} />}
      {diagTab === "Brier Score" && <BrierScoreTab brier={brier} brierImprove={brierImprove} />}
      {diagTab === "Reliability Table" && <ReliabilityTableTab calBuckets={calBuckets} />}
    </div>
  );
}

/* ================================================================ */
/*  BREAKDOWN TABS                                                    */
/* ================================================================ */

function ByWeekTab({ weeklyRows, allWeeks, allBots, botFilter }: {
  weeklyRows: any; allWeeks: string[]; allBots: string[]; botFilter: string;
}) {
  const bots = botFilter === "All" ? allBots : allBots.filter((b) => b === botFilter);

  const rows: BreakdownRow[] = allWeeks.map((wk) => {
    let nPlaced = 0, nDecided = 0, nWon = 0, realPnl = 0;
    let nCf = 0, cfDecided = 0, cfWon = 0, cfPnl = 0;
    bots.forEach((bot) => {
      const cell = weeklyRows[bot]?.[wk];
      if (!cell) return;
      nPlaced += cell.n_placed ?? 0;
      nDecided += cell.n_decided ?? 0;
      nWon += cell.n_won ?? 0;
      realPnl += cell.real_pnl ?? 0;
      nCf += (cell.n_trades ?? 0) - (cell.n_placed ?? 0);
      cfDecided += cell.cf_n_decided ?? 0;
      cfWon += cell.cf_n_won ?? 0;
      cfPnl += cell.cf_pnl ?? 0;
    });
    return {
      label: isoWeekToDateRange(wk),
      placed: nPlaced, cf: nCf,
      placedWon: nWon, placedDecided: nDecided,
      cfWon, cfDecided,
      placedPnl: realPnl, cfPnl,
    };
  });

  if (rows.length === 0) return <p className="text-[13px] text-white/40">No weekly data available.</p>;
  return <BreakdownTable rows={rows} />;
}

function CategoryTab({ snap, botFilter, weekFilter, marketByWeek }: {
  snap: any; botFilter: string; weekFilter: string; marketByWeek: any;
}) {
  let rawCats: any;
  if (weekFilter !== "all") {
    rawCats = marketByWeek?.categories_by_week?.[weekFilter];
  } else if (botFilter !== "All") {
    rawCats = snap?.categories_per_bot?.[botFilter];
  } else {
    rawCats = snap?.categories_per_bot?.all ?? snap?.categories;
  }

  const cats: any[] = Array.isArray(rawCats)
    ? rawCats
    : Object.entries(rawCats ?? {}).map(([name, v]: [string, any]) => ({ category: name, ...v }));

  if (cats.length === 0) return <p className="text-[13px] text-white/40">No category data available.</p>;

  const rows: BreakdownRow[] = cats
    .sort((a, b) => pnlVal(b.real_pnl) - pnlVal(a.real_pnl))
    .map((c) => ({
      label: c.category ?? c.name ?? "Unknown",
      placed: c.n_placed ?? 0,
      cf: c.n_cf ?? (c.n ?? 0) - (c.n_placed ?? 0),
      placedWon: c.real_n_won ?? (c.n_decided != null && c.real_win_rate != null ? Math.round(c.real_win_rate * c.n_decided) : 0),
      placedDecided: c.n_decided ?? 0,
      cfWon: c.cf_n_won ?? 0,
      cfDecided: c.cf_n_decided ?? 0,
      placedPnl: pnlVal(c.real_pnl),
      cfPnl: pnlVal(c.cf_pnl ?? 0),
    }));

  return <BreakdownTable rows={rows} />;
}

function BucketBreakdownTab({ snap, field, botFilter, weekFilter, marketByWeek }: {
  snap: any; field: "timing" | "price"; botFilter: string; weekFilter: string; marketByWeek: any;
}) {
  const perBotKey = field === "timing" ? "hit_rate_by_timing_per_bot" : "hit_rate_by_price_per_bot";
  const weekKey = field === "timing" ? "timing_by_week" : "price_by_week";

  let data: any;
  if (weekFilter !== "all") {
    data = marketByWeek?.[weekKey]?.[weekFilter];
  } else if (botFilter !== "All") {
    data = snap?.[perBotKey]?.[botFilter];
  } else {
    data = snap?.[perBotKey]?.all ?? snap?.[field === "timing" ? "hit_rate_by_timing" : "hit_rate_by_price"];
  }

  const buckets = data?.buckets ?? [];
  if (buckets.length === 0) return <p className="text-[13px] text-white/40">No data available.</p>;

  const rows: BreakdownRow[] = buckets.map((b: any) => ({
    label: b.range ?? b.label ?? "",
    placed: b.n_placed ?? 0,
    cf: b.n_cf ?? 0,
    placedWon: b.n_won ?? 0,
    placedDecided: b.n_decided ?? 0,
    cfWon: b.cf_n_won ?? 0,
    cfDecided: b.cf_n_decided ?? 0,
    placedPnl: pnlVal(b.real_pnl),
    cfPnl: pnlVal(b.cf_pnl ?? 0),
  }));

  return <BreakdownTable rows={rows} />;
}

function GenericBucketTab({ data }: { data: any }) {
  const buckets = data?.buckets ?? [];
  if (buckets.length === 0) return <p className="text-[13px] text-white/40">No data available.</p>;

  const rows: BreakdownRow[] = buckets.map((b: any) => ({
    label: b.range ?? "",
    placed: b.n_placed ?? 0,
    cf: b.n_cf ?? 0,
    placedWon: b.n_won ?? 0,
    placedDecided: b.n_decided ?? 0,
    cfWon: b.cf_n_won ?? 0,
    cfDecided: b.cf_n_decided ?? 0,
    placedPnl: pnlVal(b.real_pnl),
    cfPnl: pnlVal(b.cf_pnl ?? 0),
  }));

  return <BreakdownTable rows={rows} />;
}

/* ================================================================ */
/*  DIAGNOSTICS TABS                                                  */
/* ================================================================ */

function PipelineTab({ totalSignals, reachedResearch, placed, settled, realPnl, rm }: {
  totalSignals: number; reachedResearch: number; placed: number; settled: number; realPnl: number; rm: any;
}) {
  const steps = [
    { label: "Signals Detected", value: totalSignals, widthPct: "100%", isLast: false },
    { label: "Reached Research", value: reachedResearch, widthPct: "88%", isLast: false },
    { label: "Placed", value: placed, widthPct: "60%", isLast: false },
    { label: "Settled", value: settled, widthPct: "40%", isLast: false },
    { label: "Realized PnL", value: null as number | null, pnl: realPnl, widthPct: "28%", isLast: true },
  ];

  const rmEndorsed = rm.rm_endorsed_placed ?? {};
  const rmOverridden = rm.rm_overridden_placed ?? {};
  const rmSavePnl = rm.rm_save_cf_pnl_avoided ?? null;
  const rmSaveRate = rm.rm_save_correct_rate ?? null;

  const rmRows = [
    { metric: "RM-Endorsed Placed", value: rmEndorsed.n ?? "\u2014", detail: rmEndorsed.win_rate != null ? `Win: ${fmtPct(rmEndorsed.win_rate)}, PnL: ${fmtPnl(rmEndorsed.real_pnl)}` : "" },
    { metric: "RM-Overridden Placed", value: rmOverridden.n ?? "\u2014", detail: rmOverridden.real_pnl != null ? `PnL: ${fmtPnl(rmOverridden.real_pnl)}` : "" },
    { metric: "RM Save CF PnL Avoided", value: rmSavePnl != null ? fmtPnl(rmSavePnl) : "\u2014", detail: "" },
    { metric: "RM Save Correct Rate", value: rmSaveRate != null ? fmtPct(rmSaveRate) : "\u2014", detail: "" },
  ];

  return (
    <div>
      <div className="flex flex-col items-center gap-0 mb-10">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center" style={{ width: "100%" }}>
            {i > 0 && <div style={{ width: 2, height: 16, background: "rgba(255,255,255,0.1)" }} />}
            <div
              className="rounded-lg flex items-center justify-between"
              style={{
                width: step.widthPct,
                padding: "14px 20px",
                border: step.isLast ? "1px solid rgba(0,200,7,0.15)" : `1px solid rgba(255,255,255,${i === 0 ? 0.08 : 0.06})`,
                background: step.isLast ? "rgba(0,200,7,0.05)" : "transparent",
              }}
            >
              <span className="text-[14px] text-white">{step.label}</span>
              {step.pnl != null ? (
                <span className="text-[14px] font-bold tabular-nums" style={{ color: rawColor(step.pnl) }}>{fmtPnl(step.pnl)}</span>
              ) : (
                <span className="text-[14px] font-bold tabular-nums text-white">
                  {step.value?.toLocaleString() ?? 0}
                  {totalSignals > 0 && step.value != null && (
                    <span className="text-[11px] font-normal ml-2" style={{ color: "#919fa6" }}>({(step.value / totalSignals * 100).toFixed(0)}%)</span>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {(rmEndorsed.n != null || rmOverridden.n != null) && (
        <>
          <p className="text-[14px] text-white font-medium mb-4">RM Performance</p>
          <div className="overflow-x-auto">
            <div className="grid text-[14px] font-bold text-white" style={{ gridTemplateColumns: "2.5fr 1fr 1.5fr", borderBottom: "1.5px solid rgba(255,255,255,0.2)", padding: "12px 0" }}>
              <span>Metric</span><span className="text-right">Value</span><span className="text-right">Detail</span>
            </div>
            {rmRows.map((row, i) => (
              <div key={i} className="grid items-center" style={{ gridTemplateColumns: "2.5fr 1fr 1.5fr", padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 14 }}>
                <span className="text-white/70">{row.metric}</span>
                <span className="text-right text-white tabular-nums">{row.value}</span>
                <span className="text-right" style={{ color: "#919fa6" }}>{row.detail}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CorrelationsTab({ wonCorr }: { wonCorr: any }) {
  const entries = Object.entries(wonCorr ?? {}).filter(([, v]) => v != null);
  if (entries.length === 0) return <p className="text-[13px] text-white/40">No correlation data available.</p>;

  const sorted = entries.sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])));
  const maxAbs = Math.max(0.001, ...sorted.map(([, v]) => Math.abs(Number(v))));

  return (
    <div>
      {sorted.map(([field, val], i) => {
        const r = Number(val);
        const color = r >= 0 ? "#00C807" : "#FF6B8A";
        const pct = Math.abs(r) / maxAbs * 50;
        return (
          <div key={i} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <span className="text-[14px] text-white truncate" style={{ width: 130, minWidth: 130 }}>{field}</span>
            <div className="flex-1 h-[4px] relative rounded" style={{ background: "#1a1a1a" }}>
              <div className="absolute top-[-4px] bottom-[-4px] w-px" style={{ left: "50%", background: "rgba(255,255,255,0.15)" }} />
              {r >= 0 ? (
                <div className="absolute h-full rounded-r" style={{ left: "50%", width: `${pct}%`, background: color }} />
              ) : (
                <div className="absolute h-full rounded-l" style={{ right: "50%", width: `${pct}%`, background: color }} />
              )}
            </div>
            <span className="text-[14px] tabular-nums text-right" style={{ width: 90, minWidth: 90, color }}>
              r={r >= 0 ? "+" : ""}{r.toFixed(3)}
            </span>
          </div>
        );
      })}
      <div className="mt-6 rounded-lg" style={{ border: "1px solid #21262d", padding: 16 }}>
        <p className="text-[13px]" style={{ color: "#919fa6" }}>
          Correlations with real_won outcome. Green = positive predictor, red = negative predictor.
        </p>
      </div>
    </div>
  );
}

function SkipProfileTab({ skipReasons }: { skipReasons: any }) {
  const entries = Object.entries(skipReasons);
  if (entries.length === 0) return <p className="text-[13px] text-white/40">No skip data available.</p>;

  return (
    <div className="grid grid-cols-2 gap-8">
      {entries.map(([bot, reasons]: [string, any]) => {
        const items: { reason: string; count: number }[] = Array.isArray(reasons)
          ? reasons
          : Object.entries(reasons ?? {}).map(([r, c]) => ({ reason: r, count: Number(c) }));
        const maxCount = Math.max(1, ...items.map((x) => x.count));
        return (
          <div key={bot}>
            <p className="text-[14px] text-white font-medium mb-4">{bot}</p>
            {items.sort((a, b) => b.count - a.count).map((item, i) => (
              <div key={i} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="text-[14px] text-white truncate" style={{ width: 110, minWidth: 110 }}>{item.reason}</span>
                <div className="flex-1 h-[4px]" style={{ background: "#1a1a1a", borderRadius: 2 }}>
                  <div className="h-full" style={{ width: `${(item.count / maxCount) * 100}%`, background: "#fff", borderRadius: 2 }} />
                </div>
                <span className="text-[14px] tabular-nums text-right text-white" style={{ width: 40, minWidth: 40 }}>{item.count}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AgentCalibrationTab({ perAgent }: { perAgent: any[] }) {
  const sorted = perAgent.filter((a: any) => a.brier != null).sort((a: any, b: any) => Number(a.brier) - Number(b.brier));
  if (sorted.length === 0) return <p className="text-[13px] text-white/40">No agent calibration data.</p>;

  const maxBrier = Math.max(0.001, ...sorted.map((a: any) => Number(a.brier)));
  const baseline = 0.25;

  return (
    <div>
      {sorted.map((agent: any, i: number) => {
        const val = Number(agent.brier);
        const pct = (val / Math.max(maxBrier, baseline * 1.2)) * 100;
        const color = val > baseline ? "#FF6B8A" : "#fff";
        return (
          <div key={i} className="flex items-center gap-3 relative" style={{ marginBottom: i === sorted.length - 1 ? 20 : 12 }}>
            <span className="text-[14px] text-white truncate" style={{ width: 160, minWidth: 160 }}>{agent.agent_name ?? "agent"}</span>
            <div className="flex-1 h-[4px] relative" style={{ background: "#1a1a1a", borderRadius: 2 }}>
              <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2 }} />
              <div className="absolute top-[-6px] bottom-[-6px]" style={{ left: `${(baseline / Math.max(maxBrier, baseline * 1.2)) * 100}%`, width: 1, borderLeft: "1px dashed rgba(255,255,255,0.3)" }} />
            </div>
            <span className="text-[14px] tabular-nums text-right" style={{ width: 60, minWidth: 60, color }}>{fmtNum(val)}</span>
          </div>
        );
      })}
      <p className="text-[13px] mt-5" style={{ color: "#919fa6" }}>Random baseline = 0.250</p>
    </div>
  );
}

function BrierScoreTab({ brier, brierImprove }: { brier: any; brierImprove: number | null }) {
  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
        <div>
          <span className="text-[28px] font-bold tabular-nums text-white">{brier != null ? fmtNum(brier) : "\u2014"}</span>
          <p className="text-[13px]" style={{ color: "#919fa6" }}>you</p>
        </div>
        <span className="text-[14px]" style={{ color: "#919fa6" }}>vs</span>
        <div>
          <span className="text-[28px] font-bold tabular-nums" style={{ color: "#6B6B6B" }}>0.250</span>
          <p className="text-[13px]" style={{ color: "#919fa6" }}>random</p>
        </div>
      </div>
      {brierImprove != null && (
        <p className="text-[14px] font-medium" style={{ color: "#00C807" }}>{brierImprove.toFixed(1)}% better than guessing</p>
      )}
      <p className="text-[13px] mt-4" style={{ color: "#919fa6" }}>
        The Brier score measures the mean squared error of probability predictions. A score of 0 is perfect; 0.250 is random guessing (coin flip). Lower is better.
      </p>
    </div>
  );
}

function ReliabilityTableTab({ calBuckets }: { calBuckets: any[] }) {
  if (calBuckets.length === 0) return <p className="text-[13px] text-white/40">No calibration buckets available.</p>;

  return (
    <div className="overflow-x-auto">
      <div className="grid text-[14px] font-bold text-white" style={{ gridTemplateColumns: "2fr 0.6fr 1fr 1fr 1fr", borderBottom: "1.5px solid rgba(255,255,255,0.2)", padding: "12px 0" }}>
        <span>Predicted P(YES)</span><span className="text-right">n</span><span className="text-right">Actual YES%</span><span className="text-right">Perfect</span><span className="text-right">Gap</span>
      </div>
      {calBuckets.map((b: any, i: number) => {
        const pred = Number(b.predicted_mean ?? b.predicted ?? b.avg_confidence ?? 0);
        const actual = Number(b.actual_yes_rate ?? b.actual ?? 0);
        const n = b.n ?? b.count ?? 0;
        const gap = actual - pred;
        let gapColor = "#919fa6";
        if (Math.abs(gap) < 0.05) gapColor = "#00C807";
        else if (gap < -0.1) gapColor = "#FF6B8A";
        else if (gap > 0.1) gapColor = "#00C807";
        return (
          <div key={i} className="grid items-center" style={{ gridTemplateColumns: "2fr 0.6fr 1fr 1fr 1fr", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 14 }}>
            <span className="text-white">{b.range ?? fmtPct(pred, false)}</span>
            <span className="text-right text-white/70 tabular-nums">{n}</span>
            <span className="text-right text-white tabular-nums">{fmtPct(actual, false)}</span>
            <span className="text-right text-white/50 tabular-nums">{fmtPct(pred, false)}</span>
            <span className="text-right tabular-nums font-medium" style={{ color: gapColor }}>{gap >= 0 ? "+" : ""}{(gap * 100).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}
