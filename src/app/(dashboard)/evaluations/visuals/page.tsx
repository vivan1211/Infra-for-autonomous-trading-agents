"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState } from "react";
import { useWikiAggregates } from "@/hooks/use-wiki";
import { pnlColor } from "@/lib/utils";

/* ================================================================ */
/*  HELPERS                                                          */
/* ================================================================ */

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

/** Convert "2026-W15" → "Apr 6 – 12" or "Mar 30 – Apr 5" (cross-month) */
function isoWeekToDateRange(isoWeek: string): string {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return isoWeek;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // ISO week 1 contains Jan 4. Monday of week 1:
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // 1=Mon..7=Sun
  const mon1 = new Date(jan4);
  mon1.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1)); // Monday of W01
  const monday = new Date(mon1);
  monday.setUTCDate(mon1.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mMon = months[monday.getUTCMonth()];
  const mSun = months[sunday.getUTCMonth()];
  if (mMon === mSun) {
    return `${mMon} ${monday.getUTCDate()} – ${sunday.getUTCDate()}`;
  }
  return `${mMon} ${monday.getUTCDate()} – ${mSun} ${sunday.getUTCDate()}`;
}

function rawColor(v: number): string {
  return v >= 0 ? "#00C807" : "#FF6B8A";
}

function severityBadge(severity: string) {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical") {
    return (
      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide" style={{ background: "rgba(255,107,138,0.2)", color: "#FF6B8A" }}>
        {severity}
      </span>
    );
  }
  if (s === "high") {
    return (
      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide" style={{ background: "rgba(251,146,60,0.2)", color: "#FB923C" }}>
        {severity}
      </span>
    );
  }
  return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-white/[0.06] text-white/70">
      {severity}
    </span>
  );
}

/* ── Pill Tabs ─────────────────────────────────────────────────── */

function UnderlineTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex items-center gap-6 mb-8" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className="text-[14px] font-semibold transition-colors pb-3 relative"
          style={{
            color: active === t ? "#fff" : "#919fa6",
            background: "transparent",
            border: "none",
          }}
        >
          {t}
          {active === t && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "#FB923C" }} />
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Horizontal Bar (pure CSS) ─────────────────────────────────── */

function HBar({
  label,
  value,
  valueFmt,
  pct,
  color = "#fff",
  labelW = 120,
  valueW = 60,
}: {
  label: string;
  value?: string;
  valueFmt?: string;
  pct: number;
  color?: string;
  labelW?: number;
  valueW?: number;
}) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
      <span className="text-[14px] text-white truncate" style={{ width: labelW, minWidth: labelW }}>{label}</span>
      <div className="flex-1 h-[4px]" style={{ background: "#1a1a1a", borderRadius: 2 }}>
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 2 }} />
      </div>
      <span className="text-[14px] text-white tabular-nums text-right" style={{ width: valueW, minWidth: valueW, color }}>
        {valueFmt ?? value ?? ""}
      </span>
    </div>
  );
}

/* ── Diverging Bar (centered at 50%) ───────────────────────────── */

function DivBar({
  label,
  labelSub,
  value,
  maxAbs,
  labelW = 130,
  valueW = 90,
}: {
  label: string;
  labelSub?: string;
  value: number;
  maxAbs: number;
  labelW?: number;
  valueW?: number;
}) {
  const color = value >= 0 ? "#00C807" : "#FF6B8A";
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 50 : 0;
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
      <span className="text-[14px] text-white truncate" style={{ width: labelW, minWidth: labelW }}>
        {label}
        {labelSub && <span className="text-[11px] ml-1" style={{ color: "rgba(255,255,255,0.4)" }}>{labelSub}</span>}
      </span>
      <div className="flex-1 h-[4px] relative" style={{ background: "#1a1a1a", borderRadius: 2 }}>
        {/* center line */}
        <div className="absolute top-[-4px] bottom-[-4px] w-px" style={{ left: "50%", background: "rgba(255,255,255,0.15)" }} />
        {value >= 0 ? (
          <div className="absolute h-full rounded-r" style={{ left: "50%", width: `${pct}%`, background: color }} />
        ) : (
          <div className="absolute h-full rounded-l" style={{ right: "50%", width: `${pct}%`, background: color }} />
        )}
      </div>
      <span className="text-[14px] tabular-nums text-right" style={{ width: valueW, minWidth: valueW, color }}>
        {fmtPnl(value)}
      </span>
    </div>
  );
}

/* ================================================================ */
/*  MAIN PAGE                                                        */
/* ================================================================ */

