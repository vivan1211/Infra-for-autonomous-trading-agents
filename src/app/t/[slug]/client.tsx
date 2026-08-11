"use client";

import { useState } from "react";
import { type PublicTrade } from "@/lib/api";
import { parseDebateResults, cleanReasoning, formatReasoning, AGENT_ICONS } from "@/components/trades/DebateResults";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

/* ── Helpers ── */
function relativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function tradeOutcome(trade: { status: string; settled: boolean }) {
  if (trade.status === "rejected" || trade.status === "error") return "rejected";
  if (trade.status === "skipped") return "skipped";
  if (!trade.settled) return "pending";
  return "settled";
}

function outcomeStyle(outcome: string) {
  switch (outcome) {
    case "settled": return "bg-gain/10 text-gain";
    case "rejected": return "bg-loss/10 text-loss";
    case "skipped": return "bg-warning/10 text-warning";
    default: return "bg-white/[0.04] text-text-tertiary";
  }
}

/* ── Main Client Component ── */
export default function PublicTradeClient({ initialTrade }: { initialTrade: PublicTrade }) {
  const trade = initialTrade;
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  const outcome = tradeOutcome(trade);
  const isSkippedOrRejected = ["skipped", "rejected", "error"].includes(trade.status);
  const debateResults = parseDebateResults(trade.raw_reasoning || "");
  const isSuperforecaster = debateResults && "superforecaster" in debateResults && !("forecaster" in debateResults);

  let ensembleProb: number | null = null;
  let bullProb: number | null = null;
  let bearProb: number | null = null;
  let forecasterProb: number | null = null;
  if (debateResults) {
    if (debateResults.forecaster?.probability != null) forecasterProb = Number(debateResults.forecaster.probability);
    if (debateResults.bull_researcher?.probability != null) bullProb = Number(debateResults.bull_researcher.probability);
    if (debateResults.bear_researcher?.probability != null) bearProb = Number(debateResults.bear_researcher.probability);
    if (debateResults.superforecaster?.probability != null) ensembleProb = Number(debateResults.superforecaster.probability);
    if (forecasterProb != null) {
      const weights = [
        { prob: forecasterProb, w: 0.35 },
        ...(bullProb != null ? [{ prob: bullProb, w: 0.25 }] : []),
        ...(bearProb != null ? [{ prob: bearProb, w: 0.20 }] : []),
      ];
      const totalW = weights.reduce((s, x) => s + x.w, 0);
      ensembleProb = weights.reduce((s, x) => s + x.prob * x.w, 0) / totalW;
    }
  }

  const traderSide = debateResults?.trader?.side as string || debateResults?.superforecaster?.side as string || trade.side;
  const riskScore = debateResults?.risk_manager?.risk_score as number | undefined;

  return (
    <article className="min-h-screen bg-bg text-text-primary">
      <PublicHeader />
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 pb-20">

        {/* ── Back Nav ── */}
        <nav className="flex items-center justify-between pt-2 pb-4" aria-label="Trade meta">
          {trade.owner_display_name ? (
            <div className="text-[13px] text-[#919fa6]">
              Shared by <span className="text-[#ffffff] font-medium truncate max-w-[200px] sm:max-w-none inline-block align-bottom">{trade.owner_display_name}</span>
            </div>
          ) : <div />}
          <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
            trade.environment === "actual" ? "bg-gain/10 text-gain" : "bg-warning/10 text-warning"
          }`}>
            {trade.environment === "actual" ? "Live" : "Training"}
          </span>
        </nav>

        {/* ── Header ── */}
        <header className="mb-2">
          <h1 className="text-[28px] font-bold text-[#ffffff] tracking-tight leading-tight">
            {trade.market_title || trade.market_ticker}
          </h1>
        </header>
        <div className="text-[14px] text-[#919fa6] mb-8" suppressHydrationWarning>
          {trade.exchange === "polymarket" ? "Polymarket" : "Kalshi"} &middot; {relativeTime(trade.timestamp)}
        </div>

        {/* ── Two-Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 mb-12">

          {/* ── LEFT COLUMN ── */}
          <section aria-label="Trade analysis" className="min-w-0">
            {/* Outcome + summary */}
            <div className="flex items-center gap-4 py-4 border-y border-[#30363a]">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold ${outcomeStyle(outcome)}`}>
                <span className="w-[5px] h-[5px] rounded-full bg-current" />
                {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
              </span>
              <span className="text-[13px] text-[#919fa6]">
                {trade.action.toUpperCase()} {trade.side.toUpperCase()} &middot; ${trade.price.toFixed(2)}
              </span>
            </div>

            {/* ── Reasoning ── */}
            <div className="flex gap-6 border-b border-[#21262d]">
              <span className="py-3 -mb-px text-[14px] font-semibold border-b-2 text-[#ffffff] border-[#ffffff]">Reasoning</span>
            </div>

            {debateResults && (
              <section aria-label="Agent consensus" className="pt-7">
                <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">Agent Consensus</h2>
                <div className="h-px bg-[#30363a] mb-5" />

                <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 items-center sm:items-start mb-8">
                  {/* Donut */}
                  <div className="w-[120px] h-[120px] rounded-full border-[3px] flex flex-col items-center justify-center shrink-0"
                    style={{ borderColor: isSkippedOrRejected ? "var(--color-warning)" : "var(--color-gain)" }}>
                    <div className="text-[28px] font-bold text-[#ffffff] leading-none">
                      {(() => {
                        const rawProb = ensembleProb ?? (trade.confidence || null);
                        if (rawProb == null) return "\u2014%";
                        const tradedSide = (traderSide || trade.side).toLowerCase();
                        const sideProbability = tradedSide === "no" ? 1 - rawProb : rawProb;
                        return `${Math.round(sideProbability * 100)}%`;
                      })()}
                    </div>
                    <div className="text-[11px] text-[#919fa6] mt-0.5">P({(traderSide || trade.side).toUpperCase()})</div>
                    <div className={`text-[10px] font-semibold uppercase tracking-wider mt-1 ${isSkippedOrRejected ? "text-warning" : (traderSide || trade.side).toLowerCase() === "yes" ? "text-gain" : "text-loss"}`}>
                      {isSkippedOrRejected ? "SKIPPED" : String(traderSide || trade.side).toUpperCase()}
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="flex-1 min-w-0">
                    {!isSuperforecaster ? (
                      <>
                        {[
                          { name: "Forecaster", prob: forecasterProb, color: "" },
                          { name: "Bull", prob: bullProb, color: "text-gain" },
                          { name: "Bear", prob: bearProb, color: "text-loss" },
                        ].filter(b => b.prob != null).map((bar) => (
                          <div key={bar.name} className="flex items-center gap-3 mb-2.5">
                            <span className="text-[13px] text-[#919fa6] w-20 shrink-0 truncate">{bar.name}</span>
                            <div className="flex-1 h-[6px] bg-white/[0.04] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round((bar.prob ?? 0) * 100)}%`,
                                  background: bar.color === "text-gain" ? "rgba(0,200,7,0.5)" : bar.color === "text-loss" ? "rgba(255,107,138,0.4)" : "rgba(255,255,255,0.3)",
                                }}
                              />
                            </div>
                            <span className={`text-[13px] font-semibold tabular-nums w-10 text-right ${bar.color || "text-[#ffffff]"}`}>
                              {Math.round((bar.prob ?? 0) * 100)}%
                            </span>
                          </div>
                        ))}
                      </>
                    ) : null}

                    {!!isSuperforecaster && !!debateResults.superforecaster && (
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="text-[13px] text-[#919fa6] w-24 shrink-0 truncate">Superforecaster</span>
                        <div className="flex-1 h-[6px] bg-white/[0.04] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-white/30" style={{ width: `${Math.round(Number(debateResults.superforecaster.probability ?? 0) * 100)}%` }} />
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums w-10 text-right">
                          {Math.round(Number(debateResults.superforecaster.probability ?? 0) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bulls say / Bears say */}
                <BullsBearsSay debateResults={debateResults} isSuperforecaster={!!isSuperforecaster} />

                {/* Superforecaster key factors */}
                {!!isSuperforecaster && !!debateResults.superforecaster?.key_factors && (
                  <div className="border border-[#21262d] rounded-xl p-5 mb-10">
                    <div className="text-[13px] font-bold text-[#ffffff] mb-2.5">Key Factors</div>
                    <ul className="space-y-1">
                      {(debateResults.superforecaster.key_factors as string[]).map((f: string, i: number) => (
                        <li key={i} className="text-[13px] text-[#919fa6] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[3px] before:h-[3px] before:rounded-full before:bg-[#919fa6]">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Full Debate Accordion */}
                <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">{isSuperforecaster ? "Analysis" : "Full Debate"}</h2>
                <div className="h-px bg-[#30363a] mb-2" />
                <div className="text-[13px] text-[#919fa6] mb-5">
                  {Object.keys(debateResults).length} agents &middot; {
                    Object.values(debateResults).reduce((s, a) => s + Number(a._elapsed || 0), 0).toFixed(1)
                  }s total
                </div>

                <AgentAccordion debateResults={debateResults} openAgent={openAgent} setOpenAgent={setOpenAgent} />
              </section>
            )}

            {/* Fallback if no debate results */}
            {!debateResults && trade.bot_reasoning && (
              <section aria-label="Reasoning" className="pt-7">
                <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">Reasoning</h2>
                <div className="h-px bg-[#30363a] mb-5" />
                <p className="text-[13px] text-[#e0e0e0] leading-[1.7] whitespace-pre-wrap">{formatReasoning(cleanReasoning(trade.bot_reasoning))}</p>
              </section>
            )}
          </section>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-[70px]">
              <div className="bg-white/[0.02] border border-border rounded-xl p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[16px] font-semibold text-[#ffffff]">Trade Position</h3>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                    trade.environment === "actual"
                      ? "bg-gain/10 text-gain border border-gain/20"
                      : "bg-warning/10 text-warning border border-warning/20"
                  }`}>
                    {trade.environment === "actual" ? "Live" : "Training"}
                  </span>
                </div>

                {/* Side Badge */}
                <div className="mb-5">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider border ${
                    trade.side.toLowerCase() === "yes" ? "bg-gain/10 text-gain border-gain/20" : "bg-loss/10 text-loss border-loss/20"
                  }`}>
                    {trade.side.toUpperCase()}
                  </span>
                </div>

                {/* Entry Price */}
                <div className="border-t border-border pt-4 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Entry Price</span>
                    <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums">${trade.price.toFixed(2)}</span>
                  </div>
                </div>

                {/* Position Details */}
                <div className="border-t border-border pt-4 space-y-3 mb-4">
                  {(ensembleProb != null || trade.confidence) && (() => {
                    const rawProb = ensembleProb ?? (trade.confidence || null);
                    if (rawProb == null) return null;
                    const tradedSide = (traderSide || trade.side).toLowerCase();
                    const sideProbability = tradedSide === "no" ? 1 - rawProb : rawProb;
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">P({trade.side.toUpperCase()})</span>
                        <span className="text-[13px] text-[#ffffff]">{Math.round(sideProbability * 100)}%</span>
                      </div>
                    );
                  })()}
                  {riskScore != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Risk Score</span>
                      <span className="text-[13px] text-[#ffffff]">{riskScore.toFixed(1)} / 10</span>
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="border-t border-border pt-4 space-y-2 mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Placed</span>
                    <span className="text-[13px] text-[#919fa6]" suppressHydrationWarning>{new Date(trade.timestamp).toLocaleString()}</span>
                  </div>
                  {trade.settled_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Settled</span>
                      <span className="text-[13px] text-[#919fa6]" suppressHydrationWarning>{new Date(trade.settled_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="text-[11px] text-[#919fa6] text-center mb-2">AI-powered prediction market trading</div>
                <Link
                  href="/"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gain text-black text-[13px] font-semibold hover:bg-gain/90 transition-colors"
                >
                  Learn more about Prediction Market Agents
                </Link>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </article>
  );
}

/* ── Public Header ── */
function PublicHeader() {
  return (
    <header className="border-b border-[#21262d] bg-bg/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 flex items-center justify-between h-14">
        <Link href="/" className="text-[16px] font-bold text-[#ffffff] tracking-tight">
          Prediction Market Agents
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[12px] md:text-[13px] text-[#919fa6] hover:text-[#ffffff] transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="text-[12px] md:text-[13px] text-black bg-gain px-3 md:px-4 py-1.5 rounded-lg font-medium hover:bg-gain/90 transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ── Agent Accordion ── */
function AgentAccordion({ debateResults, openAgent, setOpenAgent }: {
  debateResults: Record<string, Record<string, unknown>>;
  openAgent: string | null;
  setOpenAgent: (v: string | null) => void;
}) {
  const orderedRoles = ["research", "superforecaster", "forecaster", "news_analyst", "bull_researcher", "bear_researcher", "risk_manager", "trader"];
  const knownRoles = orderedRoles.filter((r) => debateResults[r]);
  const extraRoles = Object.keys(debateResults).filter((r) => !orderedRoles.includes(r));
  const roles = [...knownRoles, ...extraRoles];

  return (
    <div>
      {roles.map((role) => {
        const ag = debateResults[role];
        const meta = AGENT_ICONS[role] || { label: role };
        const isOpen = openAgent === role;
        const elapsed = ag._elapsed ? `${ag._elapsed}s` : "";
        const prob = ag.probability as number | undefined;
        const side = ag.side as string | undefined;
        const agRiskScore = ag.risk_score as number | undefined;
        const reasoning = String(ag.reasoning || ag.content || "");
        const keyFactors = ag.key_factors as string[] | undefined;
        const keyArguments = ag.key_arguments as string[] | undefined;
        const riskFactors = ag.risk_factors as string[] | undefined;
        const isTrader = role === "trader" || role === "superforecaster";

        return (
          <div key={role} className="border-b border-[#21262d] last:border-b-0">
            <button
              onClick={() => setOpenAgent(isOpen ? null : role)}
              className="w-full flex items-center justify-between py-4 group cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="text-left">
                <div className="text-[13px] font-bold text-[#ffffff]">{meta.label}</div>
                <div className="text-[12px] text-[#919fa6]">{elapsed}</div>
              </div>
              <div className="flex items-center gap-4">
                {isTrader && side && (
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    String(side).toLowerCase() === "yes" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                  }`}>
                    {side}
                  </span>
                )}
                {!isTrader && prob != null && (
                  <span className={`text-[13px] font-semibold tabular-nums ${
                    role === "bull_researcher" ? "text-gain" : role === "bear_researcher" ? "text-loss" : "text-[#ffffff]"
                  }`}>
                    {Math.round(prob * 100)}%
                  </span>
                )}
                {!isTrader && agRiskScore != null && (
                  <span className="text-[13px] text-[#919fa6] tabular-nums">{agRiskScore.toFixed(1)} / 10</span>
                )}
                <ChevronRight className={`w-3.5 h-3.5 text-[#919fa6] transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </div>
            </button>
            {isOpen && (
              <div className="pb-5">
                <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
                  {prob != null && <span className="text-[12px] text-[#919fa6]">P(YES) <span className="text-[#ffffff] font-medium">{(prob * 100).toFixed(1)}%</span></span>}
                  {agRiskScore != null && <span className="text-[12px] text-[#919fa6]">Risk <span className="text-[#ffffff] font-medium">{agRiskScore.toFixed(1)}/10</span></span>}
                </div>
                {reasoning && (
                  <p className="text-[13px] text-[#e0e0e0] leading-[1.7] whitespace-pre-wrap">{formatReasoning(cleanReasoning(reasoning))}</p>
                )}
                {(keyFactors || keyArguments || riskFactors) && (
                  <div className="mt-3 pt-3 border-t border-[#21262d]">
                    <div className="text-[11px] text-[#919fa6] uppercase tracking-wider mb-2">
                      {keyArguments ? "Key Arguments" : riskFactors ? "Risk Factors" : "Key Factors"}
                    </div>
                    <ul className="space-y-0.5">
                      {(keyArguments || riskFactors || keyFactors || []).map((f, i) => (
                        <li key={i} className="text-[12px] text-[#919fa6] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[3px] before:h-[3px] before:rounded-full before:bg-[#919fa6]">
                          {String(f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Bulls/Bears Say ── */
function BullsBearsSay({ debateResults, isSuperforecaster }: { debateResults: Record<string, Record<string, unknown>>; isSuperforecaster: boolean }) {
  if (isSuperforecaster || !debateResults.bull_researcher || !debateResults.bear_researcher) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
      {[
        { title: "Bulls say", data: debateResults.bull_researcher, field: "key_arguments" },
        { title: "Bears say", data: debateResults.bear_researcher, field: "key_arguments" },
      ].map(({ title, data, field }) => {
        const args = (data[field] as string[]) || [];
        const quote = args.length > 0 ? args.slice(0, 2).join(". ") + "." : String(data.reasoning || "").slice(0, 200);
        return (
          <div key={title} className="border border-[#21262d] rounded-xl p-5">
            <div className="text-[13px] font-bold text-[#ffffff] mb-2.5">{title}</div>
            <div className="text-[13px] text-[#e0e0e0] leading-[1.7] mb-3">&ldquo;{quote}&rdquo;</div>
          </div>
        );
      })}
    </div>
  );
}
