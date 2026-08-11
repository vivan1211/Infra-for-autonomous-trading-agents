"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCurrency, pnlColor } from "@/lib/utils";
import { useWikiTrade } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";

function pct(v: any): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

export default function TradeWikiPage() {
  const { id } = useParams<{ id: string }>();
  const { trade, loading, error } = useWikiTrade(id);

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !trade) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error || "Trade not found"}</p>;
  }

  const t: any = trade;
  const fm: any = t.frontmatter ?? {};
  const rawSnap = t.data_snapshot;
  const snap: any = typeof rawSnap === "string" ? JSON.parse(rawSnap) : (rawSnap ?? {});
  const signals: any = snap.signals ?? {};
  const autopsy: any = snap.autopsy ?? {};
  const tradePnl = Number(signals.pnl ?? fm.pnl ?? 0);
  const bucket = signals.bucket ?? fm.bucket ?? fm.status ?? "";
  const environment = signals.environment || fm.environment || "training";

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <Link href="/evaluations/trades" className="text-[13px] text-white/60 hover:text-white/80 transition-colors">
          ← Back to Trades
        </Link>
        <h1 className="text-[24px] md:text-[32px] font-bold text-white tracking-tight mt-3 leading-snug">
          {fm.market_title || id}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-[14px] text-white/70">
          <span className={`${bucket === "won" ? "text-[#00C807]" : bucket === "lost" ? "text-[#FF6B8A]" : "text-white"}`}>
            {bucket.replace(/_/g, " ") || "pending"}
          </span>
          {tradePnl !== 0 && (
            <>
              <span>·</span>
              <span className={pnlColor(tradePnl)}>{tradePnl >= 0 ? "+" : ""}{formatCurrency(tradePnl)}</span>
            </>
          )}
          {fm.bot_type_id && (
            <>
              <span>·</span>
              <span>{fm.bot_type_id}</span>
            </>
          )}
          {fm.side && (
            <>
              <span>·</span>
              <span>{fm.side}</span>
            </>
          )}
          {environment === "training" && (
            <>
              <span>·</span>
              <span className="text-white/70">Training</span>
            </>
          )}
        </div>
      </div>

      {/* Autopsy */}
      {autopsy.narrative && (
        <div>
          <h2 className="text-[22px] font-semibold text-white">Autopsy</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <p className="text-[15px] text-white/70 leading-relaxed">{autopsy.narrative}</p>
          </div>
        </div>
      )}

      {/* Key Excerpt */}
      {autopsy.key_excerpt && (
        <div className="mt-8 border-l-2 border-[#60a5fa] pl-5 py-2">
          <p className="text-[14px] text-white/80 italic leading-relaxed">{autopsy.key_excerpt}</p>
          {autopsy.key_excerpt_agent && (
            <p className="text-[12px] text-white/70 mt-2">
              — <span className="text-[#60a5fa]">
                {(autopsy.key_excerpt_agent || "").replace(/_/g, " ")}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Outcome Driver */}
      {autopsy.outcome_driver && autopsy.outcome_driver !== "NONE_OUTCOME_WAS_NOISE" && (
        <div className="mt-8">
          <span className="text-[13px] text-white/80">What would change the outcome</span>
          <p className="text-[14px] text-white mt-1">{autopsy.outcome_driver.replace(/_/g, " ")}</p>
        </div>
      )}

      {/* Trade Details */}
      <div className="mt-14">
        <h2 className="text-[22px] font-semibold text-white">Details</h2>
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          <div className="divide-y divide-white/[0.06]">
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">P&L</span>
              <span className={`text-[13px] font-medium tabular-nums ${tradePnl !== 0 ? pnlColor(tradePnl) : "text-white"}`}>
                {tradePnl !== 0 ? `${tradePnl >= 0 ? "+" : ""}${formatCurrency(tradePnl)}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Bot</span>
              <span className="text-[13px] text-white">
                {signals.bot_type_id || fm.bot_type_id || "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Category</span>
              <span className="text-[13px] text-white">
                {signals.category || fm.category || "\u2014"}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Side</span>
              <span className="text-[13px] font-medium text-white">{fm.side || signals.side || "—"}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Price</span>
              <span className="text-[13px] font-medium tabular-nums text-white">{signals.price != null ? `$${Number(signals.price).toFixed(2)}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Confidence<InfoTip text="AI's estimated probability of the chosen outcome" /></span>
              <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.confidence)}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[13px] text-white/80">Edge at Entry<InfoTip text="Difference between AI confidence and market price — the expected advantage" /></span>
              <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.edge_at_entry)}</span>
            </div>
            {signals.hedge_score != null && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-white/80">Hedge Score<InfoTip text="Score out of 15 measuring how hedged/diversified the reasoning was" /></span>
                <span className="text-[13px] font-medium tabular-nums text-white">{signals.hedge_score} / 15</span>
              </div>
            )}
            {signals.hours_to_close != null && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-white/80">Hours to Close<InfoTip text="Time between trade analysis and market resolution" /></span>
                <span className="text-[13px] font-medium tabular-nums text-white">{Number(signals.hours_to_close).toFixed(1)}h</span>
              </div>
            )}
            {autopsy.failure_mode && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-white/80">Failure Mode<InfoTip text="Post-mortem classification of why this outcome happened" /></span>
                <span className="text-[13px] font-medium text-white">{autopsy.failure_mode.replace(/_/g, " ")}</span>
              </div>
            )}
            {autopsy.decision_quality && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[13px] text-white/80">Decision Quality<InfoTip text="Post-mortem assessment: was the process good regardless of outcome?" /></span>
                <span className="text-[13px] font-medium text-white">{autopsy.decision_quality.replace(/_/g, " ")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quality Checks */}
      {(signals.base_rate_mentioned != null || signals.risk_manager_endorsed != null) && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Quality checks</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div className="divide-y divide-white/[0.06]">
              {signals.base_rate_mentioned != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Base Rate Mentioned<InfoTip text="Whether the reasoning included historical base rate analysis" /></span>
                  <span className={`text-[13px] font-medium ${signals.base_rate_mentioned ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                    {signals.base_rate_mentioned ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {signals.risk_manager_endorsed != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Risk Manager Endorsed<InfoTip text="Whether the risk manager agent approved this trade" /></span>
                  <span className={`text-[13px] font-medium ${signals.risk_manager_endorsed ? "text-[#00C807]" : "text-[#FF6B8A]"}`}>
                    {signals.risk_manager_endorsed ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {signals.risk_manager_overridden != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">RM Overridden<InfoTip text="Whether the risk manager's objection was overruled by majority" /></span>
                  <span className={`text-[13px] font-medium ${signals.risk_manager_overridden ? "text-[#FF6B8A]" : "text-[#00C807]"}`}>
                    {signals.risk_manager_overridden ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {signals.forecaster_anchored != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Forecaster Anchored<InfoTip text="Whether the forecaster showed anchoring bias to the current market price" /></span>
                  <span className={`text-[13px] font-medium ${signals.forecaster_anchored ? "text-[#FF6B8A]" : "text-[#00C807]"}`}>
                    {signals.forecaster_anchored ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {signals.sources_cited != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Sources Cited</span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{signals.sources_cited}</span>
                </div>
              )}
              {signals.model_agreement != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Model Agreement<InfoTip text="How many AI agents agreed on the trade direction" /></span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{signals.model_agreement} agents</span>
                </div>
              )}
              {signals.total_reasoning_words != null && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-white/80">Total Reasoning</span>
                  <span className="text-[13px] font-medium tabular-nums text-white">{signals.total_reasoning_words} words</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Signals (Phase G — new fields) */}
      <AdvancedSignals signals={signals} />

    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  ADVANCED SIGNALS (Phase G)                                      */
/* ════════════════════════════════════════════════════════════════ */

function AdvancedSignals({ signals }: { signals: any }) {
  const [open, setOpen] = useState(false);

  // Check if any advanced fields exist
  const hasEdge = signals.forecaster_edge_signed != null || signals.anchor_delta != null || signals.skip_reason != null;
  const hasRisk = signals.ev_estimate != null || signals.risk_score != null || signals.true_probability != null || signals.recommended_size_pct != null;
  const hasDebate = signals.probability_floor != null || signals.probability_ceiling != null || signals.debate_bracket_width != null;
  const perAgent: any[] = Array.isArray(signals.per_agent) ? signals.per_agent : [];
  const cfgAtTrade: any = signals.cfg_at_trade ?? null;

  if (!hasEdge && !hasRisk && !hasDebate && perAgent.length === 0 && !cfgAtTrade) {
    return null;
  }

  return (
    <div className="mt-14">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[22px] font-semibold text-white hover:text-white/90 transition-colors"
      >
        <span className={`text-[14px] transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
        Advanced Signals
      </button>

      {open && (
        <div className="border-t border-white/[0.08] mt-3 pt-6">
          {/* Edge */}
          {hasEdge && (
            <div className="mb-8">
              <h3 className="text-[16px] font-medium text-white mb-4">Edge</h3>
              <div className="divide-y divide-white/[0.06]">
                {signals.forecaster_edge_signed != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Forecaster Edge (signed)<InfoTip text="Signed edge: positive means forecaster saw the price as favorable" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.forecaster_edge_signed)}</span>
                  </div>
                )}
                {signals.anchor_delta != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Anchor Delta<InfoTip text="Difference between forecaster probability and market price — measures anchoring" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.anchor_delta)}</span>
                  </div>
                )}
                {signals.skip_reason != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Skip Reason</span>
                    <span className="text-[13px] font-medium text-white">{signals.skip_reason || "\u2014"}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risk Manager */}
          {hasRisk && (
            <div className="mb-8">
              <h3 className="text-[16px] font-medium text-white mb-4">Risk Manager</h3>
              <div className="divide-y divide-white/[0.06]">
                {signals.ev_estimate != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">EV Estimate<InfoTip text="Risk manager's estimated expected value of this trade" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{Number(signals.ev_estimate).toFixed(4)}</span>
                  </div>
                )}
                {signals.risk_score != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Risk Score<InfoTip text="Composite risk assessment — higher means riskier" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{Number(signals.risk_score).toFixed(3)}</span>
                  </div>
                )}
                {signals.true_probability != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">True Probability<InfoTip text="Risk manager's debiased probability estimate" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.true_probability)}</span>
                  </div>
                )}
                {signals.recommended_size_pct != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Recommended Size<InfoTip text="Kelly-derived position size as % of bankroll" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.recommended_size_pct)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Debate */}
          {hasDebate && (
            <div className="mb-8">
              <h3 className="text-[16px] font-medium text-white mb-4">Debate Bracket</h3>
              <div className="divide-y divide-white/[0.06]">
                {signals.probability_floor != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Probability Floor</span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.probability_floor)}</span>
                  </div>
                )}
                {signals.probability_ceiling != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Probability Ceiling</span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.probability_ceiling)}</span>
                  </div>
                )}
                {signals.debate_bracket_width != null && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/80">Bracket Width<InfoTip text="Spread between floor and ceiling — wider = more agent disagreement" /></span>
                    <span className="text-[13px] font-medium tabular-nums text-white">{pct(signals.debate_bracket_width)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Per-Agent */}
          {perAgent.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[16px] font-medium text-white mb-4">Per-Agent Breakdown</h3>
              <div style={{ minWidth: "400px" }}>
                <div className="grid items-center pb-3 text-[13px] font-bold text-white"
                  style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr" }}>
                  <span>Agent</span>
                  <span className="text-right">Probability</span>
                  <span className="text-right">Confidence</span>
                  <span className="text-right">Vote</span>
                </div>
                <div className="h-[1.5px] bg-white/[0.2]" />
                {perAgent.map((ag: any, i: number) => (
                  <div key={ag.role ?? ag.agent ?? i}
                    className="grid items-center py-3 text-[13px]"
                    style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr" }}>
                    <span className="text-white">{(ag.role ?? ag.agent ?? ag.name ?? "\u2014").replace(/_/g, " ")}</span>
                    <span className="text-white tabular-nums text-right">{ag.probability != null ? pct(ag.probability) : "\u2014"}</span>
                    <span className="text-white/70 tabular-nums text-right">{ag.confidence != null ? pct(ag.confidence) : "\u2014"}</span>
                    <span className={`text-right font-medium ${ag.vote === "YES" || ag.vote === "yes" ? "text-[#00C807]" : ag.vote === "NO" || ag.vote === "no" ? "text-[#FF6B8A]" : "text-white/60"}`}>
                      {ag.vote ?? ag.side ?? "\u2014"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config at Trade */}
          {cfgAtTrade && (
            <div className="mb-8">
              <h3 className="text-[16px] font-medium text-white mb-4">Config at Trade Time</h3>
              <pre className="p-4 bg-white/[0.03] rounded-lg text-[12px] text-white/70 overflow-x-auto max-h-[400px] overflow-y-auto">
                {JSON.stringify(cfgAtTrade, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
