"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { parseDebateResults, DebateResultsView } from "@/components/trades/DebateResults";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAgent, useAgentMetrics, useAgents } from "@/hooks/use-agents";
import { useTrades, useTradeStats } from "@/hooks/use-trades";
import { useAgentLogs } from "@/hooks/use-websocket";
import { usePortfolioStats, useSnapshots } from "@/hooks/use-portfolio";
import { useAuth } from "@/context/auth";
import { useToast } from "@/components/toast";
import { agents as agentsApi, trades as tradesApi, BotType } from "@/lib/api";
import { useWalkthrough } from "@/context/walkthrough";
import { DEMO_BOT_TYPES } from "@/lib/demo-data";
import { formatMoneyFull, formatPercent, pnlColor, LogLevel } from "@/lib/utils";
import { PnlChart } from "@/components/charts";
import { TimeRangeSelector, SideBadge, ConfidenceBar, PnlDisplay, TradeStatusPill, StatusBadge } from "@/components/ui";
import { BotAvatar } from "@/components/BotAvatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageSkeleton } from "@/components/loading-skeleton";
import { ChevronDown, ChevronUp, ChevronLeft, Play, Square, Radiation, Shield } from "lucide-react";
import type { EnvironmentFilter } from "@/context/environment-filter";

/* ── Strategy type (fetched from API) ── */
interface StrategyDef {
  botTypeId: string;
  name: string;
  fullName: string;
  description: string;
  market: string;
  llms: string[];
}

const DEFAULT_LLMS = ["Grok 4.1 Fast", "Claude Sonnet 4.6", "o4-mini", "Gemini 3 Flash", "DeepSeek V3.2"];

function botTypeToStrategy(bt: BotType): StrategyDef {
  return {
    botTypeId: bt.id,
    name: bt.name,
    fullName: bt.full_name || bt.name,
    description: bt.description || "",
    market: bt.exchange === "kalshi" ? "Kalshi" : "Polymarket",
    llms: DEFAULT_LLMS,
  };
}

/* ── Helpers (from agents/[id]) ── */
const logLevelStyle: Record<string, string> = {
  info: "text-text-secondary", trade: "text-gain font-medium", warn: "text-warning", error: "text-loss font-medium",
};
const logLevelBadge: Record<string, string> = {
  info: "bg-surface-hover text-text-secondary", trade: "bg-gain-light text-gain", warn: "bg-warning-light text-warning", error: "bg-loss-light text-loss",
};

function getLogRowHighlight(level: string, message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("checking rules") || msg.includes("rules passed")) return "bg-yellow-500/10 border-l-2 border-yellow-500 pl-2";
  if (msg.includes("rejected by rules") || msg.includes("rejected by account")) return "bg-red-500/10 border-l-2 border-red-500 pl-2";
  if (msg.startsWith("executed:") || msg.startsWith("paper trade:") || level === "trade") return "bg-emerald-500/10 border-l-2 border-emerald-500 pl-2";
  if (level === "error") return "bg-red-500/10 border-l-2 border-red-500 pl-2";
  return "";
}

function extractReasoningSummary(reasoning: string): { summary: string; hasMore: boolean } {
  if (!reasoning || reasoning === "No reasoning available") return { summary: "No reasoning available", hasMore: false };
  const confMatch = reasoning.match(/confidence[:\s=]+(\d+\.?\d*%?)/i);
  const confStr = confMatch ? ` (${confMatch[1].includes("%") ? confMatch[1] : Math.round(parseFloat(confMatch[1]) * 100) + "%"} confidence)` : "";
  const lines = reasoning.split(/[\n\r]+/).filter((l) => l.trim().length > 10);
  const conclusionLine = lines.find((l) => /bullish|bearish|buy|sell|signal|recommend|position|edge|strong|weak/i.test(l)) || lines[0] || reasoning.substring(0, 120);
  const summary = conclusionLine.replace(/^\[.*?\]\s*/, "").trim().substring(0, 120);
  return { summary: summary + confStr, hasMore: reasoning.length > 150 };
}

function NumberInputRow({ label, value, min, max, unit = "", onChange, disabled }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void; disabled?: boolean }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-border last:border-b-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <span className="text-[13px] font-medium text-[#919fa6]">{label}</span>
      <div className="relative">
        {unit === "$" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">$</span>}
        <input type="number" min={min} max={max} value={local} disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            const v = Number(local);
            if (isNaN(v) || local === "") { setLocal(String(value)); }
            else { const c = Math.max(min, Math.min(max, v)); onChange(c); setLocal(String(c)); }
          }}
          className={`w-full sm:w-[80px] py-1.5 rounded-lg bg-white/[0.04] border border-border text-[13px] text-[#ffffff] tabular-nums text-right focus:outline-none focus:border-border hover:border-border transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:cursor-not-allowed ${unit === "$" ? "pl-5 pr-2.5" : (unit === "%" || unit === "c") ? "pl-2.5 pr-6" : "px-2.5"}`}
        />
        {unit === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">%</span>}
        {unit === "c" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">&cent;</span>}
      </div>
    </div>
  );
}

/* ── Section heading (Robinhood style) ── */
function SectionHeading({ title }: { title: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[22px] font-bold text-[#ffffff] mb-3">{title}</h2>
      <div className="border-b border-border" />
    </div>
  );
}


/* ── Format reasoning into structured sections ── */
function formatReasoning(raw: string): React.ReactNode {
  if (!raw) return null;

  // Try to split by common section patterns: [ROLE], **heading**, ### heading, numbered steps
  const sections: { heading: string; body: string }[] = [];
  // Split on lines that look like headings
  const lines = raw.split(/\n/);
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { currentBody.push(""); continue; }

    // Detect heading patterns
    const bracketMatch = trimmed.match(/^\[([A-Z][A-Za-z\s/().]+)\]:?\s*(.*)/);
    const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
    const hashMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const numberedSection = trimmed.match(/^(\d+)\.\s+\*\*([^*]+)\*\*:?\s*(.*)/);
    const roleMatch = trimmed.match(/^(Forecaster|News Analyst|Bull|Bear|Risk Manager|Trader|Final Decision|Pre-Analysis|Summary)[:\s]+(.*)/i);

    if (bracketMatch || boldMatch || hashMatch || numberedSection || roleMatch) {
      // Save previous section
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
      }
      if (numberedSection) {
        currentHeading = numberedSection[2];
        currentBody = numberedSection[3] ? [numberedSection[3]] : [];
      } else if (bracketMatch) {
        currentHeading = bracketMatch[1];
        currentBody = bracketMatch[2] ? [bracketMatch[2]] : [];
      } else if (boldMatch) {
        currentHeading = boldMatch[1];
        currentBody = boldMatch[2] ? [boldMatch[2]] : [];
      } else if (hashMatch) {
        currentHeading = hashMatch[1];
        currentBody = [];
      } else if (roleMatch) {
        currentHeading = roleMatch[1];
        currentBody = roleMatch[2] ? [roleMatch[2]] : [];
      }
    } else {
      currentBody.push(trimmed);
    }
  }
  // Push last section
  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }

  // If no sections detected, show as single block
  if (sections.length <= 1 && !sections[0]?.heading) {
    return (
      <div className="text-[13px] text-[#919fa6] leading-relaxed whitespace-pre-wrap">{raw}</div>
    );
  }

  return sections.filter(s => s.heading || s.body).map((section, i) => (
    <div key={i} className={`${i > 0 ? "pt-3 border-t border-border" : ""}`}>
      {section.heading && (
        <div className="text-[12px] font-semibold text-[#919fa6] mb-1">{section.heading}</div>
      )}
      {section.body && (
        <div className="text-[13px] text-[#919fa6] leading-relaxed whitespace-pre-wrap">
          {section.body.split(/\n/).map((line, j) => {
            const kv = line.match(/^[-•]\s*\*?\*?([^:*]+)\*?\*?:\s*(.*)/);
            if (kv) {
              return (
                <div key={j} className="flex gap-2 py-0.5">
                  <span className="text-[#919fa6] shrink-0">&bull;</span>
                  <span><span className="text-[#919fa6] font-medium">{kv[1].trim()}</span>: {kv[2]}</span>
                </div>
              );
            }
            const bullet = line.match(/^[-•]\s+(.*)/);
            if (bullet) {
              return (
                <div key={j} className="flex gap-2 py-0.5">
                  <span className="text-[#919fa6] shrink-0">&bull;</span>
                  <span>{bullet[1]}</span>
                </div>
              );
            }
            if (!line.trim()) return <div key={j} className="h-1.5" />;
            return <div key={j}>{line}</div>;
          })}
        </div>
      )}
    </div>
  ));
}