export default function VisualsPage() {
  const { aggregates, loading, error } = useWikiAggregates();

  /* Tab states */
  const [strategyTab, setStrategyTab] = useState("Overview");
  const [marketTab, setMarketTab] = useState("Categories");
  const [calibrationTab, setCalibrationTab] = useState("Weekly");
  const [riskTab, setRiskTab] = useState("Pipeline");

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

  const rawSnap = aggregates?.data_snapshot;
  const snap: any = typeof rawSnap === "string" ? JSON.parse(rawSnap) : (rawSnap ?? {});
  const o = snap.overall ?? {};

  /* ── Derived data ──────────────────────────────────────────────── */

  const realPnl = pnlVal(o.real_pnl_sum ?? o.real_pnl ?? o.total_pnl);
  const cfPnl = pnlVal(o.cf_pnl_sum ?? 0);
  const filterSavings = realPnl - cfPnl;
  const winRate = o.real_win_rate != null ? Number(o.real_win_rate) : null;
  const winLo = o.real_win_rate_ci?.[0] ?? null;
  const winHi = o.real_win_rate_ci?.[1] ?? null;
  const settled = Number(o.n_real_settled ?? 0);
  const brier = snap.calibration?.brier ?? null;
  const maxDd = o.max_drawdown ?? null;
  const sharpe = o.trade_sharpe ?? null;
  const confEdgeGap = snap.conf_edge_inversion?.by_bucket?.placed?.mean_gap ?? null;
  const brierImprove = brier != null ? ((0.25 - Number(brier)) / 0.25 * 100) : null;

  /* ── Per-bot ───────────────────────────────────────────────────── */

  const rawPerBot = snap.per_bot ?? {};
  const perBot: any[] = Array.isArray(rawPerBot)
    ? rawPerBot
    : Object.entries(rawPerBot).map(([id, v]: [string, any]) => ({ bot_type_id: id, ...v }));

  /* ── Skip reasons ──────────────────────────────────────────────── */

  const skipReasons: any = snap.skip_reasons ?? {};

  /* ── Per-agent ─────────────────────────────────────────────────── */

  const rawPerAgent = snap.per_agent ?? {};
  const perAgent: any[] = [];
  Object.entries(rawPerAgent).forEach(([botId, roles]: [string, any]) => {
    Object.entries(roles ?? {}).forEach(([role, stats]: [string, any]) => {
      perAgent.push({ agent_name: `${botId} / ${role}`, bot_id: botId, role, ...stats });
    });
  });

  /* ── Edge (correlations still used by CorrelationsTab) ───────── */
  const corr = snap.correlations ?? {};
  const wonCorr: any = corr.won_correlations ?? {};

  /* ── Calibration buckets ───────────────────────────────────────── */

  const calBuckets: any[] = Array.isArray(snap.calibration?.buckets) ? snap.calibration.buckets : [];

  /* ── Recommendations ───────────────────────────────────────────── */

  const recs: any[] = Array.isArray(snap.recommendations) ? snap.recommendations : [];

  /* ── Pipeline / Risk Manager ───────────────────────────────────── */

  const bioObj = snap.bimodality ?? {};
  const totalSignals = Object.values(bioObj).reduce((s: number, b: any) => s + (b?.n_total ?? 0), 0) as number;
  const reachedResearch = Object.values(bioObj).reduce((s: number, b: any) => s + (b?.n_research_reaching ?? 0), 0) as number;
  const placed = Number(o.n_placed ?? 0);
  const rm: any = snap.risk_manager_audit ?? {};

  /* ── Missed trades / CF deep dive ──────────────────────────────── */

  const cfDeep: any = snap.cf_deep_dive ?? {};
  const topNearMisses: any[] = Array.isArray(cfDeep.top_near_misses) ? cfDeep.top_near_misses : [];
  const cfByCat: any[] = Array.isArray(cfDeep.cf_by_category) ? cfDeep.cf_by_category : [];
  const cfBySide: any = cfDeep.cf_by_side ?? {};

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div>

      {/* ============================================================ */}
      {/* SECTION 1: Performance Overview                               */}
      {/* ============================================================ */}

      <SectionHeader title="Performance Overview" first />

      {/* 7-card horizontal scrolling row */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ marginBottom: 56 }}>
        {[
          {
            title: "Filter Savings",
            value: fmtPnl(filterSavings),
            subtitle: filterSavings >= 0 ? "saved by filtering" : "lost by filtering",
            desc: "Real PnL minus counterfactual",
            color: rawColor(filterSavings),
          },
          {
            title: "Realized PnL",
            value: fmtPnl(realPnl),
            subtitle: `on ${settled} settled`,
            desc: "Sum of settled trade PnL",
            color: rawColor(realPnl),
          },
          {
            title: "Win Rate",
            value: winRate != null ? fmtPct(winRate) : "\u2014",
            subtitle: winRate != null ? (Number(winRate) >= 0.5 ? "above 50%" : "below 50%") : "",
            desc: `n=${settled}`,
            color: winRate != null ? (Number(winRate) >= 0.5 ? "#00C807" : "#FF6B8A") : "#fff",
          },
          {
            title: "Brier Score",
            value: brier != null ? fmtNum(brier) : "\u2014",
            subtitle: brier != null && brierImprove != null ? `${brierImprove.toFixed(1)}% better` : "",
            desc: "baseline: 0.250",
            color: "#fff",
          },
          {
            title: "Max Drawdown",
            value: maxDd != null ? fmtPnl(-Math.abs(Number(maxDd))) : "\u2014",
            subtitle: "worst peak-to-trough",
            desc: "Dollar value",
            color: "#FF6B8A",
          },
          {
            title: "Sharpe",
            value: sharpe != null ? `${Number(sharpe) >= 0 ? "+" : ""}${Number(sharpe).toFixed(2)}` : "\u2014",
            subtitle: sharpe != null ? (Number(sharpe) >= 1 ? "solid" : Number(sharpe) >= 0 ? "positive" : "negative") : "",
            desc: "Trade-level Sharpe",
            color: sharpe != null ? rawColor(Number(sharpe)) : "#fff",
          },
          {
            title: "Conf-Edge Gap",
            value: confEdgeGap != null ? `+${Number(confEdgeGap).toFixed(3)}` : "\u2014",
            subtitle: "at placement",
            desc: "threshold: 0.30",
            color: "#fff",
          },
        ].map((card, i) => (
          <div
            key={i}
            className="rounded-xl flex-shrink-0 flex flex-col"
            style={{
              minWidth: 195,
              width: 195,
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "28px 20px",
            }}
          >
            <span className="text-[14px] font-medium text-white" style={{ lineHeight: 1.2, marginBottom: 6 }}>{card.title}</span>
            <div className="flex-1" />
            <div style={{ marginTop: 32 }}>
              <div className="text-[20px] font-bold tabular-nums" style={{ color: card.color }}>{card.value}</div>
              {card.subtitle && <div className="text-[13px] tabular-nums" style={{ color: card.color, marginTop: 4 }}>{card.subtitle}</div>}
              {card.desc && <div className="text-[13px]" style={{ color: "#919fa6", marginTop: 12 }}>{card.desc}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Win Rate Circle + Bars */}
      {winRate != null && (
        <div className="flex items-center gap-12" style={{ marginBottom: 56 }}>
          {/* Circle */}
          <div
            className="rounded-full flex flex-col items-center justify-center flex-shrink-0"
            style={{ width: 120, height: 120, background: "#1a2e1a" }}
          >
            <span className="text-[20px] font-bold tabular-nums" style={{ color: "#00C807" }}>
              {(Number(winRate) * 100).toFixed(0)}%
            </span>
            <span className="text-[11px]" style={{ color: "#00C807" }}>win rate</span>
          </div>

          {/* Bars */}
          <div className="flex-1">
            <HBar
              label="Win Rate"
              valueFmt={fmtPct(winRate)}
              pct={Number(winRate) * 100}
              color="#fff"
            />
            <HBar
              label="Brier vs Random"
              valueFmt={brier != null ? `${brierImprove?.toFixed(1)}% better` : "\u2014"}
              pct={brierImprove != null ? Math.min(100, brierImprove) : 0}
              color="#fff"
            />
            <HBar
              label="Filter Savings"
              valueFmt={fmtPnl(filterSavings)}
              pct={cfPnl !== 0 ? Math.min(100, Math.abs(filterSavings / cfPnl) * 100) : 0}
              color="#fff"
              valueW={90}
            />
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 2: Strategy Analysis (6 tabs)                         */}
      {/* ============================================================ */}

      <SectionHeader title="Strategy Analysis" />
      <p className="text-[13px] mb-5" style={{ color: "#919fa6" }}>Per-bot performance breakdown with skip profiles and calibration details.</p>

      <UnderlineTabs
        tabs={["Overview", "PnL", "Skip Profile", "Agent Calibration", "Correlations"]}
        active={strategyTab}
        onChange={setStrategyTab}
      />

      {/* Overview tab */}
      {strategyTab === "Overview" && (
        <StrategyOverviewTab perBot={perBot} />
      )}

      {/* PnL tab */}
      {strategyTab === "PnL" && (
        <StrategyPnlTab perBot={perBot} realPnl={realPnl} />
      )}

      {/* Skip Profile tab */}
      {strategyTab === "Skip Profile" && (
        <SkipProfileTab skipReasons={skipReasons} />
      )}

      {/* Agent Calibration tab */}
      {strategyTab === "Agent Calibration" && (
        <AgentCalibrationTab perAgent={perAgent} />
      )}

      {/* Correlations tab */}
      {strategyTab === "Correlations" && (
        <CorrelationsTab wonCorr={wonCorr} />
      )}

      {/* ============================================================ */}
      {/* SECTION 4: Market Breakdown (2 tabs)                          */}
      {/* ============================================================ */}

      <SectionHeader title="Market Breakdown" />

      <UnderlineTabs
        tabs={["Categories", "YES vs NO", "Market Price", "Timing"]}
        active={marketTab}
        onChange={setMarketTab}
      />

      {marketTab === "Categories" && (
        <CategoriesTab snap={snap} />
      )}

      {marketTab === "YES vs NO" && (
        <YesNoTab snap={snap} />
      )}

      {marketTab === "Market Price" && (
        <MarketPriceTab snap={snap} />
      )}

      {marketTab === "Timing" && (
        <TimingTab snap={snap} />
      )}

      {/* ============================================================ */}
      {/* SECTION 5: Calibration (4 tabs)                               */}
      {/* ============================================================ */}

      <SectionHeader title="Calibration" />

      <UnderlineTabs
        tabs={["Weekly", "Brier Score", "Reliability Table"]}
        active={calibrationTab}
        onChange={setCalibrationTab}
      />

      {calibrationTab === "Weekly" && (
        <WeeklyTrendsTab snap={snap} />
      )}

      {calibrationTab === "Brier Score" && (
        <BrierScoreTab brier={brier} brierImprove={brierImprove} />
      )}

      {calibrationTab === "Reliability Table" && (
        <ReliabilityTableTab calBuckets={calBuckets} />
      )}

      {/* ============================================================ */}
      {/* SECTION 6: Risk & Opportunity (3 tabs)                        */}
      {/* ============================================================ */}

      <SectionHeader title="Risk & Opportunity" />

      <UnderlineTabs
        tabs={["Pipeline", "Counterfactual"]}
        active={riskTab}
        onChange={setRiskTab}
      />

      {riskTab === "Pipeline" && (
        <PipelineTab
          totalSignals={totalSignals}
          reachedResearch={reachedResearch}
          placed={placed}
          settled={settled}
          realPnl={realPnl}
          rm={rm}
        />
      )}

      {riskTab === "Counterfactual" && (
        <CounterfactualTab
          o={o}
          cfPnl={cfPnl}
          realPnl={realPnl}
          cfByCat={cfByCat}
          cfBySide={cfBySide}
        />
      )}
    </div>
  );
}

/* ================================================================ */
/*  Section Header                                                    */
/* ================================================================ */

function SectionHeader({ title, first }: { title: string; first?: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 72 }}>
      <h2 className="text-[22px] font-semibold text-white">{title}</h2>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 12, paddingTop: 24 }} />
    </div>
  );
}

