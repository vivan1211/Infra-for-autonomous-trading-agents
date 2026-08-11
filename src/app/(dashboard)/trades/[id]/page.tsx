"use client";

import { useParams } from "next/navigation";
import { useTrade } from "@/hooks/use-trade";
import { useMarket } from "@/hooks/use-market";
import { useAgents } from "@/hooks/use-agents";
import { parseDebateResults, cleanReasoning, formatReasoning, AGENT_ICONS } from "@/components/trades/DebateResults";
import { formatMoneyFull } from "@/lib/utils";
import { ChevronRight, Share2, Check } from "lucide-react";
import { useState } from "react";
import type { Trade, Market } from "@/lib/api";
import Link from "next/link";
import { useAuth } from "@/context/auth";

/* ── Helpers ── */
function generateSlug(title: string, maxLen = 80): string {
  if (!title) return "";
  let slug = title.toLowerCase().trim();
  slug = slug.replace(/[^a-z0-9\s-]/g, '');   // ASCII only, match backend
  slug = slug.replace(/[\s_]+/g, '-');
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug.slice(0, maxLen).replace(/-$/, '');
}

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

function tradeOutcome(trade: { status: string; pnl: number | null; settled: boolean }) {
  if (trade.status === "rejected" || trade.status === "error") return "rejected";
  if (trade.status === "skipped") return "skipped";
  if (!trade.settled) return "pending";
  if (trade.pnl === null) return "pending";
  return trade.pnl > 0 ? "won" : trade.pnl < 0 ? "lost" : "breakeven";
}

function outcomeStyle(outcome: string) {
  switch (outcome) {
    case "won": return "bg-gain/10 text-gain";
    case "lost": case "rejected": return "bg-loss/10 text-loss";
    case "skipped": return "bg-warning/10 text-warning";
    default: return "bg-white/[0.04] text-text-tertiary";
  }
}