// allCategories removed — category filter no longer used

/* ══════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                      */
/* ══════════════════════════════════════════════════════════════════════ */
export default function StrategyDetailPage() {
  const { id } = useParams();
  const rawId = typeof id === "string" ? id : "";
  // id can be a user_agent UUID (deployed) or bot_type_id (not yet deployed)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const { profile } = useAuth();
  const toast = useToast();
  const { demoMode } = useWalkthrough();

  /* ── Environment filter ── */
  const [envFilter, setEnvFilter] = useState<EnvironmentFilter>("all");

  /* ── Time range → API period mapping ── */
  const [timeRange, setTimeRange] = useState("1M");
  const snapshotPeriod = useMemo(() => {
    const map: Record<string, string> = { "1D": "1D", "1W": "1W", "1M": "1M", "3M": "3M", "1Y": "ALL", ALL: "ALL" };
    return map[timeRange] || "1M";
  }, [timeRange]);

  /* ── Data hooks ── */
  const envParam = envFilter !== "all" ? envFilter : undefined;

  // useAgents with env filter — the LIST endpoint recomputes P&L per environment
  // This gives us environment-scoped total_pnl, trade_count, win_count
  const { agents: envAgents } = useAgents(envParam);

  // Resolve agentId: if rawId is a bot_type_id, find the deployed agent's UUID
  const agentId = useMemo(() => {
    if (isUUID) return rawId;
    // rawId is a bot_type_id — find the deployed agent with this bot_type
    const match = envAgents.find((a) => (a as unknown as { bot_type_id?: string }).bot_type_id === rawId);
    return match?.id || "";
  }, [isUUID, rawId, envAgents]);

  // useAgent = base agent record (status, name, config — NOT env-scoped P&L)
  const { agent, loading: agentLoading, refresh } = useAgent(agentId);

  const envAgent = useMemo(() => envAgents.find((a) => a.id === agentId), [envAgents, agentId]);

  const { trades: apiTrades, hasMore, loadMore, loadingMore, silentRefresh } = useTrades({
    agent_id: agentId || undefined,
    environment: envParam,
  });
  const { metrics } = useAgentMetrics(agentId ? [agentId] : []);
  const { logs: wsLogs } = useAgentLogs(agentId);

  // Manual retry of failed (status='error') Polymarket orders.
  const [retryFor, setRetryFor] = useState<
    { tradeId: string; preview: { side?: string; count?: number; original_price?: number | null; current_side_price?: number } } | null
  >(null);
  const [retrying, setRetrying] = useState(false);
  const handleRetryClick = useCallback(async (tradeId: string) => {
    try {
      const preview = await tradesApi.retry(tradeId, false);
      setRetryFor({ tradeId, preview });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not fetch current price");
    }
  }, [toast]);
  const handleRetryConfirm = useCallback(async () => {
    if (!retryFor) return;
    setRetrying(true);
    try {
      const res = await tradesApi.retry(retryFor.tradeId, true);
      toast.success(`Order re-submitted (${res.side} ×${res.count}) at ${res.price_used}`);
      setRetryFor(null);
      await silentRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }, [retryFor, toast, silentRefresh]);
  const { stats: portfolioStats } = usePortfolioStats(envParam);
  const { stats: agentDayStats } = useTradeStats({
    agent_id: agentId || undefined,
    environment: envParam,
    time_range: "1D",
  });
  const { snapshots } = useSnapshots(snapshotPeriod, envParam);

  /* ── Fetch bot types from API ── */
  const [botTypes, setBotTypes] = useState<StrategyDef[]>([]);
  useEffect(() => {
    if (demoMode) {
      setBotTypes(DEMO_BOT_TYPES.map(botTypeToStrategy));
      return;
    }
    agentsApi.types().then((types) => setBotTypes(types.map(botTypeToStrategy))).catch(() => {});
  }, [demoMode]);

  /* ── Resolve strategy metadata ── */
  const strategy = useMemo(() => {
    const botTypeId = (agent as unknown as Record<string, unknown> | undefined)?.bot_type_id as string | undefined;
    return botTypes.find((s) => s.botTypeId === botTypeId) || botTypes.find((s) => s.botTypeId === rawId) || null;
  }, [agent, rawId, botTypes]);

  const hasRealData = !!agent;

  /* ── Metrics ── */
  const agentMetrics = metrics[agentId];
  const realAvgConfidence = agentMetrics ? Math.round(agentMetrics.avg_confidence * 100) : 0;
  const tradesToday = agentMetrics?.trades_today ?? 0;

  /* ── P&L: use environment-scoped values from list endpoint ── */
  // envAgent comes from GET /api/agents?environment=X which recomputes
  // total_pnl, trade_count, win_count from trades table scoped to that environment.
  // Falls back to base agent record when filter is "all".
  const effectiveAgent = envAgent || agent;
  const totalPnl = effectiveAgent?.total_pnl ?? 0;
  const tradeCount = effectiveAgent?.trade_count ?? 0;
  const winCount = effectiveAgent?.win_count ?? 0;
  const settledCount = effectiveAgent?.settled_count ?? 0;
  const capitalAllocated = agent?.capital_allocated ?? 0;
  const capitalUsed = agent?.capital_used ?? 0;

  // Per-agent daily P&L from server-side stats (covers all trades, not just first page)
  const todayPnl = agentDayStats?.net_pnl ?? 0;

  // Chart: extract per-agent P&L from portfolio snapshots, downsampled by time range
  const pnlHistory = useMemo(() => {
    if (snapshots.length === 0) return [];

    // Extract raw values
    const raw = snapshots.map((s) => {
      let agentValue = 0;
      if (s.agent_values) {
        try {
          const vals = typeof s.agent_values === "string" ? JSON.parse(s.agent_values) : s.agent_values;
          agentValue = vals[agentId] ?? 0;
        } catch { /* ignore parse errors */ }
      }
      return { ts: new Date(s.timestamp), value: agentValue };
    });

    // Downsample: group by bucket and take last value per bucket
    const bucketKey = (d: Date): string => {
      if (timeRange === "1D" || timeRange === "LIVE") {
        // Keep every 15 min
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${Math.floor(d.getMinutes() / 15) * 15}`;
      } else if (timeRange === "1W") {
        // Hourly
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}h`;
      } else {
        // 1M, 3M, 1Y, ALL — daily
        return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
      }
    };

    const dateFormat = (d: Date): string => {
      if (timeRange === "1D" || timeRange === "LIVE") {
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      } else if (timeRange === "1W") {
        return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric" });
      } else if (timeRange === "1M") {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    };

    // Group by bucket, keep last value per bucket
    const buckets = new Map<string, { ts: Date; value: number }>();
    for (const pt of raw) {
      const key = bucketKey(pt.ts);
      buckets.set(key, pt); // last write wins
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.ts.getTime() - b.ts.getTime())
      .map((pt) => ({ date: dateFormat(pt.ts), value: pt.value }));
  }, [snapshots, agentId, timeRange]);

  /* ── Bot object — uses environment-scoped server data ── */
  const bot = hasRealData
    ? {
        id: agent.id,
        name: agent.name,
        status: agent.status === "running" ? ("active" as const) : ("paused" as const),
        strategy: agent.strategy || "AI Strategy",
        totalPnl,
        pnlPercent: capitalAllocated > 0 ? (totalPnl / capitalAllocated) * 100 : 0,
        todayPnl,
        tradeCount,
        winCount,
        winRate: settledCount > 0 ? Math.round((winCount / settledCount) * 100) : 0,
        avgConfidence: realAvgConfidence,
        tradesToday,
        capitalUsed,
        capitalAllocated,
        pnlHistory: pnlHistory.length > 0 ? pnlHistory : [{ date: "Now", value: totalPnl }],
        description: agent.description,
        llms: agent.llms,
      }
    : null;

  /* ── Trades ── */
  const botTrades = useMemo(() => {
    return apiTrades.slice(0, 30).map((t) => ({
      id: t.id, timestamp: t.timestamp, marketTitle: t.market_title || t.market_ticker,
      side: t.side.toUpperCase(), size: t.total_cost, confidence: (t.confidence || 0.5) * 100,
      pnl: t.pnl,
      status: t.settled ? "settled" : (t.status === "executed" || t.status === "paper" ? "open" : t.status),
      reasoning: t.bot_reasoning || "No reasoning available",
      category: t.category || "Other", botId: t.agent_id,
      model: t.model,
      exchange: t.exchange,
    }));
  }, [apiTrades, agentId]);

  /* ── Positions ── */
  const botPositions = (portfolioStats?.open_positions ?? [])
        .filter((p) => p.agent_id === agentId)
        .map((p) => ({
          id: p.id, botId: p.agent_id, marketTitle: p.market_title || p.market_ticker,
          side: p.side.toUpperCase() as "YES" | "NO", size: p.total_cost,
          entryPrice: p.count > 0 ? p.total_cost / p.count : p.price, currentPrice: p.price, pnl: p.pnl,
        }));

  /* ── Logs (real WebSocket only) ── */
  const logs = wsLogs.map((l, i) => ({ id: `ws-${i}`, timestamp: l.timestamp, level: l.level as LogLevel, message: l.message }));

  /* ── UI state ── */
  const [activeTab, setActiveTab] = useState<"about" | "settings" | "performance">("about");

  const [leftView, setLeftView] = useState<"chart" | "terminal">("chart");
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [confirmLiveFor, setConfirmLiveFor] = useState<string | null>(null);
  const [liveNotEnabledModal, setLiveNotEnabledModal] = useState(false);

  /* ── Deploy panel state ── */
  const [deployDuration, setDeployDuration] = useState(30);
  const [deployFrequency, setDeployFrequency] = useState(300);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  /* ── Settings state ── */
  const [botMode, setBotMode] = useState<"training" | "live">("training");
  const [maxTradeSize, setMaxTradeSize] = useState(25);
  const [maxPositions, setMaxPositions] = useState(5);
  const [dailyLoss, setDailyLoss] = useState(100);
  const [minConf, setMinConf] = useState(70);
  const [maxTradesDay, setMaxTradesDay] = useState(10);
  const [kellyMultiplier, setKellyMultiplier] = useState(0.25);
  const [minPositionSize, setMinPositionSize] = useState(1.0);
  const [maxPositionPct, setMaxPositionPct] = useState(30);
  const [minVolume, setMinVolume] = useState(0);
  const [maxExpiryDays, setMaxExpiryDays] = useState(7);
  const [reanalyzeCooldown, setReanalyzeCooldown] = useState(6);
  const [reasoningModel, setReasoningModel] = useState("anthropic/claude-opus-4.6");
  // Tail-buyer specific settings
  const [minContractPrice, setMinContractPrice] = useState(0.5);
  const [maxContractPrice, setMaxContractPrice] = useState(3);
  const [minExpiryDays, setMinExpiryDays] = useState(7);
  const [maxMarketsPerCycle, setMaxMarketsPerCycle] = useState(25);
  const [tradeSize, setTradeSize] = useState(2);
  const [minOrderBookDepthPct, setMinOrderBookDepthPct] = useState(2);
  const [allowedCategories, setAllowedCategories] = useState<string[]>(["Sports", "Esports"]);
  const isSuperforecaster = agent?.bot_type_id?.includes("superforecaster") ?? false;
  const isTailBuyer = agent?.bot_type_id?.includes("tail-buyer") ?? false;

  /* ── Key status ── */
  const [keyStatus, setKeyStatus] = useState<{ required_keys: { env_key: string; provider: string; configured: boolean }[]; kalshi_configured: boolean; polymarket_configured?: boolean; exchange?: string; ready_to_deploy: boolean } | null>(null);
  useEffect(() => {
    if (!agentId) return;
    agentsApi.keyStatus(agentId).then(setKeyStatus).catch(() => {});
  }, [agentId]);

  /* ── Load config from agent ── */
  const configLoadedRef = useRef(false);
  useEffect(() => {
    if (!agent || configLoadedRef.current) return;
    configLoadedRef.current = true;
    const mode = agent.mode === "live" ? "live" : "training";
    setBotMode(mode as "training" | "live");
    const cfg = (agent.config_json || {}) as Record<string, unknown>;
    if (cfg.maxTradeSize !== undefined) setMaxTradeSize(cfg.maxTradeSize as number);
    if (cfg.maxPositions !== undefined) setMaxPositions(cfg.maxPositions as number);
    if (cfg.dailyLoss !== undefined) setDailyLoss(cfg.dailyLoss as number);
    if (cfg.minConf !== undefined) setMinConf(cfg.minConf as number);
    if (cfg.maxTradesDay !== undefined) setMaxTradesDay(cfg.maxTradesDay as number);
    // allowedCategories removed
    if (cfg.kellyMultiplier !== undefined) setKellyMultiplier(cfg.kellyMultiplier as number);
    if (cfg.minPositionSize !== undefined) setMinPositionSize(cfg.minPositionSize as number);
    if (cfg.maxPositionPct !== undefined) setMaxPositionPct(cfg.maxPositionPct as number);
    if (cfg.minVolume !== undefined) setMinVolume(cfg.minVolume as number);
    if (cfg.maxExpiryDays !== undefined) setMaxExpiryDays(cfg.maxExpiryDays as number);
    if (cfg.reanalyzeCooldownHrs !== undefined) setReanalyzeCooldown(cfg.reanalyzeCooldownHrs as number);
    if (cfg.minContractPrice !== undefined) setMinContractPrice(cfg.minContractPrice as number);
    if (cfg.maxContractPrice !== undefined) setMaxContractPrice(cfg.maxContractPrice as number);
    if (cfg.minExpiryDays !== undefined) setMinExpiryDays(cfg.minExpiryDays as number);
    if (cfg.maxMarketsPerCycle !== undefined) setMaxMarketsPerCycle(cfg.maxMarketsPerCycle as number);
    if (cfg.tradeSize !== undefined) setTradeSize(cfg.tradeSize as number);
    if (cfg.minOrderBookDepthPct !== undefined) setMinOrderBookDepthPct(cfg.minOrderBookDepthPct as number);
    if (cfg.allowedCategories !== undefined) setAllowedCategories(cfg.allowedCategories as string[]);
    if (cfg.model) {
      const validModels = ["anthropic/claude-opus-4.6", "anthropic/claude-sonnet-4.6", "deepseek/deepseek-r1", "x-ai/grok-4.20"];
      const stored = cfg.model as string;
      setReasoningModel(validModels.includes(stored) ? stored : "anthropic/claude-opus-4.6");
    }
    // Tail-buyer defaults: override shared defaults when no config saved yet
    if (agent.bot_type_id?.includes("tail-buyer")) {
      setDeployFrequency(1800);
      if (cfg.minVolume === undefined) setMinVolume(50000);
      if (cfg.maxPositions === undefined) setMaxPositions(100);
      if (cfg.maxTradesDay === undefined) setMaxTradesDay(100);
      if (cfg.maxExpiryDays === undefined) setMaxExpiryDays(30);
    }
  }, [agent]);

  /* ── Save config ── */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveConfig = useCallback(() => {
    if (!agentId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const config: Record<string, unknown> = {
        maxTradeSize, maxPositions, dailyLoss, minConf, maxTradesDay,
        kellyMultiplier, minPositionSize, maxPositionPct,
        minVolume,
        maxExpiryDays,
        reanalyzeCooldownHrs: reanalyzeCooldown,
        ...(isSuperforecaster ? { model: reasoningModel } : {}),
        ...(isTailBuyer ? { minContractPrice, maxContractPrice, minExpiryDays, maxMarketsPerCycle, tradeSize, minOrderBookDepthPct, allowedCategories } : {}),
      };
      agentsApi.updateConfig(agentId, config).catch(() => {});
      toast.success("Rules saved");
    }, 300);
  }, [agentId, maxTradeSize, maxPositions, dailyLoss, minConf, maxTradesDay, kellyMultiplier, minPositionSize, maxPositionPct, minVolume, maxExpiryDays, reanalyzeCooldown, isTailBuyer, minContractPrice, maxContractPrice, minExpiryDays, maxMarketsPerCycle, tradeSize, minOrderBookDepthPct, allowedCategories, toast]);

  /* ── Deploy cost calculation ── */
  const freqMin = deployFrequency / 60;
  const cyclesPerHour = 60 / freqMin;
  const MODEL_COSTS = useMemo(() => [
    { role: "Forecaster", model: "Grok 4.1 Fast", inRate: 0.20, outRate: 0.50 },
    { role: "News Analyst", model: "Claude Sonnet 4.6", inRate: 3.00, outRate: 15.00 },
    { role: "Bull Researcher", model: "o4-mini", inRate: 1.10, outRate: 4.40 },
    { role: "Bear Researcher", model: "Gemini 3 Flash", inRate: 0.50, outRate: 3.00 },
    { role: "Risk Manager", model: "DeepSeek V3.2", inRate: 0.26, outRate: 0.38 },
    { role: "Trader", model: "Grok 4.1 Fast", inRate: 0.20, outRate: 0.50 },
    { role: "News Search", model: "Perplexity Sonar", inRate: 3.00, outRate: 15.00 },
  ].map((m) => ({ ...m, costPerCall: (2000 * (m.inRate / 1_000_000) + 1500 * (m.outRate / 1_000_000)) * 1.055 })), []);

  const rawCostPerMarket = MODEL_COSTS.reduce((sum, m) => sum + m.costPerCall, 0);
  const COST_PER_MARKET = rawCostPerMarket * 1.2;
  const marketsPerCycle = 10;
  const durationMin = deployDuration || 60;
  const totalCycles = durationMin / freqMin;
  const freshCycles = Math.min(totalCycles, 5);
  const cachedCycles = Math.max(0, totalCycles - freshCycles);
  const totalMarkets = freshCycles * marketsPerCycle + cachedCycles * 3;
  const costPerCycle = COST_PER_MARKET * marketsPerCycle;
  const costPerHour = costPerCycle * cyclesPerHour;
  const tokensPerHour = Math.round(cyclesPerHour * marketsPerCycle * MODEL_COSTS.length * 3500);
  const durationLabel = deployDuration === 0 ? "\u221e" : deployDuration >= 60 ? `${deployDuration / 60}h` : `${deployDuration}m`;
  const totalCostEst = deployDuration === 0 ? null : totalMarkets * COST_PER_MARKET;

  const isRunning = bot?.status === "active";
  const isUnavailable = strategy ? (("hardcoded" in strategy && (strategy as Record<string, unknown>).hardcoded === true) || ("comingSoon" in strategy && (strategy as Record<string, unknown>).comingSoon === true)) : false;
  const [actionLoading, setActionLoading] = useState(false);

  /* ── Handlers ── */
  const handleDeploy = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const mode = botMode === "live" ? "live" : "training";
      await agentsApi.deploy({
        agent_id: agentId,
        mode,
        capital_allocated: parseInt((document.getElementById("capital-limit-input") as HTMLInputElement)?.value || "2000") || 2000,
        config: {
          duration_minutes: deployDuration,
          cycle_interval_seconds: deployFrequency,
          ...(isSuperforecaster ? { model: reasoningModel } : {}),
        },
      });
      toast.success(`${strategy?.name || "Agent"} deployed!`);
      setLeftView("terminal");
      await refresh();
    } catch (err) {
      console.error("Deploy failed:", err);
      const msg = err instanceof Error ? err.message : "Deploy failed";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setShowStopConfirm(false);
    try {
      await agentsApi.pause(agentId);
      toast.success("Agent stopped");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop agent";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleKill = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setShowKillConfirm(false);
    try {
      await agentsApi.kill(agentId);
      toast.success("Kill switch activated");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to kill agent";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmLive = async () => {
    setBotMode("live");
    agentsApi.updateConfig(agentId, {}, undefined, "live").catch(() => {});
    setConfirmLiveFor(null);
  };

  /* ── Loading / Not found ── */
  if (agentLoading) return <PageSkeleton />;
  if (!bot && !strategy) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#ffffff]">Strategy not found</h2>
          <Link href="/strategy" className="text-[14px] text-gain hover:underline mt-2 block">Back to strategies</Link>
        </div>
      </div>
    );
  }

  const strategyName = strategy?.fullName || bot?.name || "Strategy";
  const modeLabel = botMode === "live" ? "Live" : "Training";

  return (
    <div className="relative animate-fade-in">
      {/* ── Breadcrumb ── */}
      <Link href="/strategy" className="inline-flex items-center gap-1.5 text-[13px] text-[#919fa6] hover:text-[#ffffff] transition-colors mb-6">
        <ChevronLeft className="w-4 h-4" /> Strategies
      </Link>

      {/* ── Hero ── */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[22px] md:text-[28px] font-bold text-[#ffffff] tracking-tight">{strategyName}</h1>
        {/* Environment filter — top-level, scopes ALL data on the page */}
        <div className="flex flex-wrap gap-1 bg-white/[0.03] rounded-lg p-0.5">
            {([["all", "All"], ["training", "Training"], ["actual", "Live"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => setEnvFilter(val as EnvironmentFilter)}
                className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                  envFilter === val ? "bg-white/10 text-[#ffffff]" : "text-[#919fa6] hover:text-[#919fa6]"
                }`}
              >{label}</button>
            ))}
          </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <BotAvatar agentId={agentId} botTypeId={strategy?.botTypeId} size={36} />
        <span className="text-[15px] text-[#919fa6] font-medium">{bot?.name || strategy?.name}</span>
        {bot && <StatusBadge status={bot.status} />}
        {strategy && (
          <span className="text-[12px] text-[#919fa6] bg-white/[0.04] px-2.5 py-1 rounded-full">{strategy.market}</span>
        )}
      </div>

      {bot && (
        <div className="mb-6">
          <div className="flex items-baseline gap-3">
            <span className={`text-[28px] md:text-[36px] font-bold tracking-tight tabular-nums ${pnlColor(bot.totalPnl)}`}>
              {formatMoneyFull(bot.totalPnl)}
            </span>
            <span className={`text-[16px] font-semibold tabular-nums ${pnlColor(bot.pnlPercent)}`}>
              {formatPercent(bot.pnlPercent)}
            </span>
          </div>
          <span className={`text-[14px] font-medium tabular-nums ${pnlColor(bot.todayPnl)}`}>
            {formatMoneyFull(bot.todayPnl)} today
          </span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TWO-COLUMN LAYOUT                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 md:gap-8 mb-12">
        {/* ── LEFT: Chart / Terminal ── */}
        <div>
          {/* View toggle + time range */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
              {(["chart", "terminal"] as const).map((v) => (
                <button key={v} onClick={() => setLeftView(v)}
                  className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-all ${leftView === v ? "bg-white text-black" : "text-[#919fa6] hover:text-[#919fa6]"}`}
                >
                  {v === "chart" ? "P&L Chart" : "Live Terminal"}
                </button>
              ))}
            </div>
            {leftView === "chart" && <TimeRangeSelector active={timeRange} onChange={setTimeRange} />}
          </div>

          {/* Chart */}
          {leftView === "chart" && (
            <div className="bg-white/[0.02] border border-border rounded-xl overflow-hidden">
              <div className="px-2">
                <PnlChart data={bot?.pnlHistory || [{ date: "Now", value: 0 }]} height={320} />
              </div>
            </div>
          )}

          {/* Terminal */}
          {leftView === "terminal" && (
            <div className="bg-white/[0.02] border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#919fa6]">Live Reasoning Stream</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gain animate-pulse" />
                  <span className="text-[11px] text-[#919fa6]">Live</span>
                </div>
              </div>
              <div className="max-h-[320px] min-h-[200px] overflow-y-auto p-3 space-y-1.5">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center h-[180px]">
                    <p className="text-[13px] text-[#919fa6] italic">Deploy the agent to see live logs here</p>
                  </div>
                ) : logs.filter((log) => {
                  const text = String(log.message || "").trim();
                  if (!text || text.length < 3) return false;
                  // Always show errors and failures
                  if (log.level === "error") return true;
                  if (/Failed|Error|❌|error|failed|timed? ?out|429|500|502|503/i.test(text)) return true;
                  // Hide technical noise
                  if (text.startsWith("HTTP Request:")) return false;
                  if (text.startsWith("http") && /HTTP\/\d/.test(text)) return false;
                  if (/^x\d+$/.test(text)) return false;
                  if (/CLOB client|PolymarketClient|Reused cached|get_balance:|Returning balance=/.test(text)) return false;
                  if (/Fetched .+ from backend \(\d+ chars\)/.test(text)) return false;
                  if (/Subprocess mode|Intercept result:|Order intercepted:|ORDER RESULT:|Debate starting/.test(text)) return false;
                  if (/derive-api-key|balance-allowance|open-positions\?|decided-markets\?|\/api\/bot\/credentials/.test(text)) return false;
                  if (/gamma-api\.polymarket|openrouter\.ai\/api|data-api\.polymarket|clob\.polymarket|commandos-production/.test(text)) return false;
                  if (/Trading cycle completed|Bot cycle completed|Bot cycle started|Starting Superforecaster.*trading|Starting Council.*trading|Starting Polymarket V2 trading/.test(text)) return false;
                  return true;
                }).map((log) => (
                  <div key={log.id} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg mb-1 ${getLogRowHighlight(log.level, log.message)}`}>
                    <span className="text-[11px] text-[#919fa6] tabular-nums whitespace-nowrap mt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0 ${logLevelBadge[log.level] || logLevelBadge.info}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className={`text-[12px] leading-relaxed ${logLevelStyle[log.level] || logLevelStyle.info}`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Deploy Panel ── */}
        <div className="hidden lg:block">
          <div className="sticky top-[120px]">
            <div className="bg-white/[0.02] border border-border rounded-xl p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[16px] font-semibold text-[#ffffff]">{strategy?.name || bot?.name}</h3>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                  modeLabel === "Live" ? "bg-amber-400/10 border border-amber-400/20 text-amber-400" : "bg-white/[0.04] border border-border text-[#919fa6]"
                }`}>{modeLabel}</span>
              </div>

              {/* Duration & Frequency */}
              <div className={`space-y-3 mb-4 ${isRunning ? "opacity-50 pointer-events-none" : ""}`}>
                <div>
                  <label className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-1.5 block">Run for</label>
                  <select
                    value={deployDuration}
                    onChange={(e) => setDeployDuration(Number(e.target.value))}
                    disabled={isRunning}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-border text-[13px] text-[#ffffff] appearance-none cursor-pointer hover:border-border focus:outline-none focus:border-border transition-colors disabled:cursor-not-allowed [&>option]:bg-black [&>option]:text-[#ffffff]"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={240}>4 hours</option>
                    <option value={480}>8 hours</option>
                    <option value={1440}>24 hours</option>
                    <option value={0}>Until stopped</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-1.5 block">Trading frequency</label>
                  <select
                    value={deployFrequency}
                    onChange={(e) => setDeployFrequency(Number(e.target.value))}
                    disabled={isRunning}
                    className="w-full px-3 py-2 rounded-lg bg-black border border-border text-[13px] text-[#ffffff] appearance-none cursor-pointer hover:border-border focus:outline-none focus:border-border transition-colors disabled:cursor-not-allowed [&>option]:bg-black [&>option]:text-[#ffffff]"
                  >
                    <option value={300}>Every 5 minutes</option>
                    <option value={600}>Every 10 minutes</option>
                    <option value={900}>Every 15 minutes</option>
                    <option value={1800}>Every 30 minutes</option>
                  </select>
                </div>
              </div>

              {/* Capital Allocation */}
              <div className="border-t border-border pt-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Capital Limit</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] text-[#919fa6]">$</span>
                    <input
                      type="number"
                      defaultValue={capitalAllocated || 2000}
                      id="capital-limit-input"
                      disabled={isRunning}
                      min={10}
                      max={100000}
                      className="w-full sm:w-[72px] px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-border text-[13px] text-[#ffffff] text-right tabular-nums focus:outline-none focus:border-border hover:border-border transition-colors disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-[#919fa6] mt-1.5">Max this bot can spend total. Acts as a safety cap.</p>
              </div>

              {/* Cost */}
              <div className="border-t border-border pt-4 mb-5">
                {isTailBuyer ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Estimated Cost</span>
                    <div className="text-right">
                      <span className="text-[14px] font-semibold text-gain tabular-nums">$0.00</span>
                      <p className="text-[11px] text-[#919fa6] mt-0.5">Rule-based bot — no AI costs</p>
                    </div>
                  </div>
                ) : (
                <>
                <button type="button" onClick={() => setShowCostBreakdown(!showCostBreakdown)} className="w-full flex items-center justify-between group">
                  <span className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider">Estimated Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums">
                      {totalCostEst !== null ? `$${totalCostEst.toFixed(2)}` : `$${costPerHour.toFixed(2)}/hr`}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-[#919fa6] transition-transform ${showCostBreakdown ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {showCostBreakdown && (
                  <div className="mt-3 bg-black/30 border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-border">
                      <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                        <span className="text-[#919fa6]">Cycles/hour</span>
                        <span className="text-[#919fa6] text-right tabular-nums">{cyclesPerHour.toFixed(0)}</span>
                        <span className="text-[#919fa6]">Markets/cycle</span>
                        <span className="text-[#919fa6] text-right tabular-nums">{marketsPerCycle}</span>
                        <span className="text-[#919fa6]">Tokens/hour</span>
                        <span className="text-[#919fa6] text-right tabular-nums">~{(tokensPerHour / 1_000_000).toFixed(1)}M</span>
                        <span className="text-[#919fa6]">Cost/hour</span>
                        <span className="text-[#ffffff] font-medium text-right tabular-nums">${costPerHour.toFixed(2)}</span>
                        {totalCostEst !== null && (<>
                          <span className="text-[#919fa6] font-medium">Total ({durationLabel})</span>
                          <span className="text-[#ffffff] text-right tabular-nums font-semibold">${totalCostEst.toFixed(2)}</span>
                        </>)}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wider mb-1.5">Per-market model costs</p>
                      <div className="space-y-1">
                        {MODEL_COSTS.map((m) => (
                          <div key={m.role} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[#919fa6] truncate">{m.role}</span>
                              <span className="text-[#919fa6]/40 truncate">{m.model}</span>
                            </div>
                            <span className="text-[#919fa6] tabular-nums shrink-0 ml-2">${m.costPerCall.toFixed(4)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border">
                          <span className="text-[#919fa6] font-medium">Subtotal/market</span>
                          <span className="text-[#919fa6] tabular-nums font-medium">${rawCostPerMarket.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#919fa6]">+ 20% buffer</span>
                          <span className="text-[#919fa6] tabular-nums">${COST_PER_MARKET.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </>
                )}
              </div>

              {/* Action buttons */}
              {isRunning ? (
                <div className="flex gap-2">
                  <button onClick={() => setShowStopConfirm(true)}
                    disabled={actionLoading}
                    className={`flex-1 py-2.5 rounded-lg border border-amber-400/30 text-amber-400 text-[13px] font-medium hover:bg-amber-400/10 transition-colors flex items-center justify-center gap-1.5 ${actionLoading ? "opacity-50 cursor-wait" : ""}`}
                  ><Square className="w-3.5 h-3.5" /> Stop</button>
                  <button onClick={() => setShowKillConfirm(true)}
                    disabled={actionLoading}
                    className={`flex-1 py-2.5 rounded-lg border border-red-400/30 text-red-400 text-[13px] font-medium hover:bg-red-400/10 transition-colors flex items-center justify-center gap-1.5 ${actionLoading ? "opacity-50 cursor-wait" : ""}`}
                  ><Radiation className="w-3.5 h-3.5" /> Nuke</button>
                </div>
              ) : isUnavailable ? (
                <button disabled
                  className="w-full py-3 rounded-lg bg-white/[0.06] text-[#919fa6] text-[14px] font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                >Coming Soon</button>
              ) : (
                <button onClick={handleDeploy}
                  disabled={actionLoading}
                  data-tour="strategy-deploy-btn"
                  className={`w-full py-3 rounded-lg bg-[#00C805] text-black text-[14px] font-semibold hover:bg-[#00B004] transition-colors flex items-center justify-center gap-2 ${actionLoading ? "opacity-50 cursor-wait" : ""}`}
                ><Play className="w-4 h-4" /> {actionLoading ? "Deploying…" : "Deploy"}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  TAB BAR                                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between border-b border-border mb-8">
        <div className="flex gap-8">
          {(["settings", "performance", "about"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[14px] font-medium transition-colors border-b-2 ${
                activeTab === tab ? "text-[#ffffff] border-gain" : "text-[#919fa6] border-transparent hover:text-[#919fa6]"
              }`}
            >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  ABOUT TAB                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === "about" && (() => {
        const aboutSlug = isTailBuyer
          ? "tail-buyer"
          : isSuperforecaster
          ? (strategy?.market === "Polymarket" ? "superforecaster-polymarket" : "superforecaster")
          : (strategy?.market === "Polymarket" ? "council-polymarket" : "council");
        return (
        <div className="max-w-3xl space-y-8 pb-16">

          {/* ── Overview ── */}
          <div>
            <p className="text-[15px] text-[#919fa6] leading-relaxed">
              {isTailBuyer
                ? "The Tail Buyer is a rule-based bot that scans prediction markets for near-zero contracts \u2014 outcomes priced under a few cents that the market considers extremely unlikely. It buys small positions across many of these long-shot contracts, betting that a few will resolve YES for massive percentage gains."
                : isSuperforecaster
                ? "The Superforecaster is a research-first prediction agent. Before making any judgment, it gathers comprehensive evidence from the live web \u2014 recent news, historical base rates, expert signals, and arguments on both sides. A single reasoning model then applies structured decomposition methodology to produce a calibrated probability, grounded entirely in the research it just verified."
                : "The Council is a 6-agent adversarial debate system. Six specialized AI models \u2014 each running on a different provider \u2014 analyze every market opportunity through a structured debate. One argues the bull case, another argues the bear case, a risk manager calculates expected value, and a final trader synthesizes everything into a BUY or SKIP decision. The trader can only act when at least 3 of 5 agents agree."}
            </p>
            <p className="text-[15px] text-[#919fa6] leading-relaxed mt-4">
              {isTailBuyer
                ? "No AI models are used. The bot applies simple price and volume filters, checks order book depth, and buys contracts that pass all rules. It runs on a 30-minute cycle and costs nothing in AI fees \u2014 only the capital deployed on trades."
                : isSuperforecaster
                ? "Every prediction follows the same pipeline: scan markets, research via Perplexity, audit findings for credibility, decompose into sub-questions with base rates, synthesize inside and outside views, then apply edge detection, position sizing, and 17 safety rules before any capital moves."
                : "Every trade flows through the same pipeline: scan markets, gather live news via Perplexity, run the 6-agent debate (Forecaster \u2192 News Analyst \u2192 Bull \u2192 Bear \u2192 Risk Manager \u2192 Trader), then apply edge detection, position sizing, and 17 safety rules before any capital moves."}
            </p>
          </div>

          {/* ── Key Highlights ── */}
          <div>
            <SectionHeading title="Key Highlights" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
              {(isTailBuyer ? [
                { title: "Zero AI Cost", desc: "Pure rule-based filtering. No LLM calls, no token fees. The only cost is the capital you deploy on trades." },
                { title: "High Volume Scanning", desc: "Scans up to 50 markets per cycle looking for mispriced near-zero contracts. Casts a wide net across both Polymarket and Kalshi." },
                { title: "Asymmetric Payoff", desc: "Buys contracts at 1\u20132\u00a2. If even one resolves YES, the 50\u2013100x return can cover dozens of losing positions." },
                { title: "Configurable Filters", desc: "Set min/max contract price, expiry windows, volume requirements, and order book depth thresholds to tune your risk." },
              ] : isSuperforecaster ? [
                { title: "Research First", desc: "Perplexity Sonar Pro searches the live web before the model sees the question. No hallucinated base rates \u2014 every data point is sourced." },
                { title: "Structured Decomposition", desc: "The superforecaster breaks each question into sub-questions, establishes base rates with sample sizes, applies inside and outside views, then synthesizes a precise probability." },
                { title: "Edge & Sizing", desc: "Requires 6\u201312% edge depending on confidence. Position sizing adapts to account size via Kelly Criterion. Cash reserves always maintained." },
                { title: "17 Safety Rules", desc: "Every order passes through 11 bot-level and 6 account-level checks. Bots can never exceed global limits." },
              ] : [
                { title: "6-Agent Debate", desc: "Forecaster, News Analyst, Bull Researcher, Bear Researcher, Risk Manager, and Trader \u2014 each on a different AI provider to reduce correlated errors." },
                { title: "Adversarial Design", desc: "The Bull and Bear must directly counter each other\u2019s arguments. The Risk Manager independently calculates whether the math works. Reduces overconfidence and hallucination." },
                { title: "Edge & Sizing", desc: "Requires 6\u201312% edge depending on confidence. Position sizing adapts to account size via Kelly Criterion. Cash reserves always maintained." },
                { title: "17 Safety Rules", desc: "Every order passes through 11 bot-level and 6 account-level checks. Bots can never exceed global limits." },
              ]).map((item) => (
                <div key={item.title} className="bg-white/[0.02] border border-border rounded-lg p-4">
                  <span className="text-[14px] font-semibold text-[#ffffff]">{item.title}</span>
                  <p className="text-[13px] text-[#919fa6] leading-relaxed mt-1.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Models Used / How It Works ── */}
          {isTailBuyer ? (
          <div>
            <SectionHeading title="How It Works" />
            <div className="space-y-2 mt-5">
              {[
                { step: "1", label: "Scan Markets", desc: "Fetches active markets from Polymarket and Kalshi within expiry window" },
                { step: "2", label: "Filter by Price", desc: "Keeps only contracts priced between your min/max thresholds (e.g. 0.1\u20132\u00a2)" },
                { step: "3", label: "Check Liquidity", desc: "Verifies order book depth meets minimum threshold" },
                { step: "4", label: "Apply Limits", desc: "Checks daily loss, max positions, and per-trade size rules" },
                { step: "5", label: "Execute", desc: "Places limit orders for qualifying contracts" },
              ].map((s) => (
                <div key={s.step} className="bg-white/[0.02] border border-border rounded-lg px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[12px] font-bold text-gain bg-gain/10 w-6 h-6 rounded-full flex items-center justify-center shrink-0">{s.step}</span>
                  <div>
                    <span className="text-[13px] font-semibold text-[#ffffff]">{s.label}</span>
                    <p className="text-[12px] text-[#919fa6]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) : (
          <div>
            <SectionHeading title={isSuperforecaster ? "Models" : "The 6 Agents"} />
            <div className="space-y-2 mt-5">
              {(isSuperforecaster ? [
                { role: "Research", model: "Perplexity Sonar Pro" },
                { role: "Superforecaster", model: "User-selected reasoning model" },
              ] : [
                { role: "Forecaster", model: "Grok 4.1 Fast" },
                { role: "News Analyst", model: "Claude Sonnet 4.6" },
                { role: "Bull Researcher", model: "Gemini 3 Flash" },
                { role: "Bear Researcher", model: "Gemini 3 Flash" },
                { role: "Risk Manager", model: "DeepSeek R1" },
                { role: "Trader (Final)", model: "Grok 4.1 Fast" },
              ]).map((m) => (
                <div key={m.role} className="bg-white/[0.02] border border-border rounded-lg px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#ffffff]">{m.role}</span>
                  <span className="text-[12px] text-[#919fa6] font-mono">{m.model}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* ── Read More Link ── */}
          <div className="pt-2">
            <Link
              href={`/about/${aboutSlug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/[0.04] border border-border text-[14px] font-medium text-[#ffffff] hover:bg-white/[0.08] transition-colors"
            >
              Read full documentation
              <span className="text-[#919fa6]">&rarr;</span>
            </Link>
          </div>
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  SETTINGS TAB                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="max-w-3xl space-y-12 pb-16" data-tour="strategy-detail-settings">
          {/* Lock banner */}
          {isRunning && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-400/10 border border-amber-400/20">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span className="text-[13px] text-amber-400">Settings are locked while this agent is running. Stop the agent to make changes.</span>
            </div>
          )}
          {/* Trading Mode */}
          <div data-tour="strategy-training-live">
            <SectionHeading title="Trading Mode" />
            <div className={`flex gap-2 mt-4 mb-3 ${isRunning ? "opacity-50 pointer-events-none" : ""}`}>
              {(["training", "live"] as const).map((m) => (
                <button key={m}
                  disabled={isRunning}
                  onClick={() => {
                    if (m === "live" && botMode !== "live") {
                      if (profile?.live_enabled) setConfirmLiveFor(agentId);
                      else setLiveNotEnabledModal(true);
                    } else if (m === "training") {
                      setBotMode("training");
                      agentsApi.updateConfig(agentId, {}, undefined, "training").catch(() => {});
                    }
                  }}
                  className={`px-5 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                    botMode === m
                      ? m === "live" ? "bg-amber-400/15 border-amber-400/40 text-amber-400" : "bg-white/10 border-border text-[#ffffff]"
                      : "border-border text-[#919fa6] hover:text-[#919fa6]"
                  }`}
                >{m.charAt(0).toUpperCase() + m.slice(1)}</button>
              ))}
            </div>
            {botMode === "live" ? (
              <p className="text-[13px] text-amber-400/80">Live mode — real money will be used via your production API key. Trades are irreversible.</p>
            ) : (
              <p className="text-[13px] text-[#919fa6]">Training mode helps you learn how the agent performs in the market without risking capital. <span className="text-gain">Trades won&apos;t actually be placed.</span></p>
            )}
          </div>

          {/* API Keys */}
          {keyStatus && (
            <div>
              <SectionHeading title="API Keys" />
              <div className="mt-4 space-y-2">
                {keyStatus.required_keys.map((k) => (
                  <div key={k.env_key} className="flex items-center justify-between py-2">
                    <span className="text-[14px] text-[#919fa6]">{k.provider}</span>
                    <span className={`flex items-center gap-1.5 text-[13px] font-medium ${k.configured ? "text-gain" : "text-loss"}`}>
                      <span className={`w-2 h-2 rounded-full ${k.configured ? "bg-gain" : "bg-loss"}`} />
                      {k.configured ? "Configured" : "Missing"}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 border-t border-border mt-2 pt-3">
                  <span className="text-[14px] text-[#919fa6]">{keyStatus.exchange === "polymarket" ? "Polymarket" : "Kalshi"} Credentials</span>
                  {(() => {
                    const credOk = keyStatus.exchange === "polymarket" ? keyStatus.polymarket_configured : keyStatus.kalshi_configured;
                    return (
                      <span className={`flex items-center gap-1.5 text-[13px] font-medium ${credOk ? "text-gain" : "text-loss"}`}>
                        <span className={`w-2 h-2 rounded-full ${credOk ? "bg-gain" : "bg-loss"}`} />
                        {credOk ? "Configured" : "Missing"}
                      </span>
                    );
                  })()}
                </div>
              </div>
              {!keyStatus.ready_to_deploy && (
                <p className="text-[13px] text-amber-400/80 mt-3">Add missing keys in Settings before deploying this bot.</p>
              )}
            </div>
          )}

          {/* Reasoning Model — Superforecaster only */}
          {isSuperforecaster && (
            <div>
              <SectionHeading title="AI Pipeline" />
              <p className="text-[11px] text-[#919fa6] mb-3">Two-step: Perplexity researches each market, then your chosen model does Superforecaster analysis.</p>
              <div className="mt-4 rounded-xl border border-border bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[13px] text-[#919fa6]">Research Layer</span>
                    <span className="text-[11px] text-[#919fa6] ml-2">Perplexity Sonar</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Always On</span>
                </div>
                <div className="border-t border-border pt-3">
                  <label className="text-[13px] text-[#919fa6] block mb-2">Reasoning Model</label>
                  <select
                    value={reasoningModel}
                    onChange={(e) => setReasoningModel(e.target.value)}
                    disabled={isRunning}
                    className={`w-full h-10 bg-black/30 border border-border rounded-lg text-[13px] text-[#ffffff] px-3 focus:outline-none focus:ring-1 focus:ring-gain/30 appearance-none ${isRunning ? "opacity-50" : ""}`}
                  >
                    <option value="anthropic/claude-opus-4.6">Claude Opus 4.6 (strongest reasoning)</option>
                    <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6 (fast + capable)</option>
                    <option value="deepseek/deepseek-r1">DeepSeek R1 (deep chain-of-thought)</option>
                    <option value="x-ai/grok-4.20">Grok 4.20 (real-time X data)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {isTailBuyer ? (
          <div>
            <SectionHeading title="Tail Buyer Settings" />
            <p className="text-[11px] text-[#919fa6] -mt-4 mb-5">Rule-based buying of near-zero contracts. No AI, no debate.</p>

            {/* Trade Sizing */}
            <div>
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Trade Sizing</h4>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
                <NumberInputRow label="Trade Size" value={tradeSize} min={1} max={20} unit="$" onChange={setTradeSize} disabled={isRunning} />
                <NumberInputRow label="Max Open Positions" value={maxPositions} min={1} max={500} onChange={setMaxPositions} disabled={isRunning} />
                <NumberInputRow label="Daily Loss Limit" value={dailyLoss} min={10} max={2000} unit="$" onChange={setDailyLoss} disabled={isRunning} />
                <NumberInputRow label="Max Trades/Day" value={maxTradesDay} min={1} max={500} onChange={setMaxTradesDay} disabled={isRunning} />
              </div>
            </div>

            {/* Price Filtering */}
            <div className="mt-5">
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Price Filtering</h4>
              <p className="text-[11px] text-[#919fa6] mb-3">Target contracts priced between these values.</p>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
                <NumberInputRow label="Min Contract Price" value={minContractPrice} min={0.1} max={5} unit="c" onChange={setMinContractPrice} disabled={isRunning} />
                <NumberInputRow label="Max Contract Price" value={maxContractPrice} min={0.5} max={10} unit="c" onChange={setMaxContractPrice} disabled={isRunning} />
              </div>
            </div>

            {/* Market Filtering */}
            <div className="mt-5">
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Market Filtering</h4>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
                <NumberInputRow label="Min Market Volume" value={minVolume} min={0} max={100000} onChange={setMinVolume} disabled={isRunning} />
                <NumberInputRow label="Min Expiry (Days)" value={minExpiryDays} min={1} max={30} onChange={setMinExpiryDays} disabled={isRunning} />
                <NumberInputRow label="Max Expiry (Days)" value={maxExpiryDays} min={1} max={90} onChange={setMaxExpiryDays} disabled={isRunning} />
                <NumberInputRow label="Max Markets/Cycle" value={maxMarketsPerCycle} min={5} max={200} onChange={setMaxMarketsPerCycle} disabled={isRunning} />
                <NumberInputRow label="Min Book Depth" value={minOrderBookDepthPct} min={0} max={50} unit="%" onChange={setMinOrderBookDepthPct} disabled={isRunning} />
              </div>
            </div>

            {/* Category Filtering */}
            <div className="mt-5">
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Category Filtering</h4>
              <p className="text-[11px] text-[#919fa6] mb-3">Only buy contracts in these categories. Uncheck all for no filter.</p>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4">
                <div className="grid grid-cols-2 gap-2">
                  {["Sports", "Esports", "Crypto", "Politics", "Economics", "Weather", "Tech", "Other"].map((cat) => (
                    <label key={cat} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedCategories.includes(cat)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAllowedCategories([...allowedCategories, cat]);
                          } else {
                            setAllowedCategories(allowedCategories.filter(c => c !== cat));
                          }
                          setTimeout(saveConfig, 0);
                        }}
                        disabled={isRunning}
                        className="rounded border-border bg-black/30 text-amber-500 focus:ring-amber-500/30"
                      />
                      <span className="text-[12px] text-[#919fa6]">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-5">
              <button onClick={() => saveConfig()}
                className="px-6 py-2.5 rounded-lg bg-white/[0.08] border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] hover:bg-white/[0.12] hover:border-border transition-all flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Save Rules
              </button>
            </div>
          </div>
          ) : (
          <>
          {/* Step 1: Bot Sizing */}
          <div>
            <SectionHeading title="Bot Sizing" />
            <p className="text-[11px] text-[#919fa6] -mt-4 mb-5">Step 1 — These control how the bot sizes each trade. Applied inside the bot before any order is sent.</p>

            {/* Position Sizing */}
            <div>
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Position Sizing</h4>
              <p className="text-[11px] text-[#919fa6] mb-3">Controls how much the bot risks per trade. Auto-scales for small accounts.</p>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
                <NumberInputRow label="Kelly Multiplier" value={Math.round(kellyMultiplier * 100)} min={10} max={100} unit="%" onChange={(v) => setKellyMultiplier(v / 100)} disabled={isRunning} />
                <NumberInputRow label="Max Position %" value={maxPositionPct} min={5} max={50} unit="%" onChange={setMaxPositionPct} disabled={isRunning} />
                <NumberInputRow label="Min Position Size" value={minPositionSize} min={0.1} max={10} unit="$" onChange={setMinPositionSize} disabled={isRunning} />
              </div>
            </div>

            {/* Market Filtering */}
            <div className="mt-5">
              <h4 className="text-[13px] font-medium text-[#ffffff] mb-1">Market Filtering</h4>
              <p className="text-[11px] text-[#919fa6] mb-3">Control which markets the bot scans. Volume 0 = automatic tiering by account balance.</p>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
                <NumberInputRow label="Min Market Volume" value={minVolume} min={0} max={5000} onChange={setMinVolume} disabled={isRunning} />
                <NumberInputRow label="Max Expiry (Days)" value={maxExpiryDays} min={1} max={90} onChange={setMaxExpiryDays} disabled={isRunning} />
              </div>
              <p className="text-[11px] text-[#919fa6] mt-2 ml-1">Only scan markets closing within {maxExpiryDays} day{maxExpiryDays !== 1 ? 's' : ''}. Shorter = fewer AI calls, more focused.</p>
            </div>
          </div>

          {/* Step 2: Trade Rules */}
          <div className="mt-8">
            <SectionHeading title="Trade Rules" />
            <p className="text-[11px] text-[#919fa6] -mt-4 mb-5">Step 2 — Every trade the bot proposes is checked against these limits on the server. Fails = rejected, not resized.</p>
            <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-1">
              <NumberInputRow label="Max Trade Size" value={maxTradeSize} min={5} max={500} unit="$" onChange={setMaxTradeSize} disabled={isRunning} />
              <NumberInputRow label="Max Open Positions" value={maxPositions} min={1} max={50} onChange={setMaxPositions} disabled={isRunning} />
              <NumberInputRow label="Min Confidence" value={minConf} min={50} max={100} unit="%" onChange={setMinConf} disabled={isRunning} />
              <NumberInputRow label="Daily Loss Limit" value={dailyLoss} min={10} max={2000} unit="$" onChange={setDailyLoss} disabled={isRunning} />
              <NumberInputRow label="Max Trades/Day" value={maxTradesDay} min={1} max={100} onChange={setMaxTradesDay} disabled={isRunning} />
              <div className="flex items-center justify-between py-2 px-1">
                <span className="text-[12px] text-[#919fa6]">Re-analysis Cooldown</span>
                <select
                  value={reanalyzeCooldown}
                  onChange={(e) => { setReanalyzeCooldown(Number(e.target.value)); setTimeout(saveConfig, 0); }}
                  disabled={isRunning}
                  className="bg-white/[0.06] border border-border rounded-lg px-3 py-1.5 text-[12px] text-[#919fa6] outline-none focus:border-border disabled:opacity-40"
                >
                  <option value={1}>1 hour</option>
                  <option value={3}>3 hours</option>
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={168}>7 days</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-[#919fa6] mt-2 ml-1">How long before the bot re-analyzes a previously seen market. Longer = fewer AI calls.</p>

            {/* Save */}
            <div className="flex justify-end pt-5">
              <button onClick={() => saveConfig()}
                className="px-6 py-2.5 rounded-lg bg-white/[0.08] border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] hover:bg-white/[0.12] hover:border-border transition-all flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Save Rules
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/*  PERFORMANCE TAB                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === "performance" && (
        <div className="max-w-4xl space-y-12 pb-16" data-tour="strategy-detail-perf">
          {/* Key Stats */}
          {bot && (
            <div>
              <SectionHeading title="Key Stats" />
              <div className="mt-4 divide-y divide-white/[0.06]">
                {[
                  { label: "Total P&L", value: formatMoneyFull(bot.totalPnl), highlight: true },
                  { label: "Trade Count", value: String(bot.tradeCount) },
                  { label: "Win Rate", value: `${bot.winRate}%` },
                  { label: "Avg Confidence", value: `${bot.avgConfidence}%` },
                  { label: "Trades Today", value: String(bot.tradesToday) },
                  { label: "Capital Used", value: `$${bot.capitalUsed.toLocaleString()} of $${bot.capitalAllocated.toLocaleString()}` },
                  ...(agentMetrics?.best_category ? [{ label: "Best Category", value: agentMetrics.best_category }] : []),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5">
                    <span className="text-[14px] text-[#919fa6]">{row.label}</span>
                    <span className={`text-[14px] font-medium tabular-nums ${"highlight" in row ? pnlColor(bot.totalPnl) : "text-[#ffffff]"}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Positions */}
          <div>
            <SectionHeading title="Open Positions" />
            {botPositions.length === 0 ? (
              <p className="text-[14px] text-[#919fa6] mt-4 italic">No open positions</p>
            ) : (
              <div className="mt-4 divide-y divide-white/[0.06]">
                {botPositions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-[14px] text-[#ffffff] truncate">{p.marketTitle}</span>
                      <SideBadge side={p.side as "YES" | "NO"} />
                    </div>
                    <span className={`text-[14px] font-medium tabular-nums ${pnlColor(p.pnl)}`}>
                      {p.pnl >= 0 ? "+" : ""}${Math.abs(p.pnl).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trade History */}
          <div>
            <SectionHeading title="Trade History" />
            {botTrades.length === 0 ? (
              <p className="text-[14px] text-[#919fa6] mt-4 italic">No trades yet</p>
            ) : (
              <div className="mt-4 divide-y divide-white/[0.04]">
                {botTrades.map((trade) => {
                  const { summary, hasMore } = extractReasoningSummary(trade.reasoning);
                  return (
                    <div key={trade.id}>
                      <div className="flex items-center gap-3 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] text-[#ffffff] truncate">{trade.marketTitle}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[12px] text-[#919fa6]">
                              {new Date(trade.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <SideBadge side={trade.side as "YES" | "NO"} />
                            <span className="text-[12px] text-[#919fa6]">${trade.size.toFixed(0)}</span>
                          </div>
                        </div>
                        <div className="w-20"><ConfidenceBar value={trade.confidence} /></div>
                        <div className="w-16 text-right">
                          {trade.pnl !== null ? <PnlDisplay value={trade.pnl} size="sm" /> : <span className="text-[12px] text-[#919fa6]">&mdash;</span>}
                        </div>
                        {trade.status === "error" && trade.exchange === "polymarket" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetryClick(trade.id); }}
                            title="Re-place this order at the current market price"
                            className="text-[11px] px-2.5 py-1 rounded-md bg-gain/15 text-gain hover:bg-gain/25 transition-colors font-medium whitespace-nowrap"
                          >
                            Retry
                          </button>
                        )}
                        <TradeStatusPill status={trade.status as "executed" | "skipped" | "paper" | "error" | "pending"} />
                        {expandedTrade === trade.id ? <ChevronUp className="w-4 h-4 text-[#919fa6]" /> : <ChevronDown className="w-4 h-4 text-[#919fa6]" />}
                      </div>
                      {expandedTrade === trade.id && (
                        <div className="pb-4 animate-fade-in">
                          <div className="bg-white/[0.02] border border-border rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="text-[11px] font-medium text-[#919fa6] uppercase tracking-wide">Agent Reasoning</div>
                              {"model" in trade && trade.model && <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">{String(trade.model).split("/").pop()}</span>}
                            </div>
                            <p className="text-[13px] text-[#919fa6] leading-relaxed mb-3">{summary}</p>
                            {hasMore && (<>
                              <button onClick={(e) => { e.stopPropagation(); setExpandedReasoning(expandedReasoning === trade.id ? null : trade.id); }}
                                className="text-[12px] text-gain hover:underline mb-3"
                              >{expandedReasoning === trade.id ? "Hide full reasoning" : "Show full reasoning"}</button>
                              {expandedReasoning === trade.id && (
                                <div className="mt-2 space-y-3 max-h-[500px] overflow-y-auto">
                                  {(() => {
                                    const debateResults = parseDebateResults(trade.reasoning);
                                    if (debateResults) return <DebateResultsView results={debateResults} />;
                                    return formatReasoning(trade.reasoning);
                                  })()}
                                </div>
                              )}
                            </>)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full py-3 text-[13px] text-[#919fa6] hover:text-[#919fa6] transition-colors border-t border-border"
                  >
                    {loadingMore ? "Loading..." : "View More"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ConfirmDialog open={showStopConfirm} title="Stop Agent?" message={`Stop ${bot?.name || "this agent"}? Pending orders will be cancelled and the agent process will end.`} confirmLabel="Stop" onConfirm={handleStop} onCancel={() => setShowStopConfirm(false)} />
      <ConfirmDialog open={showKillConfirm} title="Nuke Agent?" message={`Nuke ${bot?.name || "this agent"}? This will force-stop all agents and delete all API keys.`} confirmLabel="Nuke" danger onConfirm={handleKill} onCancel={() => setShowKillConfirm(false)} />
      <ConfirmDialog open={!!confirmLiveFor} title="Enable Live Trading?" message={`You are enabling real money trading for ${bot?.name || "this agent"}. Real trades will be placed using your production API key. This cannot be undone per trade.`} confirmLabel="Enable Live" danger onConfirm={handleConfirmLive} onCancel={() => setConfirmLiveFor(null)} />
      <ConfirmDialog
        open={!!retryFor}
        title="Re-place this order?"
        message={
          retryFor
            ? `Re-submit ${retryFor.preview?.side ?? ""} ×${retryFor.preview?.count ?? ""} at the CURRENT market price ${retryFor.preview?.current_side_price ?? "?"}${retryFor.preview?.original_price != null ? ` (original ${retryFor.preview.original_price})` : ""}. This places a REAL order.`
            : ""
        }
        confirmLabel={retrying ? "Submitting…" : "Place order"}
        danger
        onConfirm={handleRetryConfirm}
        onCancel={() => setRetryFor(null)}
      />

      {/* Live Not Enabled modal */}
      {liveNotEnabledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLiveNotEnabledModal(false)}>
          <div className="bg-[#0c0c0c] border border-border rounded-xl p-7 max-w-md w-full mx-4 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-[#919fa6]" />
            </div>
            <h3 className="text-[18px] font-semibold text-[#ffffff] mb-2">Live Trading Not Enabled</h3>
            <p className="text-[13px] text-[#919fa6] mb-2">Your account is not enabled for live trading.</p>
            <p className="text-[13px] text-[#919fa6] mb-6">Use Training mode to see how the agent would perform in the market without risking any actual capital.</p>
            <button onClick={() => setLiveNotEnabledModal(false)} className="px-6 py-2.5 rounded-lg bg-white/[0.06] border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