/* ================================================================ */
/*  S3: Strategy Analysis Tabs                                        */
/* ================================================================ */

function StrategyOverviewTab({ perBot }: { perBot: any[] }) {
  if (perBot.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No per-bot data available.</p>;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid text-[14px] font-bold text-white"
        style={{
          gridTemplateColumns: "2fr 0.6fr 0.6fr 0.6fr 1.2fr 0.8fr 0.8fr",
          borderBottom: "1.5px solid rgba(255,255,255,0.2)",
          padding: "0 0 16px 0",
        }}
      >
        <span>Strategy</span>
        <span className="text-right">Trades</span>
        <span className="text-right">Placed</span>
        <span className="text-right">Settled</span>
        <span className="text-right">Win Rate</span>
        <span className="text-right">Real PnL</span>
        <span className="text-right">CF PnL</span>
      </div>
      {perBot.map((b: any, i: number) => {
        const botPnl = pnlVal(b.real_pnl ?? 0);
        const cfP = pnlVal(b.cf_pnl ?? 0);
        const wr = b.real_win_rate;
        const ci = b.real_win_rate_ci;
        return (
          <div
            key={i}
            className="grid items-center"
            style={{
              gridTemplateColumns: "2fr 0.6fr 0.6fr 0.6fr 1.2fr 0.8fr 0.8fr",
              padding: "24px 0",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              fontSize: 14,
            }}
          >
            <span className="text-white font-medium">{b.bot_name ?? b.bot_type_id ?? "\u2014"}</span>
            <span className="text-right text-white/70 tabular-nums">{b.n_total ?? "\u2014"}</span>
            <span className="text-right text-white/70 tabular-nums">{b.n_placed ?? "\u2014"}</span>
            <span className="text-right text-white/70 tabular-nums">{b.n_real_settled ?? "\u2014"}</span>
            <span className="text-right tabular-nums text-white">
              {wr != null ? fmtPct(wr) : "\u2014"}
              {ci != null && (
                <span className="text-[11px] ml-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  [{fmtPct(ci[0])}-{fmtPct(ci[1])}]
                </span>
              )}
            </span>
            <span className="text-right tabular-nums font-medium" style={{ color: rawColor(botPnl) }}>{fmtPnl(botPnl)}</span>
            <span className="text-right tabular-nums font-medium" style={{ color: rawColor(cfP) }}>{fmtPnl(cfP)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StrategyPnlTab({ perBot, realPnl }: { perBot: any[]; realPnl: number }) {
  if (perBot.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No per-bot data available.</p>;

  const maxAbs = Math.max(1, ...perBot.map((b: any) => Math.abs(pnlVal(b.real_pnl ?? 0))));

  return (
    <div>
      {perBot.map((b: any, i: number) => {
        const v = pnlVal(b.real_pnl ?? 0);
        const pct = Math.abs(v) / maxAbs * 100;
        return (
          <div key={i} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <span className="text-[14px] text-white truncate" style={{ width: 160, minWidth: 160 }}>
              {b.bot_name ?? b.bot_type_id ?? "\u2014"}
            </span>
            <div className="flex-1 h-[4px]" style={{ background: "#1a1a1a", borderRadius: 2 }}>
              <div className="h-full" style={{ width: `${pct}%`, background: rawColor(v), borderRadius: 2 }} />
            </div>
            <span className="text-[14px] tabular-nums text-right" style={{ width: 80, minWidth: 80, color: rawColor(v) }}>
              {fmtPnl(v)}
            </span>
          </div>
        );
      })}
      <p className="text-[13px] mt-5" style={{ color: "#919fa6" }}>
        Fleet total: <span className="font-semibold" style={{ color: rawColor(realPnl) }}>{fmtPnl(realPnl)}</span>
      </p>
    </div>
  );
}

function SkipProfileTab({ skipReasons }: { skipReasons: any }) {
  const entries = Object.entries(skipReasons);
  if (entries.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No skip data available.</p>;

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
  const sorted = perAgent
    .filter((a: any) => a.brier != null)
    .sort((a: any, b: any) => Number(a.brier) - Number(b.brier));

  if (sorted.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No agent calibration data.</p>;

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
            <span className="text-[14px] text-white truncate" style={{ width: 160, minWidth: 160 }}>
              {agent.agent_name ?? "agent"}
            </span>
            <div className="flex-1 h-[4px] relative" style={{ background: "#1a1a1a", borderRadius: 2 }}>
              <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2 }} />
              {/* Baseline dashed line */}
              <div
                className="absolute top-[-6px] bottom-[-6px]"
                style={{
                  left: `${(baseline / Math.max(maxBrier, baseline * 1.2)) * 100}%`,
                  width: 1,
                  borderLeft: "1px dashed rgba(255,255,255,0.3)",
                }}
              />
            </div>
            <span className="text-[14px] tabular-nums text-right" style={{ width: 60, minWidth: 60, color }}>
              {fmtNum(val)}
            </span>
          </div>
        );
      })}
      <p className="text-[13px] mt-5" style={{ color: "#919fa6" }}>
        Random baseline = 0.250
      </p>
    </div>
  );
}

function CorrelationsTab({ wonCorr }: { wonCorr: any }) {
  const entries = Object.entries(wonCorr ?? {}).filter(([, v]) => v != null);
  if (entries.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No correlation data available.</p>;

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

      <div className="mt-6 rounded-lg" style={{ border: "1px solid #21262d", padding: 16, background: "transparent" }}>
        <p className="text-[13px]" style={{ color: "#919fa6" }}>
          Correlations with real_won outcome. Green = positive predictor, red = negative predictor. Strong signals ({">"}0.3 or {"<"}-0.3) may indicate exploitable edges or systematic biases.
        </p>
      </div>
    </div>
  );
}

/* ================================================================ */
/*  Shared Filter: Bot + Week                                         */
/* ================================================================ */

function BotWeekFilter({
  bots,
  weeks,
  botFilter,
  weekFilter,
  onBotChange,
  onWeekChange,
}: {
  bots: string[];
  weeks: string[];
  botFilter: string;
  weekFilter: string;
  onBotChange: (b: string) => void;
  onWeekChange: (w: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <span className="text-[13px] text-white/40">Filter:</span>
      {/* Bot pills — same styling as Weekly tab */}
      <button
        onClick={() => onBotChange("all")}
        className={`px-3 py-1 rounded-full text-[13px] font-medium border transition-colors ${
          botFilter === "all"
            ? "border-accent text-accent bg-accent/10"
            : "border-white/10 text-white/50 hover:text-white/80"
        }`}
      >
        All
      </button>
      {bots.map((b) => (
        <button
          key={b}
          onClick={() => onBotChange(b)}
          className={`px-3 py-1 rounded-full text-[13px] font-medium border transition-colors ${
            botFilter === b
              ? "border-accent text-accent bg-accent/10"
              : "border-white/10 text-white/50 hover:text-white/80"
          }`}
        >
          {b}
        </button>
      ))}
      {weeks.length > 0 && (
        <select
          value={weekFilter}
          onChange={(e) => onWeekChange(e.target.value)}
          className="ml-2 px-3 py-1 rounded-lg text-[13px] bg-surface border border-white/10 text-white/70 outline-none"
        >
          <option value="all">All Weeks</option>
          {weeks.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S4: Market Breakdown Tabs                                         */
/* ================================================================ */

function CategoriesTab({ snap }: { snap: any }) {
  const [botFilter, setBotFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  const marketByWeek = snap?.market_by_week ?? {};
  let rawCatsResolved: any;
  if (weekFilter !== "all") {
    rawCatsResolved = marketByWeek?.categories_by_week?.[weekFilter];
  } else if (botFilter !== "all") {
    rawCatsResolved = snap?.categories_per_bot?.[botFilter];
  } else {
    rawCatsResolved = snap?.categories_per_bot?.all ?? snap?.categories;
  }

  const cats: any[] = Array.isArray(rawCatsResolved)
    ? rawCatsResolved
    : Object.entries(rawCatsResolved ?? {}).map(([name, v]: [string, any]) => ({ category: name, ...v }));

  const bots = Object.keys(snap?.categories_per_bot ?? {}).filter(k => k !== "all");
  const weeks = marketByWeek?.weeks ?? [];

  if (cats.length === 0) return (
    <div>
      <BotWeekFilter bots={bots} weeks={weeks} botFilter={botFilter} weekFilter={weekFilter} onBotChange={(b) => { setBotFilter(b); setWeekFilter("all"); }} onWeekChange={(w) => { setWeekFilter(w); setBotFilter("all"); }} />
      <p className="text-[13px]" style={{ color: "#919fa6" }}>No category data available.</p>
    </div>
  );

  const sorted = [...cats].sort((a, b) => pnlVal(b.real_pnl) - pnlVal(a.real_pnl));
  const maxAbs = Math.max(1, ...sorted.map((c: any) => Math.abs(pnlVal(c.real_pnl))));

  const totalPositive = sorted.filter((c: any) => pnlVal(c.real_pnl) >= 0).reduce((s: number, c: any) => s + pnlVal(c.real_pnl), 0);
  const totalNegative = sorted.filter((c: any) => pnlVal(c.real_pnl) < 0).reduce((s: number, c: any) => s + pnlVal(c.real_pnl), 0);

  return (
    <div>
      <BotWeekFilter
        bots={bots} weeks={weeks}
        botFilter={botFilter} weekFilter={weekFilter}
        onBotChange={(b) => { setBotFilter(b); setWeekFilter("all"); }}
        onWeekChange={(w) => { setWeekFilter(w); setBotFilter("all"); }}
      />
      {sorted.map((c: any, i: number) => {
        const v = pnlVal(c.real_pnl);
        const n = c.n ?? c.n_placed ?? 0;
        return (
          <DivBar
            key={i}
            label={c.category ?? c.name ?? "unknown"}
            labelSub={`n=${n}`}
            value={v}
            maxAbs={maxAbs}
          />
        );
      })}

      <div className="flex gap-6 mt-4 text-[13px]" style={{ color: "#919fa6" }}>
        <span>
          Winners: <span style={{ color: "#00C807" }}>{fmtPnl(totalPositive)}</span>
        </span>
        <span>
          Losers: <span style={{ color: "#FF6B8A" }}>{fmtPnl(totalNegative)}</span>
        </span>
        <span>
          Net: <span style={{ color: rawColor(totalPositive + totalNegative) }}>{fmtPnl(totalPositive + totalNegative)}</span>
        </span>
      </div>
    </div>
  );
}

function YesNoTab({ snap }: { snap: any }) {
  const [botFilter, setBotFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  const marketByWeek = snap?.market_by_week ?? {};
  let sidesResolved: any;
  if (weekFilter !== "all") {
    sidesResolved = marketByWeek?.sides_by_week?.[weekFilter];
  } else if (botFilter !== "all") {
    sidesResolved = snap?.sides_per_bot?.[botFilter];
  } else {
    sidesResolved = snap?.sides_per_bot?.all ?? snap?.sides;
  }

  const sides: any = sidesResolved ?? {};
  const yes = sides.YES ?? sides.yes ?? {};
  const no = sides.NO ?? sides.no ?? {};

  const bots = Object.keys(snap?.sides_per_bot ?? {}).filter(k => k !== "all");
  const weeks = marketByWeek?.weeks ?? [];

  const yPnl = pnlVal(yes.real_pnl);
  const nPnl = pnlVal(no.real_pnl);
  const yWin = yes.real_win_rate != null ? Number(yes.real_win_rate) * 100 : null;
  const nWin = no.real_win_rate != null ? Number(no.real_win_rate) * 100 : null;

  const metrics = [
    { label: "Placed", no: no.n_placed ?? "\u2014", yes: yes.n_placed ?? "\u2014" },
    { label: "Settled", no: no.n_decided ?? "\u2014", yes: yes.n_decided ?? "\u2014" },
    { label: "Win Rate", no: nWin != null ? `${nWin.toFixed(1)}%` : "\u2014", yes: yWin != null ? `${yWin.toFixed(1)}%` : "\u2014" },
    { label: "Real PnL", no: fmtPnl(nPnl), yes: fmtPnl(yPnl), noColor: rawColor(nPnl), yesColor: rawColor(yPnl) },
  ];

  const maxAbsPnl = Math.max(1, Math.abs(yPnl), Math.abs(nPnl));

  return (
    <div>
      <BotWeekFilter
        bots={bots} weeks={weeks}
        botFilter={botFilter} weekFilter={weekFilter}
        onBotChange={(b) => { setBotFilter(b); setWeekFilter("all"); }}
        onWeekChange={(w) => { setWeekFilter(w); setBotFilter("all"); }}
      />
      {/* Table */}
      <div className="overflow-x-auto mb-8">
        <div
          className="grid text-[14px] font-bold text-white"
          style={{
            gridTemplateColumns: "1.5fr 1fr 1fr",
            borderBottom: "1.5px solid rgba(255,255,255,0.2)",
            padding: "0 0 16px 0",
          }}
        >
          <span>Metric</span>
          <span className="text-right">NO</span>
          <span className="text-right">YES</span>
        </div>
        {metrics.map((m, i) => (
          <div
            key={i}
            className="grid items-center"
            style={{
              gridTemplateColumns: "1.5fr 1fr 1fr",
              padding: "16px 0",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              fontSize: 14,
            }}
          >
            <span className="text-white/70">{m.label}</span>
            <span className="text-right tabular-nums" style={{ color: (m as any).noColor ?? "#fff" }}>{m.no}</span>
            <span className="text-right tabular-nums" style={{ color: (m as any).yesColor ?? "#fff" }}>{m.yes}</span>
          </div>
        ))}
      </div>

      {/* PnL bars */}
      <p className="text-[14px] text-white font-medium mb-4">PnL by Side</p>
      {[
        { label: "NO", value: nPnl },
        { label: "YES", value: yPnl },
      ].map((d, i) => (
        <div key={i} className="flex items-center gap-3" style={{ marginBottom: 16 }}>
          <span className="text-[14px] text-white" style={{ width: 50, minWidth: 50 }}>{d.label}</span>
          <div className="flex-1 h-[4px] rounded-full" style={{ background: "#1a1a1a" }}>
            <div className="h-full rounded-full" style={{ width: `${(Math.abs(d.value) / maxAbsPnl) * 100}%`, background: rawColor(d.value) }} />
          </div>
          <span className="text-[14px] tabular-nums text-right" style={{ width: 80, minWidth: 80, color: rawColor(d.value) }}>
            {fmtPnl(d.value)}
          </span>
        </div>
      ))}

      <p className="text-[13px] mt-2" style={{ color: "#919fa6" }}>
        {nWin != null && yWin != null && `Win rate spread: ${(nWin - yWin).toFixed(1)} pp (NO - YES)`}
      </p>
    </div>
  );
}

/* ================================================================ */
/*  S4b: Market Price Tab                                              */
/* ================================================================ */

function MarketPriceTab({ snap }: { snap: any }) {
  const [botFilter, setBotFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  // Resolve data source based on filters
  const marketByWeek = snap?.market_by_week ?? {};
  let data: any;
  if (weekFilter !== "all") {
    data = marketByWeek?.price_by_week?.[weekFilter];
  } else if (botFilter !== "all") {
    data = snap?.hit_rate_by_price_per_bot?.[botFilter];
  } else {
    data = snap?.hit_rate_by_price_per_bot?.all ?? snap?.hit_rate_by_price;
  }

  const buckets = data?.buckets ?? [];
  const bots = Object.keys(snap?.hit_rate_by_price_per_bot ?? {}).filter(k => k !== "all");
  const weeks = marketByWeek?.weeks ?? [];

  return (
    <div>
      <BotWeekFilter
        bots={bots} weeks={weeks}
        botFilter={botFilter} weekFilter={weekFilter}
        onBotChange={(b) => { setBotFilter(b); setWeekFilter("all"); }}
        onWeekChange={(w) => { setWeekFilter(w); setBotFilter("all"); }}
      />
      {buckets.length === 0 ? (
        <p className="text-white/30 text-[14px]">No data available yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Table */}
          <div className="grid grid-cols-5 gap-px text-[13px]">
            <div className="text-white/40 font-medium py-2">Bracket</div>
            <div className="text-white/40 font-medium py-2 text-right">Placed</div>
            <div className="text-white/40 font-medium py-2 text-right">Won</div>
            <div className="text-white/40 font-medium py-2 text-right">Win Rate</div>
            <div className="text-white/40 font-medium py-2 text-right">Real PnL</div>
            {buckets.map((b: any, i: number) => (
              <React.Fragment key={i}>
                <div className="text-white/80 py-2 border-t border-white/[0.04]">{b.range}</div>
                <div className="text-white/60 py-2 text-right border-t border-white/[0.04]">{b.n_placed ?? 0}</div>
                <div className="text-white/60 py-2 text-right border-t border-white/[0.04]">{b.n_won ?? 0}</div>
                <div className="py-2 text-right border-t border-white/[0.04]">
                  <span className={b.win_rate != null && b.win_rate >= 0.5 ? "text-gain" : "text-loss"}>
                    {b.win_rate != null ? `${(b.win_rate * 100).toFixed(1)}%` : "\u2014"}
                  </span>
                  {b.ci && <span className="text-white/30 text-[11px] ml-1">n={b.n_decided}</span>}
                </div>
                <div className={`py-2 text-right border-t border-white/[0.04] ${(b.real_pnl ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>
                  {b.real_pnl != null ? `${b.real_pnl >= 0 ? "+" : ""}$${b.real_pnl.toFixed(2)}` : "\u2014"}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S4c: Timing Tab                                                    */
/* ================================================================ */

function TimingTab({ snap }: { snap: any }) {
  const [botFilter, setBotFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  const marketByWeek = snap?.market_by_week ?? {};
  let data: any;
  if (weekFilter !== "all") {
    data = marketByWeek?.timing_by_week?.[weekFilter];
  } else if (botFilter !== "all") {
    data = snap?.hit_rate_by_timing_per_bot?.[botFilter];
  } else {
    data = snap?.hit_rate_by_timing_per_bot?.all ?? snap?.hit_rate_by_timing;
  }

  const buckets = data?.buckets ?? [];
  const bots = Object.keys(snap?.hit_rate_by_timing_per_bot ?? {}).filter(k => k !== "all");
  const weeks = marketByWeek?.weeks ?? [];

  return (
    <div>
      <BotWeekFilter
        bots={bots} weeks={weeks}
        botFilter={botFilter} weekFilter={weekFilter}
        onBotChange={(b) => { setBotFilter(b); setWeekFilter("all"); }}
        onWeekChange={(w) => { setWeekFilter(w); setBotFilter("all"); }}
      />
      {buckets.length === 0 ? (
        <p className="text-white/30 text-[14px]">No data available yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-px text-[13px]">
            <div className="text-white/40 font-medium py-2">Time to Close</div>
            <div className="text-white/40 font-medium py-2 text-right">Placed</div>
            <div className="text-white/40 font-medium py-2 text-right">Won</div>
            <div className="text-white/40 font-medium py-2 text-right">Win Rate</div>
            <div className="text-white/40 font-medium py-2 text-right">Real PnL</div>
            {buckets.map((b: any, i: number) => (
              <React.Fragment key={i}>
                <div className="text-white/80 py-2 border-t border-white/[0.04]">{b.range}</div>
                <div className="text-white/60 py-2 text-right border-t border-white/[0.04]">{b.n_placed ?? 0}</div>
                <div className="text-white/60 py-2 text-right border-t border-white/[0.04]">{b.n_won ?? 0}</div>
                <div className="py-2 text-right border-t border-white/[0.04]">
                  <span className={b.win_rate != null && b.win_rate >= 0.5 ? "text-gain" : "text-loss"}>
                    {b.win_rate != null ? `${(b.win_rate * 100).toFixed(1)}%` : "\u2014"}
                  </span>
                  {b.ci && <span className="text-white/30 text-[11px] ml-1">n={b.n_decided}</span>}
                </div>
                <div className={`py-2 text-right border-t border-white/[0.04] ${(b.real_pnl ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>
                  {b.real_pnl != null ? `${b.real_pnl >= 0 ? "+" : ""}$${b.real_pnl.toFixed(2)}` : "\u2014"}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
/*  S5: Calibration Tabs                                              */
/* ================================================================ */

function CalibrationChartTab({ calBuckets }: { calBuckets: any[] }) {
  if (calBuckets.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No calibration data yet.</p>;

  const points = calBuckets.map((b: any) => ({
    x: Number(b.predicted_mean ?? b.predicted ?? b.avg_confidence ?? 0),
    y: Number(b.actual_yes_rate ?? b.actual ?? 0),
    n: b.n ?? b.count ?? 0,
    label: b.range ?? "",
  }));

  const W = 500;
  const H = 340;
  const pad = 50;
  const plotW = W - pad * 2;
  const plotH = H - pad * 2;

  const toSvgX = (v: number) => pad + v * plotW;
  const toSvgY = (v: number) => pad + (1 - v) * plotH;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Background */}
        <rect x={pad} y={pad} width={plotW} height={plotH} fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v}>
            <line x1={toSvgX(v)} y1={toSvgY(0)} x2={toSvgX(v)} y2={toSvgY(1)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <line x1={toSvgX(0)} y1={toSvgY(v)} x2={toSvgX(1)} y2={toSvgY(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          </g>
        ))}

        {/* Diagonal reference (perfect calibration) */}
        <line x1={toSvgX(0)} y1={toSvgY(0)} x2={toSvgX(1)} y2={toSvgY(1)} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="6 4" />

        {/* Axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={`ax-${v}`}>
            <text x={toSvgX(v)} y={H - 10} textAnchor="middle" fill="#919fa6" fontSize={11}>{(v * 100).toFixed(0)}%</text>
            <text x={pad - 8} y={toSvgY(v) + 4} textAnchor="end" fill="#919fa6" fontSize={11}>{(v * 100).toFixed(0)}%</text>
          </g>
        ))}

        {/* Axis titles */}
        <text x={W / 2} y={H - 0} textAnchor="middle" fill="#919fa6" fontSize={12}>Predicted P(YES)</text>
        <text x={12} y={H / 2} textAnchor="middle" fill="#919fa6" fontSize={12} transform={`rotate(-90, 12, ${H / 2})`}>Actual YES%</text>

        {/* Data points */}
        {points.map((p, i) => {
          const gap = Math.abs(p.y - p.x);
          let dotColor = "#fff"; // underconfident
          if (gap < 0.07) dotColor = "#00C807"; // well-calibrated
          else if (p.y < p.x) dotColor = "#FF6B8A"; // overconfident
          const r = Math.min(8, Math.max(4, Math.sqrt(p.n) * 1.5));
          return (
            <g key={i}>
              <circle cx={toSvgX(p.x)} cy={toSvgY(p.y)} r={r} fill={dotColor} opacity={0.9} />
              <title>{p.label}: pred={fmtPct(p.x, false)}, actual={fmtPct(p.y, false)}, n={p.n}</title>
            </g>
          );
        })}
      </svg>

      <div className="flex gap-4 mt-3 text-[12px]" style={{ color: "#919fa6" }}>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#00C807" }} /> Well-calibrated</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#FF6B8A" }} /> Overconfident</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#fff" }} /> Underconfident</span>
      </div>
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
        <p className="text-[14px] font-medium" style={{ color: "#00C807" }}>
          {brierImprove.toFixed(1)}% better than guessing
        </p>
      )}

      <p className="text-[13px] mt-4" style={{ color: "#919fa6" }}>
        The Brier score measures the mean squared error of probability predictions. A score of 0 is perfect; 0.250 is random guessing (coin flip). Lower is better. Your score reflects how well-calibrated your confidence levels are against actual outcomes.
      </p>
    </div>
  );
}

function ReliabilityTableTab({ calBuckets }: { calBuckets: any[] }) {
  if (calBuckets.length === 0) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No calibration buckets available.</p>;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid text-[14px] font-bold text-white"
        style={{
          gridTemplateColumns: "2fr 0.6fr 1fr 1fr 1fr",
          borderBottom: "1.5px solid rgba(255,255,255,0.2)",
          padding: "12px 0",
        }}
      >
        <span>Predicted P(YES)</span>
        <span className="text-right">n</span>
        <span className="text-right">Actual YES%</span>
        <span className="text-right">Perfect</span>
        <span className="text-right">Gap</span>
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
          <div
            key={i}
            className="grid items-center"
            style={{
              gridTemplateColumns: "2fr 0.6fr 1fr 1fr 1fr",
              padding: "12px 0",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              fontSize: 14,
            }}
          >
            <span className="text-white">{b.range ?? fmtPct(pred, false)}</span>
            <span className="text-right text-white/70 tabular-nums">{n}</span>
            <span className="text-right text-white tabular-nums">{fmtPct(actual, false)}</span>
            <span className="text-right text-white/50 tabular-nums">{fmtPct(pred, false)}</span>
            <span className="text-right tabular-nums font-medium" style={{ color: gapColor }}>
              {gap >= 0 ? "+" : ""}{(gap * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyTrendsTab({ snap }: { snap: any }) {
  const wpb: any = snap.weekly_per_bot ?? {};
  const weeks: string[] = wpb.weeks ?? [];
  const bots: string[] = wpb.bots ?? [];
  const rows: any = wpb.rows ?? {};

  const [botFilter, setBotFilter] = useState("all");

  if (weeks.length === 0) {
    return (
      <div className="py-8">
        <p className="text-[14px]" style={{ color: "#919fa6" }}>
          Weekly data will appear here after the aggregate pipeline runs with timestamp data.
          This requires a backend re-run to populate weekly breakdowns.
        </p>
      </div>
    );
  }

  const filteredBots = botFilter === "all" ? bots : bots.filter((b) => b === botFilter);

  /* Build table rows: one per week, aggregated across selected bots */
  const tableRows = weeks.map((wk) => {
    let nTrades = 0;
    let nPlaced = 0;
    let nDecided = 0;
    let nWon = 0;
    let realPnl = 0;
    let nSkipped = 0;
    let cfDecided = 0;
    let cfWon = 0;
    let cfPnlSum = 0;

    filteredBots.forEach((bot) => {
      const cell = rows[bot]?.[wk];
      if (!cell) return;
      nTrades += cell.n_trades ?? 0;
      nPlaced += cell.n_placed ?? 0;
      nDecided += cell.n_decided ?? 0;
      nWon += cell.n_won ?? 0;
      realPnl += cell.real_pnl ?? 0;
      nSkipped += cell.n_skipped ?? 0;
      cfDecided += cell.cf_n_decided ?? 0;
      cfWon += cell.cf_n_won ?? 0;
      cfPnlSum += cell.cf_pnl ?? 0;
    });

    const realWinPct = nDecided >= 5 ? (nWon / nDecided * 100) : null;
    const cfWinPct = cfDecided >= 5 ? (cfWon / cfDecided * 100) : null;

    return { wk, nTrades, nPlaced, nDecided, nWon, realPnl, realWinPct, nSkipped, cfDecided, cfWon, cfWinPct, cfPnlSum };
  });

  return (
    <div>
      {/* Bot filter */}
      {bots.length > 1 && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[13px]" style={{ color: "#919fa6" }}>Filter:</span>
          <button
            onClick={() => setBotFilter("all")}
            className="text-[13px] font-medium transition-colors"
            style={{
              padding: "4px 14px",
              borderRadius: 9999,
              color: botFilter === "all" ? "#00C807" : "#919fa6",
              border: `1px solid ${botFilter === "all" ? "#00C807" : "rgba(255,255,255,0.1)"}`,
              background: "transparent",
            }}
          >
            All
          </button>
          {bots.map((b) => (
            <button
              key={b}
              onClick={() => setBotFilter(b)}
              className="text-[13px] font-medium transition-colors"
              style={{
                padding: "4px 14px",
                borderRadius: 9999,
                color: botFilter === b ? "#00C807" : "#919fa6",
                border: `1px solid ${botFilter === b ? "#00C807" : "rgba(255,255,255,0.1)"}`,
                background: "transparent",
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* Weekly table */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          <div
            className="grid text-[14px] font-bold text-white"
            style={{ gridTemplateColumns: "1.2fr 0.6fr 0.6fr 1.2fr 0.8fr 0.6fr 1.2fr 0.8fr", paddingBottom: 16, borderBottom: "1.5px solid rgba(255,255,255,0.2)" }}
          >
            <span>Week</span>
            <span className="text-right">Trades</span>
            <span className="text-right">Placed</span>
            <span className="text-right">Win% [CI]</span>
            <span className="text-right">Real PnL</span>
            <span className="text-right">Skipped</span>
            <span className="text-right">CF Win%</span>
            <span className="text-right">CF PnL</span>
          </div>
          {tableRows.map((r, i) => (
            <div
              key={r.wk}
              className="grid items-center text-[14px]"
              style={{ gridTemplateColumns: "1.2fr 0.6fr 0.6fr 1.2fr 0.8fr 0.6fr 1.2fr 0.8fr", padding: "16px 0", borderBottom: i < tableRows.length - 1 ? "1px solid rgba(255,255,255,0.12)" : "none" }}
            >
              <span className="text-white font-medium">{isoWeekToDateRange(r.wk)}</span>
              <span className="text-white tabular-nums text-right">{r.nTrades}</span>
              <span className="text-white tabular-nums text-right">{r.nPlaced}</span>
              <span className="text-white tabular-nums text-right">
                {r.realWinPct != null ? (
                  <>{r.realWinPct.toFixed(1)}% <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>n={r.nDecided}</span></>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{r.nDecided > 0 ? `n=${r.nDecided}, thin` : "—"}</span>
                )}
              </span>
              <span className="tabular-nums text-right font-medium" style={{ color: r.realPnl >= 0 ? "#00C807" : "#FF6B8A" }}>
                {fmtPnl(r.realPnl)}
              </span>
              <span className="tabular-nums text-right" style={{ color: "rgba(255,255,255,0.5)" }}>{r.nSkipped}</span>
              <span className="text-white tabular-nums text-right">
                {r.cfWinPct != null ? (
                  <>{r.cfWinPct.toFixed(1)}% <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>n={r.cfDecided}</span></>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{r.cfDecided > 0 ? `n=${r.cfDecided}, thin` : "—"}</span>
                )}
              </span>
              <span className="tabular-nums text-right font-medium" style={{ color: r.cfPnlSum !== 0 ? (r.cfPnlSum >= 0 ? "#00C807" : "#FF6B8A") : "rgba(255,255,255,0.4)" }}>
                {r.cfPnlSum !== 0 ? fmtPnl(r.cfPnlSum) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */
/*  S6: Risk & Opportunity Tabs                                       */
/* ================================================================ */

function PipelineTab({
  totalSignals,
  reachedResearch,
  placed,
  settled,
  realPnl,
  rm,
}: {
  totalSignals: number;
  reachedResearch: number;
  placed: number;
  settled: number;
  realPnl: number;
  rm: any;
}) {
  const steps = [
    { label: "Signals Detected", value: totalSignals, widthPct: "100%", isLast: false },
    { label: "Reached Research", value: reachedResearch, widthPct: "88%", isLast: false },
    { label: "Placed", value: placed, widthPct: "60%", isLast: false },
    { label: "Settled", value: settled, widthPct: "40%", isLast: false },
    { label: "Realized PnL", value: null, pnl: realPnl, widthPct: "28%", isLast: true },
  ];

  // RM audit data
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
      {/* Funnel */}
      <div className="flex flex-col items-center gap-0 mb-10">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col items-center" style={{ width: "100%" }}>
            {i > 0 && (
              <div style={{ width: 2, height: 16, background: "rgba(255,255,255,0.1)" }} />
            )}
            <div
              className="rounded-lg flex items-center justify-between"
              style={{
                width: step.widthPct,
                padding: "14px 20px",
                border: step.isLast
                  ? "1px solid rgba(0,200,7,0.15)"
                  : `1px solid rgba(255,255,255,${i === 0 ? 0.08 : 0.06})`,
                background: step.isLast ? "rgba(0,200,7,0.05)" : "transparent",
              }}
            >
              <span className="text-[14px] text-white">{step.label}</span>
              {step.pnl != null ? (
                <span className="text-[14px] font-bold tabular-nums" style={{ color: rawColor(step.pnl) }}>
                  {fmtPnl(step.pnl)}
                </span>
              ) : (
                <span className="text-[14px] font-bold tabular-nums text-white">
                  {step.value?.toLocaleString() ?? 0}
                  {totalSignals > 0 && step.value != null && (
                    <span className="text-[11px] font-normal ml-2" style={{ color: "#919fa6" }}>
                      ({(step.value / totalSignals * 100).toFixed(0)}%)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* RM Performance table */}
      {(rmEndorsed.n != null || rmOverridden.n != null) && (
        <>
          <p className="text-[14px] text-white font-medium mb-4">RM Performance</p>
          <div className="overflow-x-auto">
            <div
              className="grid text-[14px] font-bold text-white"
              style={{
                gridTemplateColumns: "2.5fr 1fr 1.5fr",
                borderBottom: "1.5px solid rgba(255,255,255,0.2)",
                padding: "12px 0",
              }}
            >
              <span>Metric</span>
              <span className="text-right">Value</span>
              <span className="text-right">Detail</span>
            </div>
            {rmRows.map((row, i) => (
              <div
                key={i}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2.5fr 1fr 1.5fr",
                  padding: "16px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 14,
                }}
              >
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

function MissedTradesTab({ topNearMisses, skipReasons }: { topNearMisses: any[]; skipReasons: any }) {
  /* Best missed opportunities */
  const misses = topNearMisses.filter((m: any) => pnlVal(m.cf_pnl) > 0).sort((a: any, b: any) => pnlVal(b.cf_pnl) - pnlVal(a.cf_pnl));
  const maxMiss = Math.max(1, ...misses.map((m: any) => pnlVal(m.cf_pnl)));

  /* Aggregate skip reasons across all bots */
  const allSkips: Record<string, number> = {};
  Object.values(skipReasons ?? {}).forEach((reasons: any) => {
    const items: { reason: string; count: number }[] = Array.isArray(reasons)
      ? reasons
      : Object.entries(reasons ?? {}).map(([r, c]) => ({ reason: r, count: Number(c) }));
    items.forEach((item) => {
      allSkips[item.reason] = (allSkips[item.reason] ?? 0) + item.count;
    });
  });
  const skipEntries = Object.entries(allSkips).sort(([, a], [, b]) => b - a);
  const totalSkips = skipEntries.reduce((s, [, c]) => s + c, 0);
  const maxSkip = Math.max(1, ...skipEntries.map(([, c]) => c));

  const hasContent = misses.length > 0 || skipEntries.length > 0;
  if (!hasContent) return <p className="text-[13px]" style={{ color: "#919fa6" }}>No missed trade data available.</p>;

  return (
    <div>
      {/* Best missed */}
      {misses.length > 0 && (
        <>
          <p className="text-[14px] text-white font-medium mb-4">Best Missed Opportunities</p>
          {misses.slice(0, 10).map((m: any, i: number) => {
            const v = pnlVal(m.cf_pnl);
            return (
              <div key={i} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="text-[14px] text-white truncate" style={{ width: 200, minWidth: 200 }}>
                  {m.market_title ?? m.question ?? "Unknown market"}
                </span>
                <div className="flex-1 h-[4px] rounded-full" style={{ background: "#1a1a1a" }}>
                  <div className="h-full rounded-full" style={{ width: `${(v / maxMiss) * 100}%`, background: "#00C807" }} />
                </div>
                <span className="text-[14px] tabular-nums text-right" style={{ width: 80, minWidth: 80, color: "#00C807" }}>
                  {fmtPnl(v)}
                </span>
              </div>
            );
          })}
        </>
      )}

      {/* Why were trades skipped */}
      {skipEntries.length > 0 && (
        <>
          <p className="text-[14px] text-white font-medium mt-8 mb-4">Why Were Trades Skipped?</p>
          {skipEntries.slice(0, 10).map(([reason, count], i) => (
            <div key={i} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              <span className="text-[14px] text-white truncate" style={{ width: 200, minWidth: 200 }}>{reason}</span>
              <div className="flex-1 h-[4px] rounded-full" style={{ background: "#1a1a1a" }}>
                <div className="h-full rounded-full" style={{ width: `${(count / maxSkip) * 100}%`, background: "#fff" }} />
              </div>
              <span className="text-[14px] tabular-nums text-right text-white" style={{ width: 100, minWidth: 100 }}>
                {count} <span style={{ color: "#919fa6" }}>({totalSkips > 0 ? (count / totalSkips * 100).toFixed(0) : 0}%)</span>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function CounterfactualTab({
  o,
  cfPnl,
  realPnl,
  cfByCat,
  cfBySide,
}: {
  o: any;
  cfPnl: number;
  realPnl: number;
  cfByCat: any[];
  cfBySide: any;
}) {
  const cfWinRate = o.cf_win_rate ?? null;
  const cfWinCi = o.cf_win_rate_ci ?? null;
  const filterSavings = realPnl - cfPnl;

  const maxAbsCf = Math.max(1, ...cfByCat.map((c: any) => Math.abs(pnlVal(c.cf_pnl_sum ?? c.cf_pnl ?? 0))));

  // CF by side table
  const cfYes = cfBySide.YES ?? cfBySide.yes ?? {};
  const cfNo = cfBySide.NO ?? cfBySide.no ?? {};

  return (
    <div>
      {/* Text summary */}
      <div className="mb-8">
        <p className="text-[14px] text-white mb-2">
          If you placed <em>every</em> signal without filtering:
        </p>
        <div className="flex gap-6 text-[14px]" style={{ color: "#919fa6" }}>
          <span>CF PnL: <span style={{ color: rawColor(cfPnl) }}>{fmtPnl(cfPnl)}</span></span>
          {cfWinRate != null && (
            <span>CF Win Rate: <span className="text-white">{fmtPct(cfWinRate)}</span>
              {cfWinCi && (
                <span className="text-[11px] ml-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  [{fmtPct(cfWinCi[0])}-{fmtPct(cfWinCi[1])}]
                </span>
              )}
            </span>
          )}
          <span>
            Filter savings: <span style={{ color: rawColor(filterSavings) }}>{fmtPnl(filterSavings)}</span>
          </span>
        </div>
      </div>

      {/* CF by category diverging bars */}
      {cfByCat.length > 0 && (
        <>
          <p className="text-[14px] text-white font-medium mb-4">Counterfactual PnL by Category</p>
          {cfByCat.sort((a: any, b: any) => pnlVal(b.cf_pnl_sum ?? b.cf_pnl ?? 0) - pnlVal(a.cf_pnl_sum ?? a.cf_pnl ?? 0)).map((c: any, i: number) => {
            const v = pnlVal(c.cf_pnl_sum ?? c.cf_pnl ?? 0);
            const n = c.n ?? c.cf_n_decided ?? 0;
            return (
              <DivBar
                key={i}
                label={c.category ?? "unknown"}
                labelSub={`n=${n}`}
                value={v}
                maxAbs={maxAbsCf}
              />
            );
          })}
        </>
      )}

      {/* CF by side table */}
      {(cfYes.cf_pnl != null || cfNo.cf_pnl != null) && (
        <>
          <p className="text-[14px] text-white font-medium mt-8 mb-4">Counterfactual by Side</p>
          <div className="overflow-x-auto">
            <div
              className="grid text-[14px] font-bold text-white"
              style={{
                gridTemplateColumns: "1.5fr 1fr 1fr",
                borderBottom: "1.5px solid rgba(255,255,255,0.2)",
                padding: "12px 0",
              }}
            >
              <span>Metric</span>
              <span className="text-right">NO</span>
              <span className="text-right">YES</span>
            </div>
            {[
              { label: "CF PnL", no: fmtPnl(pnlVal(cfNo.cf_pnl ?? cfNo.cf_pnl_sum)), yes: fmtPnl(pnlVal(cfYes.cf_pnl ?? cfYes.cf_pnl_sum)), noColor: rawColor(pnlVal(cfNo.cf_pnl ?? cfNo.cf_pnl_sum ?? 0)), yesColor: rawColor(pnlVal(cfYes.cf_pnl ?? cfYes.cf_pnl_sum ?? 0)) },
              { label: "CF Win Rate", no: cfNo.cf_win_rate != null ? fmtPct(cfNo.cf_win_rate) : "\u2014", yes: cfYes.cf_win_rate != null ? fmtPct(cfYes.cf_win_rate) : "\u2014" },
              { label: "CF Decided", no: cfNo.cf_n_decided ?? cfNo.n ?? "\u2014", yes: cfYes.cf_n_decided ?? cfYes.n ?? "\u2014" },
            ].map((row, i) => (
              <div
                key={i}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "1.5fr 1fr 1fr",
                  padding: "16px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 14,
                }}
              >
                <span className="text-white/70">{row.label}</span>
                <span className="text-right tabular-nums" style={{ color: (row as any).noColor ?? "#fff" }}>{row.no}</span>
                <span className="text-right tabular-nums" style={{ color: (row as any).yesColor ?? "#fff" }}>{row.yes}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