/* ── Main Page ── */
export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { trade, loading, error } = useTrade(id);
  const { agents } = useAgents();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"reasoning" | "validation">("reasoning");
  const [copied, setCopied] = useState(false);

  const agent = agents?.find((a) => a.id === trade?.agent_id);
  const agentName = agent?.name || "Unknown Agent";
  const market = useMarket(trade?.market_ticker || null);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 pt-6">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-32 bg-white/[0.04] rounded" />
          <div className="h-8 w-full max-w-[500px] bg-white/[0.04] rounded" />
          <div className="h-10 w-48 bg-white/[0.04] rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
            <div className="space-y-4">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-12 bg-white/[0.04] rounded" />
                    <div className="h-6 w-16 bg-white/[0.04] rounded" />
                  </div>
                ))}
              </div>
              <div className="h-px bg-[#30363a]" />
              <div className="flex gap-6">
                <div className="h-5 w-20 bg-white/[0.04] rounded" />
                <div className="h-5 w-20 bg-white/[0.04] rounded" />
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-white/[0.04] rounded" />
                <div className="h-4 w-5/6 bg-white/[0.04] rounded" />
                <div className="h-4 w-4/6 bg-white/[0.04] rounded" />
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="bg-white/[0.02] border border-border rounded-xl p-5 space-y-4">
                <div className="h-5 w-40 bg-white/[0.04] rounded" />
                <div className="h-8 w-24 bg-white/[0.04] rounded" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-20 bg-white/[0.04] rounded" />
                    <div className="h-5 w-28 bg-white/[0.04] rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 pt-6">
        <button onClick={() => window.location.href = "/trades"} className="text-[13px] text-[#919fa6] hover:text-[#ffffff] transition-colors mb-6 flex items-center gap-1.5 cursor-pointer">
          <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to Trades
        </button>
        <h1 className="text-[20px] font-bold text-[#ffffff] mb-2">Trade not found</h1>
        <p className="text-[13px] text-[#919fa6]">{error || "This trade doesn't exist or you don't have access."}</p>
      </div>
    );
  }

  const outcome = tradeOutcome(trade);
  const isSkippedOrRejected = ["skipped", "rejected", "error"].includes(trade.status);
  const debateResults = parseDebateResults(trade.raw_reasoning || "");
  const isSuperforecaster = debateResults && "superforecaster" in debateResults && !("forecaster" in debateResults);

  /* Compute ensemble probability from debate results */
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

  const traderAction = debateResults?.trader?.action as string || debateResults?.superforecaster?.action as string || "";
  const traderSide = debateResults?.trader?.side as string || debateResults?.superforecaster?.side as string || trade.side;
  const riskScore = debateResults?.risk_manager?.risk_score as number | undefined;
  const priceDelta = market.market && trade.price ? market.market.yes_price - trade.price : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 pb-20">

      {/* ── Back Nav ── */}
      <div className="flex items-center justify-between pt-2 pb-4">
        <button onClick={() => window.location.href = "/trades"} className="text-[13px] text-[#919fa6] hover:text-[#ffffff] transition-colors flex items-center gap-1.5 cursor-pointer">
          <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to Trades
        </button>
        <div className="flex items-center gap-3">
          {profile?.trades_public && (
            <button
              onClick={() => {
                const slug = generateSlug(trade.market_title || trade.market_ticker);
                const url = `${window.location.origin}/t/${slug || trade.id}`;
                navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[12px] font-medium text-[#919fa6] hover:text-[#ffffff] hover:border-[#ffffff]/20 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-gain" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Share"}
            </button>
          )}
          <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
            trade.environment === "actual" ? "bg-gain/10 text-gain" : "bg-warning/10 text-warning"
          }`}>
            {trade.environment === "actual" ? "Live" : "Training"}
          </span>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="mb-2">
        <h1 className="text-[28px] font-bold text-[#ffffff] tracking-tight leading-tight">
          {trade.market_title || trade.market_ticker}
        </h1>
      </div>

      {/* ── Subtitle ── */}
      <div className="text-[14px] text-[#919fa6] mb-8">
        {agentName} ({trade.exchange === "polymarket" ? "Polymarket" : "Kalshi"}) &middot; {relativeTime(trade.timestamp)}
      </div>

      {/* ── Two-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 mb-12">

        {/* ── LEFT COLUMN ── */}
        <div className="min-w-0">

          {/* Outcome + P&L summary — compact, no duplication with sidebar */}
          <div className="flex items-center gap-4 py-4 border-y border-[#30363a]">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold ${outcomeStyle(outcome)}`}>
              <span className="w-[5px] h-[5px] rounded-full bg-current" />
              {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
            </span>
            {trade.settled && trade.pnl != null && trade.pnl !== 0 && (
              <span className={`text-[15px] font-bold tabular-nums ${trade.pnl > 0 ? "text-gain" : "text-loss"}`}>
                {formatMoneyFull(trade.pnl)}
                {trade.total_cost > 0 && (
                  <span className="text-[12px] font-medium ml-1.5 opacity-70">
                    ({trade.pnl > 0 ? "+" : ""}{((trade.pnl / trade.total_cost) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            )}
            <span className="text-[13px] text-[#919fa6] tabular-nums">
              {trade.count} contract{trade.count !== 1 ? "s" : ""} &middot; ${trade.total_cost.toFixed(2)}
            </span>
            {outcome === "pending" && market.market?.close_time && (
              <span className="text-[12px] text-[#919fa6]">
                Resolves {new Date(market.market.close_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {/* ── Reasoning / Validation Tabs ── */}
          <div className="flex gap-4 md:gap-6 border-b border-[#21262d]">
            {(["reasoning", "validation"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 -mb-px text-[14px] font-medium border-b-2 transition-colors capitalize cursor-pointer ${
                  activeTab === tab
                    ? "text-[#ffffff] border-[#ffffff] font-semibold"
                    : "text-[#919fa6] border-transparent hover:text-[#ffffff]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── TAB: Reasoning ── */}
          {activeTab === "reasoning" && (
            <div className="pt-7">

              {/* Agent Consensus */}
              {debateResults && (
                <>
                  <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">Agent Consensus</h2>
                  <div className="h-px bg-[#30363a] mb-5" />

                  <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 items-center sm:items-start mb-8">
                    {/* Donut - shows probability of the traded side */}
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
                      <div className={`text-[10px] font-semibold uppercase tracking-wider mt-1 ${isSkippedOrRejected ? "text-warning" : "text-gain"}`}>
                        {isSkippedOrRejected ? "SKIPPED" : `${String(traderAction || trade.action).toUpperCase()} ${String(traderSide || trade.side).toUpperCase()}`}
                      </div>
                    </div>

                    {/* Bars */}
                    <div className="flex-1 min-w-0">
                      {!isSuperforecaster && (
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
                      )}

                      {isSuperforecaster && debateResults.superforecaster && (
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
                  {!isSuperforecaster && debateResults.bull_researcher && debateResults.bear_researcher && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                      {[
                        { title: "Bulls say", data: debateResults.bull_researcher, field: "key_arguments" },
                        { title: "Bears say", data: debateResults.bear_researcher, field: "key_arguments" },
                      ].map(({ title, data, field }) => {
                        const args = (data[field] as string[]) || [];
                        const quote = args.length > 0 ? args.slice(0, 2).join(". ") + "." : String(data.reasoning || "").slice(0, 200);
                        const model = String(data._model || "").split("/").pop() || "";
                        const prob = data.probability as number | undefined;
                        return (
                          <div key={title} className="border border-[#21262d] rounded-xl p-5">
                            <div className="text-[13px] font-bold text-[#ffffff] mb-2.5">{title}</div>
                            <div className="text-[13px] text-[#e0e0e0] leading-[1.7] mb-3">&ldquo;{quote}&rdquo;</div>
                            <div className="text-[11px] text-[#919fa6]">
                              {model}{prob != null ? ` \u00b7 P(YES): ${Math.round(prob * 100)}%` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Superforecaster key factors */}
                  {isSuperforecaster && debateResults.superforecaster?.key_factors && (
                    <div className="border border-[#21262d] rounded-xl p-5 mb-10">
                      <div className="text-[13px] font-bold text-[#ffffff] mb-2.5">Key Factors</div>
                      <ul className="space-y-1">
                        {(debateResults.superforecaster.key_factors as string[]).map((f, i) => (
                          <li key={i} className="text-[13px] text-[#919fa6] pl-3.5 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-[3px] before:h-[3px] before:rounded-full before:bg-[#919fa6]">
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Full Debate Accordion */}
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">{isSuperforecaster ? "Analysis" : "Full Debate"}</h2>
              <div className="h-px bg-[#30363a] mb-2" />
              {debateResults && (
                <div className="text-[13px] text-[#919fa6] mb-5">
                  {Object.keys(debateResults).length} agents &middot; {
                    Object.values(debateResults).reduce((s, a) => s + Number(a._elapsed || 0), 0).toFixed(1)
                  }s total
                </div>
              )}

              <AgentAccordion debateResults={debateResults} rawReasoning={trade.raw_reasoning || trade.bot_reasoning || ""} />

            </div>
          )}

          {/* ── TAB: Validation ── */}
          {activeTab === "validation" && (
            <div className="pt-7">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">Rules Pipeline</h2>
              <div className="h-px bg-[#30363a]" />
              <div className="text-[13px] text-[#919fa6] mt-2 mb-5">
                {trade.rules_result === "passed" ? "All 11 hard rules passed" : `Failed: ${trade.rules_result?.replace("failed:", "")}`}
              </div>

              <ValidationRules rulesResult={trade.rules_result || "passed"} />

              {/* AI Validator */}
              {(trade.ai_verdict || trade.ai_reasoning) && (
                <div className="mt-6 pt-5 border-t border-[#30363a]">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] text-[#919fa6] uppercase tracking-wider">AI Validator</span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                      trade.ai_verdict === "APPROVE" ? "bg-gain/10 text-gain"
                        : trade.ai_verdict === "REJECT" ? "bg-loss/10 text-loss"
                          : "bg-warning/10 text-warning"
                    }`}>
                      {trade.ai_verdict || "\u2014"}
                    </span>
                  </div>
                  {trade.ai_reasoning && (
                    <p className="text-[13px] text-[#919fa6] leading-[1.7]">{trade.ai_reasoning}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Market Section (only when data available) ── */}
          {(market.market || market.loading) && (
            <div className="mt-10">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">Market</h2>
              <div className="h-px bg-[#30363a]" />
              <MarketSection trade={trade} market={market.market} marketLoading={market.loading} />
            </div>
          )}

          {/* ── Counterfactual (skipped/rejected only) ── */}
          {isSkippedOrRejected && (
            <div className="mt-10">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-3">What Would Have Happened?</h2>
              <div className="h-px bg-[#30363a]" />
              <CounterfactualSection trade={trade} />
            </div>
          )}

        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div className="hidden lg:block">
          <div className="sticky top-[120px]">
            <div className="bg-white/[0.02] border border-border rounded-xl p-5">

              {/* Sidebar Header */}
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider bg-gain/10 text-gain border border-gain/20">
                  {trade.action.toUpperCase()} {trade.side.toUpperCase()}
                </span>
              </div>

              {/* Price & P&L */}
              <div className="space-y-3 mb-4">
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Entry Price</span>
                    <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums">${trade.price.toFixed(2)}</span>
                  </div>
                </div>

                {market.market && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Current Price</span>
                    <div className="text-right">
                      <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums">${market.market.yes_price.toFixed(2)}</span>
                      {priceDelta != null && priceDelta !== 0 && (
                        <span className={`text-[11px] ml-1.5 ${priceDelta > 0 ? "text-gain" : "text-loss"}`}>
                          {priceDelta > 0 ? "+" : ""}{priceDelta.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Exit Price</span>
                  <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums">
                    {trade.settled && trade.pnl != null && trade.count > 0 && trade.status !== "error" && trade.status !== "rejected" && trade.status !== "skipped" ? `$${((trade.total_cost + trade.pnl) / trade.count).toFixed(2)}` : "\u2014"}
                  </span>
                </div>
              </div>

              {/* P&L */}
              <div className="border-t border-border pt-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">P&L</span>
                  {trade.settled && trade.pnl != null && trade.status !== "error" && trade.status !== "rejected" && trade.status !== "skipped" ? (
                    <div className="text-right">
                      <span className={`text-[14px] font-semibold tabular-nums ${trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-[#ffffff]"}`}>
                        {formatMoneyFull(trade.pnl)}
                      </span>
                      {trade.total_cost > 0 && (
                        <span className={`text-[11px] ml-1.5 ${trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-[#919fa6]"}`}>
                          {trade.pnl > 0 ? "+" : ""}{((trade.pnl / trade.total_cost) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[14px] font-semibold text-[#919fa6]">{trade.status === "error" || trade.status === "rejected" ? "Unfilled" : "Pending"}</span>
                  )}
                </div>
              </div>

              {/* Position Details */}
              <div className="border-t border-border pt-4 space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Size</span>
                  <span className="text-[13px] text-[#ffffff]">${trade.total_cost.toFixed(2)} ({trade.count} contract{trade.count !== 1 ? "s" : ""})</span>
                </div>

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

              {/* Market Info (only when available) */}
              {market.market && (
                <div className="border-t border-border pt-4 space-y-3 mb-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Status</span>
                    <span className="text-[13px] text-[#ffffff] capitalize">{market.market.status || "\u2014"}</span>
                  </div>
                  {market.market.close_time && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Closes</span>
                      <span className="text-[13px] text-[#ffffff]">
                        {new Date(market.market.close_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Volume</span>
                    <span className="text-[13px] text-[#ffffff] tabular-nums">{market.market.volume.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Open Interest</span>
                    <span className="text-[13px] text-[#ffffff] tabular-nums">{market.market.open_interest.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t border-border pt-4 space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Placed</span>
                  <span className="text-[13px] text-[#919fa6]">{new Date(trade.timestamp).toLocaleString()}</span>
                </div>
                {trade.settled_at && trade.status !== "error" && trade.status !== "rejected" && trade.status !== "skipped" && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Settled</span>
                    <span className="text-[13px] text-[#919fa6]">{new Date(trade.settled_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* View Strategy Link */}
              {agent && (
                <Link
                  href={`/strategy/${trade.agent_id}`}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] hover:border-[#ffffff]/20 transition-colors"
                >
                  View Strategy
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ── Agent Accordion ── */
function AgentAccordion({ debateResults, rawReasoning }: { debateResults: Record<string, Record<string, unknown>> | null; rawReasoning: string }) {
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const orderedRoles = ["research", "superforecaster", "forecaster", "news_analyst", "bull_researcher", "bear_researcher", "risk_manager", "trader"];

  if (!debateResults) {
    const cleaned = cleanReasoning(rawReasoning || "No reasoning provided");
    if (!cleaned || cleaned === "No reasoning provided") return <p className="text-[13px] text-[#919fa6] italic">No reasoning available</p>;
    return <p className="text-[13px] text-[#e0e0e0] leading-[1.7] whitespace-pre-wrap">{formatReasoning(cleaned)}</p>;
  }

  const knownRoles = orderedRoles.filter((r) => debateResults[r]);
  const extraRoles = Object.keys(debateResults).filter((r) => !orderedRoles.includes(r));
  const roles = [...knownRoles, ...extraRoles];

  return (
    <div>
      {roles.map((role) => {
        const ag = debateResults[role];
        const meta = AGENT_ICONS[role] || { label: role };
        const isOpen = openAgent === role;
        const model = String(ag._model || "").split("/").pop() || "";
        const elapsed = ag._elapsed ? `${ag._elapsed}s` : "";
        const prob = ag.probability as number | undefined;
        const conf = ag.confidence as number | undefined;
        const action = ag.action as string | undefined;
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
              onClick={() => setOpenAgent(isOpen ? "__none__" : role)}
              className="w-full flex items-center justify-between py-4 group cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="text-left">
                <div className="text-[13px] font-bold text-[#ffffff] transition-colors">{meta.label}</div>
                <div className="text-[12px] text-[#919fa6] group-hover:text-[#b0bec5] transition-colors">{[model, elapsed].filter(Boolean).join(" \u00b7 ")}</div>
              </div>
              <div className="flex items-center gap-4">
                {isTrader && action && (
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    String(action).toLowerCase() === "buy" ? "bg-gain/10 text-gain" : "bg-warning/10 text-warning"
                  }`}>
                    {action} {side}
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
                {/* Inline metrics */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
                  {prob != null && <span className="text-[12px] text-[#919fa6]">P(YES) <span className="text-[#ffffff] font-medium">{(prob * 100).toFixed(1)}%</span></span>}
                  {conf != null && <span className="text-[12px] text-[#919fa6]">Confidence <span className="text-[#ffffff] font-medium">{Math.round(conf * 100)}%</span></span>}
                  {agRiskScore != null && <span className="text-[12px] text-[#919fa6]">Risk <span className="text-[#ffffff] font-medium">{agRiskScore.toFixed(1)}/10</span></span>}
                  {ag.base_rate != null && <span className="text-[12px] text-[#919fa6]">Base rate <span className="text-[#ffffff] font-medium">{Math.round(Number(ag.base_rate) * 100)}%</span></span>}
                  {ag.ev_estimate != null && <span className="text-[12px] text-[#919fa6]">EV <span className="text-[#ffffff] font-medium">${Number(ag.ev_estimate).toFixed(2)}</span></span>}
                  {ag.should_trade != null && <span className="text-[12px] text-[#919fa6]">Should trade <span className="text-[#ffffff] font-medium">{ag.should_trade ? "Yes" : "No"}</span></span>}
                </div>

                {/* Reasoning text */}
                {reasoning && (
                  <p className="text-[13px] text-[#e0e0e0] leading-[1.7] whitespace-pre-wrap">{formatReasoning(reasoning)}</p>
                )}

                {/* Key factors / arguments */}
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

/* ── Validation Rules Grid ── */
const ALL_RULES = ["Max trade size", "Capital limit", "Daily loss limit", "Min confidence", "Allowed categories", "Blocked tickers", "Max positions", "Duplicate check", "Opposing check", "Max daily trades", "Sell validation"];

function ValidationRules({ rulesResult }: { rulesResult: string }) {
  const failedRule = rulesResult.startsWith("failed:") ? rulesResult.replace("failed:", "").replace(/_/g, " ") : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 border border-[#21262d] rounded-xl overflow-hidden">
      {ALL_RULES.map((rule) => {
        const isFailed = failedRule && rule.toLowerCase().includes(failedRule.toLowerCase());
        return (
          <div
            key={rule}
            className="flex items-center gap-2 px-4 py-3 text-[13px] text-[#919fa6] border-b border-r border-[#21262d] last:border-b-0"
          >
            <span className={isFailed ? "text-loss" : "text-gain"}>
              {isFailed ? "\u2717" : "\u2713"}
            </span>
            {rule}
          </div>
        );
      })}
    </div>
  );
}

/* ── Market Section ── */
function MarketSection({ trade, market, marketLoading }: { trade: Trade; market: Market | null; marketLoading: boolean }) {
  const priceDelta = market && trade.price ? market.yes_price - trade.price : null;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-[#21262d]">
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Yes Price</div>
          <div className={`text-[20px] font-bold tabular-nums ${priceDelta && priceDelta > 0 ? "text-gain" : ""}`}>
            {market ? `$${market.yes_price.toFixed(2)}` : marketLoading ? "..." : "\u2014"}
          </div>
          {priceDelta != null && priceDelta !== 0 && (
            <div className={`text-[11px] ${priceDelta > 0 ? "text-gain" : "text-loss"}`}>
              {priceDelta > 0 ? "+" : ""}{priceDelta.toFixed(2)} since entry
            </div>
          )}
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">No Price</div>
          <div className="text-[20px] font-bold tabular-nums">{market ? `$${market.no_price.toFixed(2)}` : "\u2014"}</div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Volume</div>
          <div className="text-[20px] font-bold tabular-nums">{market ? market.volume.toLocaleString() : "\u2014"}</div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Open Interest</div>
          <div className="text-[20px] font-bold tabular-nums">{market ? market.open_interest.toLocaleString() : "\u2014"}</div>
        </div>
      </div>
      <div className="h-px bg-[#30363a]" />
      <div className="grid grid-cols-2 sm:grid-cols-4">
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Status</div>
          <div className="text-[13px] font-bold capitalize">{market?.status || "\u2014"}</div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Closes</div>
          <div className="text-[13px] font-bold">
            {market?.close_time
              ? new Date(market.close_time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "\u2014"}
          </div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Exchange</div>
          <div className="text-[13px] font-bold capitalize">{trade.exchange || "kalshi"}</div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Category</div>
          <div className="text-[13px] font-bold">{trade.category || "\u2014"}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Counterfactual Section ── */
function CounterfactualSection({ trade }: { trade: Trade }) {
  if (!trade.cf_settled && !trade.cf_pnl) {
    return (
      <p className="text-[13px] text-[#919fa6] mt-4 italic">Market still open — outcome will be tracked automatically.</p>
    );
  }

  const cfPnl = trade.cf_pnl ?? 0;
  const savedMoney = cfPnl < 0;
  const missedOpportunity = cfPnl > 0;
  const amountText = trade.cf_pnl != null ? `$${Math.abs(trade.cf_pnl).toFixed(2)}` : "\u2014";

  return (
    <div>
      <div className="text-[13px] text-[#919fa6] mt-2 mb-4">This trade was {trade.status} — here&apos;s the counterfactual outcome</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-[#21262d]">
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Market Result</div>
          <div className={`text-[20px] font-bold ${trade.cf_market_result === "yes" ? "text-gain" : "text-loss"}`}>
            {(trade.cf_market_result || "\u2014").toUpperCase()}
          </div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Would&apos;ve</div>
          <div className={`text-[20px] font-bold ${missedOpportunity ? "text-gain" : savedMoney ? "text-loss" : "text-[#919fa6]"}`}>
            {missedOpportunity ? "Won" : savedMoney ? "Lost" : "Breakeven"}
          </div>
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Hypothetical P&L</div>
          <div className={`text-[20px] font-bold tabular-nums ${missedOpportunity ? "text-gain" : savedMoney ? "text-loss" : "text-[#919fa6]"}`}>
            {trade.cf_pnl != null ? formatMoneyFull(trade.cf_pnl) : "\u2014"}
          </div>
          {trade.cf_count && <div className="text-[11px] text-[#919fa6] mt-0.5">{trade.cf_count} contract{trade.cf_count !== 1 ? "s" : ""}</div>}
        </div>
        <div className="py-4">
          <div className="text-[11px] text-[#919fa6] uppercase tracking-wider font-medium mb-1">Resolved</div>
          <div className="text-[13px] font-bold">{trade.cf_settled_at ? relativeTime(trade.cf_settled_at) : "\u2014"}</div>
        </div>
      </div>

      <div className={`mt-4 flex items-center gap-3 px-5 py-3.5 rounded-xl border ${
        savedMoney ? "border-gain/15" : missedOpportunity ? "border-loss/15" : "border-[#21262d]"
      }`}>
        <span className={`text-[16px] ${savedMoney ? "text-gain" : missedOpportunity ? "text-loss" : "text-[#919fa6]"}`}>
          {savedMoney ? "\u2713" : missedOpportunity ? "\u2717" : "\u2014"}
        </span>
        <div>
          <div className={`text-[13px] font-semibold ${savedMoney ? "text-gain" : missedOpportunity ? "text-loss" : "text-[#919fa6]"}`}>
            {savedMoney
              ? `Correct decision \u2014 skipping saved ${amountText}`
              : missedOpportunity
                ? `Missed opportunity \u2014 would have made ${amountText}`
                : "Breakeven \u2014 no impact either way"}
          </div>
          <div className="text-[11px] text-[#919fa6] mt-0.5">
            {savedMoney
              ? "Agent correctly identified insufficient edge."
              : missedOpportunity
                ? "The market moved in the predicted direction."
                : "The trade would have resulted in no gain or loss."}
          </div>
        </div>
      </div>
    </div>
  );
}
