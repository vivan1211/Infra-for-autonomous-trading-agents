"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { useWikiAggregates } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";

function pct(v: any): string {
  if (v == null) return "\u2014";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function num(v: any, decimals = 2): string {
  if (v == null) return "\u2014";
  return Number(v).toFixed(decimals);
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-[#FF6B8A]/20 text-[#FF6B8A]",
    high: "bg-[#FB923C]/20 text-[#FB923C]",
    medium: "bg-[#FBBF24]/20 text-[#FBBF24]",
    low: "bg-white/[0.06] text-white/70",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${colors[severity] ?? colors.low}`}>
      {severity}
    </span>
  );
}

export default function AggregatesPage() {
  const { aggregates, loading, error } = useWikiAggregates();

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !aggregates) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "No aggregate data yet"}</p>;
  }

  const snap: any = aggregates?.data_snapshot ?? {};
  const agg: any = snap;
  const tradeCount = Number(aggregates?.trade_count ?? 0);
  const lastTradeAt = aggregates?.last_trade_at ?? null;
  const provenance: any = snap._provenance ?? {};
  const hash = provenance.input_data_hash ?? null;

  // Main sections from the aggregate blob
  const overall: any = agg.overall ?? {};
  const calibration: any = agg.calibration ?? {};
  const perBot: any[] = Array.isArray(agg.per_bot) ? agg.per_bot : [];
  const alerts: any[] = Array.isArray(agg.deterministic_alerts) ? agg.deterministic_alerts : [];

  // Reliability diagram bins
  const reliabilityBins: any[] = Array.isArray(calibration.reliability_bins) ? calibration.reliability_bins : [];

  // Remaining sections for collapsible JSON preview
  const knownKeys = new Set([
    "trade_count", "last_trade_at", "provenance_hash", "content_hash",
    "overall", "calibration", "per_bot", "deterministic_alerts",
  ]);
  const otherSections = Object.entries(agg).filter(([k]) => !knownKeys.has(k));

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <h2 className="text-[22px] font-semibold text-white">Cross-Trade Aggregates</h2>
        <div className="flex items-center gap-4 mt-2 text-[13px] text-white/60">
          <span>{tradeCount} trades</span>
          {lastTradeAt && (
            <>
              <span>&middot;</span>
              <span>Last trade: {new Date(lastTradeAt as string).toLocaleDateString()}</span>
            </>
          )}
          {hash && (
            <>
              <span>&middot;</span>
              <span className="font-mono text-[11px]">{String(hash).slice(0, 12)}</span>
            </>
          )}
        </div>
      </div>

      {/* Overall Stats */}
      <OverallStats overall={overall} tradeCount={tradeCount} />

      {/* Calibration */}
      {(calibration.brier_score != null || reliabilityBins.length > 0) && (
        <CalibrationSection calibration={calibration} reliabilityBins={reliabilityBins} />
      )}

      {/* Per-Bot */}
      {perBot.length > 0 && <PerBotSection perBot={perBot} />}

      {/* Deterministic Alerts */}
      {alerts.length > 0 && <AlertsSection alerts={alerts} />}

      {/* Other sections as collapsible JSON */}
      {otherSections.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Additional Data</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6 space-y-4">
            {otherSections.map(([key, value]) => (
              <CollapsibleJson key={key} label={key} data={value} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  OVERALL STATS                                                   */
/* ════════════════════════════════════════════════════════════════ */

function OverallStats({ overall, tradeCount }: { overall: any; tradeCount: number }) {
  const realPnl = Number(overall.real_pnl ?? overall.total_pnl ?? 0);
  const winRate = overall.win_rate ?? null;
  const sharpe = overall.sharpe ?? overall.sharpe_ratio ?? null;
  const maxDrawdown = overall.max_drawdown ?? null;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white">Overall Performance</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="divide-y divide-white/[0.06]">
          <Row label="Total Trades" value={String(tradeCount)} />
          <Row
            label="Real P&L"
            value={realPnl !== 0 ? `${realPnl >= 0 ? "+" : ""}${formatCurrency(realPnl)}` : "\u2014"}
            valueClass={realPnl !== 0 ? pnlColor(realPnl) : undefined}
          />
          <Row label="Win Rate" value={pct(winRate)} />
          <Row label="Sharpe Ratio" value={num(sharpe)} tip="Risk-adjusted return. Higher is better; above 1.0 is good." />
          <Row
            label="Max Drawdown"
            value={maxDrawdown != null ? pct(maxDrawdown) : "\u2014"}
            tip="Largest peak-to-trough decline"
          />
          {overall.avg_edge != null && <Row label="Avg Edge" value={pct(overall.avg_edge)} />}
          {overall.avg_confidence != null && <Row label="Avg Confidence" value={pct(overall.avg_confidence)} />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  CALIBRATION                                                     */
/* ════════════════════════════════════════════════════════════════ */

function CalibrationSection({ calibration, reliabilityBins }: { calibration: any; reliabilityBins: any[] }) {
  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Calibration</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="divide-y divide-white/[0.06]">
          {calibration.brier_score != null && (
            <Row label="Brier Score" value={num(calibration.brier_score, 4)} tip="Lower is better. 0 = perfect calibration." />
          )}
          {calibration.log_loss != null && (
            <Row label="Log Loss" value={num(calibration.log_loss, 4)} />
          )}
          {calibration.overconfidence_index != null && (
            <Row label="Overconfidence Index" value={num(calibration.overconfidence_index, 3)} tip="Positive = overconfident, negative = underconfident" />
          )}
        </div>

        {/* Reliability Diagram as Table */}
        {reliabilityBins.length > 0 && (
          <div className="mt-8">
            <h3 className="text-[16px] font-medium text-white mb-4">
              Reliability Diagram
              <InfoTip text="Shows predicted probability vs actual outcome rate. Perfect calibration means predicted = actual." />
            </h3>
            <div style={{ minWidth: "400px" }}>
              <div className="grid items-center pb-3 text-[13px] font-bold text-white"
                style={{ gridTemplateColumns: "1fr 1fr 1fr 0.8fr" }}>
                <span>Bin</span>
                <span className="text-right">Predicted</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Count</span>
              </div>
              <div className="h-[1.5px] bg-white/[0.2]" />
              {reliabilityBins.map((bin: any, i: number) => (
                <div key={i} className="grid items-center py-3 text-[13px]"
                  style={{ gridTemplateColumns: "1fr 1fr 1fr 0.8fr" }}>
                  <span className="text-white/70">
                    {bin.bin_label ?? bin.bin ?? `${pct(bin.lower)}\u2013${pct(bin.upper)}`}
                  </span>
                  <span className="text-white tabular-nums text-right">{pct(bin.predicted ?? bin.avg_confidence)}</span>
                  <span className="text-white tabular-nums text-right">{pct(bin.actual ?? bin.win_rate)}</span>
                  <span className="text-white/60 tabular-nums text-right">{bin.count ?? bin.n ?? "\u2014"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  PER-BOT                                                         */
/* ════════════════════════════════════════════════════════════════ */

function PerBotSection({ perBot }: { perBot: any[] }) {
  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Per-Bot Breakdown</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div style={{ minWidth: "500px" }}>
          <div className="grid items-center pb-3 text-[13px] font-bold text-white"
            style={{ gridTemplateColumns: "2fr 0.7fr 0.8fr 1fr" }}>
            <span>Bot</span>
            <span className="text-right">Trades</span>
            <span className="text-right">Win Rate</span>
            <span className="text-right">P&L</span>
          </div>
          <div className="h-[1.5px] bg-white/[0.2]" />
          {perBot.map((bot: any, i: number) => {
            const botPnl = Number(bot.pnl ?? bot.total_pnl ?? 0);
            return (
              <div key={bot.bot_type_id ?? bot.name ?? i}
                className="grid items-center py-3 text-[13px]"
                style={{ gridTemplateColumns: "2fr 0.7fr 0.8fr 1fr" }}>
                <span className="text-white">{bot.bot_name ?? bot.bot_type_id ?? bot.name ?? "\u2014"}</span>
                <span className="text-white/70 tabular-nums text-right">{bot.trades ?? bot.trade_count ?? "\u2014"}</span>
                <span className="text-white tabular-nums text-right">{pct(bot.win_rate)}</span>
                <span className={`font-medium tabular-nums text-right ${botPnl !== 0 ? pnlColor(botPnl) : "text-white/40"}`}>
                  {botPnl !== 0 ? `${botPnl >= 0 ? "+" : ""}${formatCurrency(botPnl)}` : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  ALERTS                                                          */
/* ════════════════════════════════════════════════════════════════ */

function AlertsSection({ alerts }: { alerts: any[] }) {
  return (
    <div className="mt-14">
      <h2 className="text-[22px] font-semibold text-white">Deterministic Alerts</h2>
      <div className="border-t border-white/[0.08] mt-3 pt-6 space-y-3">
        {alerts.map((alert: any, i: number) => (
          <div key={i} className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-b-0">
            {severityBadge(alert.severity ?? "low")}
            <div className="min-w-0">
              <p className="text-[14px] text-white">{alert.title ?? alert.message ?? alert.rule ?? "Alert"}</p>
              {alert.description && (
                <p className="text-[13px] text-white/60 mt-1">{alert.description}</p>
              )}
              {alert.affected_bots && (
                <p className="text-[12px] text-white/50 mt-1">Affected: {Array.isArray(alert.affected_bots) ? alert.affected_bots.join(", ") : alert.affected_bots}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  SHARED COMPONENTS                                               */
/* ════════════════════════════════════════════════════════════════ */

function Row({ label, value, valueClass, tip }: { label: string; value: string; valueClass?: string; tip?: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[13px] text-white/80">
        {label}
        {tip && <InfoTip text={tip} />}
      </span>
      <span className={`text-[13px] font-medium tabular-nums ${valueClass ?? "text-white"}`}>{value}</span>
    </div>
  );
}

function CollapsibleJson({ label, data }: { label: string; data: any }) {
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[14px] text-white/80 hover:text-white transition-colors py-2">
        {label.replace(/_/g, " ")}
      </summary>
      <pre className="mt-2 p-4 bg-white/[0.03] rounded-lg text-[12px] text-white/70 overflow-x-auto max-h-[400px] overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
