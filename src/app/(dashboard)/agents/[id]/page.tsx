"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoneyFull, formatPercent, pnlColor, LogLevel } from "@/lib/utils";
import { PnlChart } from "@/components/charts";
import {
  Card, MetricCard, StatusBadge, TimeRangeSelector,
  TradeStatusPill, SideBadge, ConfidenceBar, PnlDisplay, Button,
} from "@/components/ui";
import {
  ExternalLink, Settings, Play, Radiation,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useAgent } from "@/hooks/use-agents";
import { useAgentMetrics } from "@/hooks/use-agents";
import { useTrades } from "@/hooks/use-trades";
import { useAgentLogs } from "@/hooks/use-websocket";
import { PageSkeleton } from "@/components/loading-skeleton";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { agents as agentsApi } from "@/lib/api";

const logLevelStyle: Record<LogLevel, string> = {
  info: "text-text-secondary",
  trade: "text-gain font-medium",
  warn: "text-warning",
  error: "text-loss font-medium",
};

const logLevelBadge: Record<LogLevel, string> = {
  info: "bg-surface-hover text-text-secondary",
  trade: "bg-gain-light text-gain",
  warn: "bg-warning-light text-warning",
  error: "bg-loss-light text-loss",
};

/** Determine row highlight class based on log message content */
function getLogRowHighlight(level: string, message: string): string {
  const msg = message.toLowerCase();
  // Rule check in progress — yellow highlight
  if (msg.includes("checking rules")) {
    return "bg-yellow-500/10 border-l-2 border-yellow-500 pl-2";
  }
  // Rules/account passed — green highlight
  if (msg.includes("rules passed") || msg.includes("account check passed")) {
    return "bg-emerald-500/10 border-l-2 border-emerald-500 pl-2";
  }
  // Rules/account rejected — red highlight
  if (msg.includes("rejected by rules") || msg.includes("rejected by account")) {
    return "bg-red-500/10 border-l-2 border-red-500 pl-2";
  }
  // Trade execution — green highlight
  if (msg.startsWith("executed:") || msg.startsWith("training trade:") || level === "trade") {
    return "bg-emerald-500/10 border-l-2 border-emerald-500 pl-2";
  }
  // Errors — red highlight
  if (level === "error") {
    return "bg-red-500/10 border-l-2 border-red-500 pl-2";
  }
  return "";
}

/** Extract a short summary from raw bot reasoning text */
function extractReasoningSummary(reasoning: string): { summary: string; hasMore: boolean } {
  if (!reasoning || reasoning === "No reasoning available") {
    return { summary: "No reasoning available", hasMore: false };
  }

  // Try to extract confidence score
  const confMatch = reasoning.match(/confidence[:\s=]+(\d+\.?\d*%?)/i);
  const confStr = confMatch ? ` (${confMatch[1].includes('%') ? confMatch[1] : Math.round(parseFloat(confMatch[1]) * 100) + '%'} confidence)` : "";

  // Try to extract key conclusion — first meaningful sentence
  const lines = reasoning.split(/[\n\r]+/).filter(l => l.trim().length > 10);
  const conclusionLine = lines.find(l =>
    /bullish|bearish|buy|sell|signal|recommend|position|edge|strong|weak/i.test(l)
  ) || lines[0] || reasoning.substring(0, 120);

  const summary = conclusionLine.replace(/^\[.*?\]\s*/, "").trim().substring(0, 120);
  return {
    summary: summary + confStr,
    hasMore: reasoning.length > 150,
  };
}

export default function BotDetail() {
  const { id } = useParams();
  const agentId = typeof id === "string" ? id : "";
  const [timeRange, setTimeRange] = useState("1M");
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const toast = useToast();
  const { agent, loading: agentLoading, refresh } = useAgent(agentId);
  const { trades: apiTrades } = useTrades({ agent_id: agentId });
  const { metrics } = useAgentMetrics(agentId ? [agentId] : []);
  const { logs: wsLogs } = useAgentLogs(agentId);

  const hasRealData = !!agent;

  // Compute real avg confidence from metrics API (returns 0-1 decimal)
  const agentMetrics = metrics[agentId];
  const realAvgConfidence = agentMetrics ? Math.round(agentMetrics.avg_confidence * 100) : 0;
  const tradesToday = agentMetrics?.trades_today ?? 0;

  // Build real pnlHistory from trades data
  const realPnlHistory = useMemo(() => {
    if (apiTrades.length === 0) return [];
    const sorted = [...apiTrades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    let cumPnl = 0;
    return sorted.map(t => {
      cumPnl += t.pnl || 0;
      return {
        date: new Date(t.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: cumPnl,
      };
    });
  }, [apiTrades]);

  const bot = hasRealData ? {
    id: agent.id,
    name: agent.name,
    repoUrl: agent.repo_url || "",
    repoSlug: agent.repo_slug || "",
    exchange: (agent.exchange || "kalshi") as "kalshi" | "polymarket",
    status: agent.status === "running" ? "active" as const : "paused" as const,
    strategy: agent.strategy || "AI Strategy",
    totalPnl: agent.total_pnl,
    pnlPercent: agent.capital_allocated > 0 ? (agent.total_pnl / agent.capital_allocated) * 100 : 0,
    todayPnl: 0, // TODO: compute from trades
    tradeCount: agent.trade_count,
    winCount: agent.win_count,
    winRate: (agent.settled_count ?? 0) > 0 ? Math.round((agent.win_count / agent.settled_count) * 100) : 0,
    avgConfidence: realAvgConfidence,
    tradesToday,
    capitalUsed: agent.capital_used,
    capitalAllocated: agent.capital_allocated,
    uptime: agent.started_at ? `${Math.round((Date.now() - new Date(agent.started_at).getTime()) / 60000)}m` : "—",
    pnlHistory: realPnlHistory.length > 0
      ? realPnlHistory
      : [{ date: "Now", value: 0 }],
  } : null;

  if (agentLoading) return <PageSkeleton />;

  if (!bot) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text-primary">Bot not found</h2>
          <Link href="/leaderboard" className="text-sm text-gain hover:underline mt-2 block">
            Back to benchmarking
          </Link>
        </div>
      </div>
    );
  }

  const botTrades = apiTrades.slice(0, 20).map((t) => ({
        id: t.id,
        timestamp: t.timestamp,
        marketTitle: t.market_title || t.market_ticker,
        side: t.side.toUpperCase(),
        size: t.total_cost,
        confidence: (t.confidence || 0.5) * 100,
        pnl: t.pnl,
        status: t.settled ? "settled" : (t.status === "executed" || t.status === "paper" ? "open" : t.status),
        reasoning: t.bot_reasoning || "No reasoning available",
        category: t.category || "Other",
        exchange: (t.exchange || "kalshi") as "kalshi" | "polymarket",
        botId: t.agent_id,
        botName: bot.name,
      }));

  const logs = wsLogs.map((l, i) => ({
        id: `ws-${i}`,
        timestamp: l.timestamp,
        level: l.level as LogLevel,
        message: l.message,
      }));
  const chartData = bot.pnlHistory;

  const handleKill = async () => {
    try {
      await agentsApi.kill(agentId);
      toast.success("Kill switch activated — agent stopped");
      refresh();
    } catch {
      toast.error("Failed to stop agent");
    }
    setShowKillConfirm(false);
  };

  const handleResume = async () => {
    try {
      // Resume in paper mode for safety — user can manually switch to live if desired
      const resumeMode = (bot as Record<string, unknown>).mode === "live" ? "paper" : ((bot as Record<string, unknown>).mode as string || "paper");
      await agentsApi.deploy({ agent_id: agentId, mode: resumeMode, capital_allocated: bot.capitalAllocated || 2000 });
      toast.success("Agent resumed");
      refresh();
    } catch {
      toast.error("Failed to resume agent");
    }
  };

  return (
    <div className="relative animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-text-primary">{bot.name}</h1>
            <StatusBadge status={bot.status} />
          </div>
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <a
              href={bot.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-gain transition-colors"
            >
              {bot.repoSlug} <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <span>·</span>
            <span>Uptime: {bot.uptime}</span>
            <span>·</span>
            <span>{bot.exchange}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/agents?selected=${bot.id}`}>
            <Button variant="secondary" size="sm">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Button>
          </Link>
          {bot.status === "active" ? (
            <Button variant="danger" size="sm" onClick={() => setShowKillConfirm(true)}>
              <Radiation className="w-3.5 h-3.5" /> Nuke
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleResume}>
              <Play className="w-3.5 h-3.5" />
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Hero P&L */}
      <div className="mb-2">
        <div className="text-sm text-text-secondary">Total P&L</div>
        <div className="flex items-baseline gap-3 mt-1">
          <span className={`text-[36px] font-bold tracking-tight tabular-nums ${pnlColor(bot.totalPnl)}`}>
            {formatMoneyFull(bot.totalPnl)}
          </span>
          <span className={`text-base font-semibold tabular-nums ${pnlColor(bot.pnlPercent)}`}>
            {formatPercent(bot.pnlPercent)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-sm font-medium tabular-nums ${pnlColor(bot.todayPnl)}`}>
            {formatMoneyFull(bot.todayPnl)} today
          </span>
        </div>
      </div>

      {/* Chart */}
      <Card className="mb-6 !p-0 overflow-hidden" padding="p-0">
        <div className="flex items-center justify-end px-5 pt-4">
          <TimeRangeSelector active={timeRange} onChange={setTimeRange} />
        </div>
        <div className="px-2">
          <PnlChart data={chartData} height={280} />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <MetricCard label="Total P&L" value={formatMoneyFull(bot.totalPnl)} trend={bot.pnlPercent} />
        <MetricCard label="Win Rate" value={`${bot.winRate}%`} sub={`${bot.winCount}/${bot.tradeCount}`} />
        <MetricCard label="Avg Confidence" value={`${bot.avgConfidence}%`} />
        <MetricCard label="Trades Today" value={String(bot.tradesToday)} />
        <MetricCard label="Capital" value={`$${bot.capitalUsed.toLocaleString()}`} sub={`of $${bot.capitalAllocated.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        {/* Trade History */}
        <Card padding="p-0">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-base font-semibold text-text-primary">Trade History</h3>
          </div>
          <div className="divide-y divide-[#111]">
            {botTrades.map((trade) => {
              const { summary, hasMore } = extractReasoningSummary(trade.reasoning);
              return (
                <div key={trade.id}>
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary truncate">{trade.marketTitle}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-tertiary">
                          {new Date(trade.timestamp).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <SideBadge side={trade.side as "YES" | "NO"} />
                        <span className="text-xs text-text-secondary">${trade.size.toFixed(0)}</span>
                      </div>
                    </div>
                    <div className="w-20">
                      <ConfidenceBar value={trade.confidence} />
                    </div>
                    <div className="w-16 text-right">
                      {trade.pnl !== null ? (
                        <PnlDisplay value={trade.pnl} size="sm" />
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </div>
                    <TradeStatusPill status={trade.status as "executed" | "skipped" | "paper" | "error" | "pending"} />
                    {expandedTrade === trade.id ? (
                      <ChevronUp className="w-4 h-4 text-text-tertiary" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-tertiary" />
                    )}
                  </div>
                  {expandedTrade === trade.id && (
                    <div className="px-5 pb-4 animate-fade-in">
                      <div className="bg-bg border border-border rounded-lg p-3">
                        <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                          Agent Reasoning
                        </div>
                        <p className="text-xs text-text-primary leading-relaxed mb-1">
                          {summary}
                        </p>
                        {hasMore && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedReasoning(expandedReasoning === trade.id ? null : trade.id);
                              }}
                              className="text-[11px] text-gain hover:underline mb-1"
                            >
                              {expandedReasoning === trade.id ? "Hide full reasoning" : "Show full reasoning"}
                            </button>
                            {expandedReasoning === trade.id && (
                              <pre className="text-[11px] text-text-secondary leading-relaxed font-mono whitespace-pre-wrap bg-surface-hover rounded p-2 mt-1 max-h-48 overflow-y-auto">
                                {trade.reasoning}
                              </pre>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Live Log Stream */}
        <Card padding="p-0" className="h-fit max-h-[600px] overflow-hidden flex flex-col">
          <div className="px-4 pt-4 pb-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Live Reasoning Stream</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gain animate-pulse-dot" />
              <span className="text-xs text-text-tertiary">Live</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-bg log-stream">
            {logs.map((log) => {
              const rowHighlight = getLogRowHighlight(log.level, log.message);
              return (
                <div key={log.id} className={`flex items-start gap-2 py-1 rounded ${rowHighlight}`}>
                  <span className="text-[10px] text-text-tertiary tabular-nums whitespace-nowrap mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${logLevelBadge[log.level]}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className={`text-xs leading-relaxed ${logLevelStyle[log.level]}`}>
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={showKillConfirm}
        title="Nuke Agent?"
        message={`This will force-stop ${bot.name}, delete all API keys, and stop all other running agents. You will need to re-enter credentials to deploy again.`}
        confirmLabel="Nuke"
        danger
        onConfirm={handleKill}
        onCancel={() => setShowKillConfirm(false)}
      />
    </div>
  );
}
