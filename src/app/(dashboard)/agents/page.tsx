"use client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { useAgentLogs } from "@/hooks/use-websocket";
import { useTrades } from "@/hooks/use-trades";
import { useAgents, useAgentMetrics } from "@/hooks/use-agents";
import { agents as agentsApi, type KeyStatus } from "@/lib/api";
import { PnlChart } from "@/components/charts";
import { ExchangeBadge, SideBadge } from "@/components/ui";
import { pnlColor } from "@/lib/utils";
import { getBotShortDescription, getBotDescription } from "@/lib/bot-descriptions";
import { BotAvatar } from "@/components/BotAvatar";
import { Square, Play, Pause, Radiation, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { usePortfolioStats } from "@/hooks/use-portfolio";
import { useToast } from "@/components/toast";

// ── helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


const TAG_LABEL: Record<string, string> = {
  trade: "TRADE",
  info:  "SYSTEM",
  warn:  "REASONING",
  error: "BLOCKED",
};

function NumberInputRow({ label, value, min, max, unit = "", onChange, disabled }: {
  label: string; value: number; min: number; max: number; unit?: string;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-b-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <span className="text-[13px] font-medium text-white/90">{label}</span>
      <div className="relative">
        {unit === "$" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-white/40 pointer-events-none">$</span>}
        <input
          type="number" min={min} max={max} value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className={`w-[80px] py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white tabular-nums text-right focus:outline-none focus:border-white/20 hover:border-white/15 transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:cursor-not-allowed ${unit === "$" ? "pl-5 pr-2.5" : (unit === "%" || unit === "c") ? "pl-2.5 pr-6" : "px-2.5"}`}
        />
        {unit === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-white/40 pointer-events-none">%</span>}
        {unit === "c" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-white/40 pointer-events-none">&cent;</span>}
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function StrategiesPageWrapper() {
  return (
    <Suspense fallback={<div className="animate-fade-in"><h1 className="text-[34px] font-bold text-text-primary tracking-tight">Strategies</h1><p className="text-[13px] text-text-tertiary mt-1">Loading...</p></div>}>
      <StrategiesPage />
    </Suspense>
  );
}

function StrategiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { agents: realAgents, loading, error: agentsError, deploy, pause, kill } = useAgents();

  const agents = realAgents;

  // Use real agents list (before demo mapping) for IDs and metrics
  const apiAgents = realAgents;
  const agentIds = useMemo(() => (apiAgents || []).map(a => a.id), [apiAgents]);
  const { metrics: agentMetrics } = useAgentMetrics(agentIds);

  const initialSelected = searchParams.get("selected") || "";
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [activeTab, setActiveTab] = useState<"performance" | "settings" | "reasoning">("performance");
  const [runningBots, setRunningBots] = useState<Record<string, boolean>>({});
  const [togglingBot, setTogglingBot] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ botId: string; action: "stop" | "kill" } | null>(null);
  const [terminalPaused, setTerminalPaused] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);

  // Settings state (only settings that are actually enforced by backend rules engine)
  const [maxTradeSize, setMaxTradeSize] = useState(50);
  const [maxLifetimeSpend, setMaxLifetimeSpend] = useState(10000);
  const [maxPositions, setMaxPositions] = useState(10);
  const [dailyLoss, setDailyLoss] = useState(200);
  const [minConf, setMinConf] = useState(70);
  const [maxTradesDay, setMaxTradesDay] = useState(10);
  const [kellyMultiplier, setKellyMultiplier] = useState(0.25);
  const [minPositionSize, setMinPositionSize] = useState(1.0);
  const [maxPositionPct, setMaxPositionPct] = useState(30);
  const [minVolume, setMinVolume] = useState(0);
  const [maxExpiryDays, setMaxExpiryDays] = useState(7);
  // Tail-buyer specific settings
  const [minContractPrice, setMinContractPrice] = useState(0.5);
  const [maxContractPrice, setMaxContractPrice] = useState(3);
  const [minExpiryDays, setMinExpiryDays] = useState(7);
  const [maxMarketsPerCycle, setMaxMarketsPerCycle] = useState(25);
  const [tradeSize, setTradeSize] = useState(2);
  const [minOrderBookDepthPct, setMinOrderBookDepthPct] = useState(2);
  const [allowedCategories, setAllowedCategories] = useState<string[]>(["Sports", "Esports"]);

  // Bot identity state (per bot)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [botNames, _setBotNames] = useState<Record<string, string>>({});
  const [botMode, setBotMode] = useState<Record<string, "training" | "live">>({});
  const [confirmLiveFor, setConfirmLiveFor] = useState<string | null>(null);
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KeyStatus>>({});

  // Deploy modal state
  const [deployModal, setDeployModal] = useState<string | null>(null); // bot ID or null
  const [deployDuration, setDeployDuration] = useState(30); // minutes (0 = unlimited)
  const [deployFrequency, setDeployFrequency] = useState(300); // seconds (5 min minimum)
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  // showCategoryDropdown removed
  const [liveNotEnabledModal, setLiveNotEnabledModal] = useState(false);
  const { profile } = useAuth();

  const logRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Set selectedId to first agent if not set
  useEffect(() => {
    if (!selectedId && agents.length > 0) {
      setSelectedId(agents[0].id);
    }
  }, [agents, selectedId]);

  // Fetch key statuses for all agents
  useEffect(() => {
    if (realAgents.length === 0) return;
    realAgents.forEach((a) => {
      agentsApi.keyStatus(a.id).then((ks) => {
        setKeyStatuses((prev) => ({ ...prev, [a.id]: ks }));
      }).catch(() => {});
    });
  }, [realAgents]);

  // Sync running state and mode from agents (always reflect backend state)
  useEffect(() => {
    if (agents.length > 0) {
      setRunningBots(() => {
        const next: Record<string, boolean> = {};
        agents.forEach((a) => {
          next[a.id] = a.status === "running";
        });
        return next;
      });
      setBotMode((prev) => {
        const next = { ...prev };
        agents.forEach((a) => {
          next[a.id] = (a.mode === "live" ? "live" : "training") as "training" | "live";
        });
        return next;
      });
    }
  }, [agents]);

  // Open deploy modal
  const handleStrategies = useCallback((botId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingBot) return;
    const bot = agents.find(a => a.id === botId);
    const botTypeId = (bot as Record<string, unknown> | undefined)?.bot_type_id as string | undefined;
    setDeployFrequency(botTypeId?.includes("tail-buyer") ? 1800 : botTypeId?.startsWith("polymarket") ? 120 : 300);
    setDeployModal(botId);
  }, [togglingBot, agents]);

  // Actually deploy after user confirms in modal
  const handleConfirmDeploy = useCallback(async () => {
    const botId = deployModal;
    if (!botId) return;
    setDeployModal(null);
    setTogglingBot(botId);
    try {
      const mode = botMode[botId] === "live" ? "live" : "training";
      await deploy(botId, mode, maxLifetimeSpend, {
        duration_minutes: deployDuration,
        cycle_interval_seconds: deployFrequency,
      });
      const botName = agents.find(a => a.id === botId)?.name || "Bot";
      const durLabel = deployDuration === 0 ? "until stopped" : `for ${deployDuration >= 60 ? `${deployDuration / 60}h` : `${deployDuration}m`}`;
      toast.success(`${botName} deployed ${durLabel}!`);
      router.push('/trades');
    } catch (err: unknown) {
      console.error("Deploy bot failed:", err);
      const msg = err instanceof Error ? err.message : "Failed to deploy bot";
      toast.error(msg);
    } finally {
      setTogglingBot(null);
    }
  }, [deployModal, botMode, maxLifetimeSpend, deployDuration, deployFrequency, deploy, agents]);

  // Stop bot — show confirmation modal first
  const handleStop = useCallback((botId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingBot) return;
    setConfirmAction({ botId, action: "stop" });
  }, [togglingBot]);

  // Kill bot — show confirmation modal first
  const handleKill = useCallback((botId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingBot) return;
    setConfirmAction({ botId, action: "kill" });
  }, [togglingBot]);

  // Execute stop after confirmation
  const executeStop = useCallback(async (botId: string) => {
    setConfirmAction(null);
    setTogglingBot(botId);
    try {
      await pause(botId);
      setRunningBots(prev => ({ ...prev, [botId]: false }));
    } catch (err) {
      console.error("Stop bot failed:", err);
    } finally {
      setTogglingBot(null);
    }
  }, [pause]);

  // Execute kill after confirmation
  const executeKill = useCallback(async (botId: string) => {
    setConfirmAction(null);
    setTogglingBot(botId);
    try {
      await kill(botId);
      setRunningBots(prev => ({ ...prev, [botId]: false }));
    } catch (err) {
      console.error("Kill bot failed:", err);
    } finally {
      setTogglingBot(null);
    }
  }, [kill]);

  // Load per-bot settings from agent.config_json + capital_allocated when selected bot changes
  const configLoadedRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!selectedId) return;
    const agent = realAgents.find(a => a.id === selectedId);
    if (configLoadedRef.current[selectedId]) return;
    // Load capital_allocated as maxLifetimeSpend (per-bot max spend cap)
    if (agent?.capital_allocated !== undefined && agent.capital_allocated > 0) {
      setMaxLifetimeSpend(agent.capital_allocated);
    }
    if (!agent?.config_json) return;
    const cfg = agent.config_json as Record<string, unknown>;
    configLoadedRef.current[selectedId] = true;
    if (cfg.maxTradeSize !== undefined) setMaxTradeSize(cfg.maxTradeSize as number);
    if (cfg.maxLifetimeSpend !== undefined) setMaxLifetimeSpend(cfg.maxLifetimeSpend as number);
    if (cfg.maxPositions !== undefined) setMaxPositions(cfg.maxPositions as number);
    if (cfg.dailyLoss !== undefined) setDailyLoss(cfg.dailyLoss as number);
    if (cfg.minConf !== undefined) setMinConf(cfg.minConf as number);
    if (cfg.maxTradesDay !== undefined) setMaxTradesDay(cfg.maxTradesDay as number);
    if (cfg.kellyMultiplier !== undefined) setKellyMultiplier(cfg.kellyMultiplier as number);
    if (cfg.minPositionSize !== undefined) setMinPositionSize(cfg.minPositionSize as number);
    if (cfg.maxPositionPct !== undefined) setMaxPositionPct(cfg.maxPositionPct as number);
    if (cfg.minVolume !== undefined) setMinVolume(cfg.minVolume as number);
    if (cfg.maxExpiryDays !== undefined) setMaxExpiryDays(cfg.maxExpiryDays as number);
    if (cfg.minContractPrice !== undefined) setMinContractPrice(cfg.minContractPrice as number);
    if (cfg.maxContractPrice !== undefined) setMaxContractPrice(cfg.maxContractPrice as number);
    if (cfg.minExpiryDays !== undefined) setMinExpiryDays(cfg.minExpiryDays as number);
    if (cfg.maxMarketsPerCycle !== undefined) setMaxMarketsPerCycle(cfg.maxMarketsPerCycle as number);
    if (cfg.tradeSize !== undefined) setTradeSize(cfg.tradeSize as number);
    if (cfg.minOrderBookDepthPct !== undefined) setMinOrderBookDepthPct(cfg.minOrderBookDepthPct as number);
    if (cfg.allowedCategories !== undefined) setAllowedCategories(cfg.allowedCategories as string[]);
    // Tail-buyer defaults: override shared defaults when no config saved yet
    const btId = (agent as unknown as Record<string, unknown> | undefined)?.bot_type_id as string | undefined;
    if (btId?.includes("tail-buyer")) {
      if (cfg.minVolume === undefined) setMinVolume(50000);
      if (cfg.maxPositions === undefined) setMaxPositions(100);
      if (cfg.maxTradesDay === undefined) setMaxTradesDay(100);
      if (cfg.maxExpiryDays === undefined) setMaxExpiryDays(30);
    }
  }, [selectedId, realAgents]);

  // Debounced save of per-bot settings to backend
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveConfig = useCallback(() => {
    if (!selectedId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const config: Record<string, unknown> = {
        maxTradeSize, maxLifetimeSpend,
        maxPositions, dailyLoss, minConf, maxTradesDay,
        kellyMultiplier, minPositionSize, maxPositionPct,
        minVolume: minVolume > 0 ? minVolume : undefined,
        maxExpiryDays,
      };
      // Add tail-buyer specific keys only for tail-buyer bots
      const agent = realAgents.find(a => a.id === selectedId);
      const botTypeId = (agent as Record<string, unknown> | undefined)?.bot_type_id as string | undefined;
      if (botTypeId?.includes("tail-buyer")) {
        config.minContractPrice = minContractPrice;
        config.maxContractPrice = maxContractPrice;
        config.minExpiryDays = minExpiryDays;
        config.maxMarketsPerCycle = maxMarketsPerCycle;
        config.tradeSize = tradeSize;
        config.minOrderBookDepthPct = minOrderBookDepthPct;
        config.allowedCategories = allowedCategories;
      }
      agentsApi.updateConfig(selectedId, config, maxLifetimeSpend).catch(() => {});
    }, 500);
  }, [
    selectedId, realAgents,
    maxTradeSize, maxLifetimeSpend,
    maxPositions, dailyLoss, minConf, maxTradesDay,
    kellyMultiplier, minPositionSize, maxPositionPct, minVolume, maxExpiryDays,
    minContractPrice, maxContractPrice, minExpiryDays,
    maxMarketsPerCycle, tradeSize, minOrderBookDepthPct, allowedCategories,
  ]);

  useEffect(() => {
    if (!configLoadedRef.current[selectedId]) return; // Don't save before initial load
    saveConfig();
  }, [saveConfig, selectedId]);

  const bot = agents.find((a) => a.id === selectedId);
  const botExchange = (bot as unknown as { bot_type_id?: string })?.bot_type_id?.startsWith("polymarket") ? "Polymarket" : "Kalshi";
  const isTailBuyer = (bot as unknown as { bot_type_id?: string })?.bot_type_id?.includes("tail-buyer") ?? false;
  const isRunning = runningBots[selectedId] ?? false;

  const { logs: wsLogs } = useAgentLogs(selectedId);
  const { trades: apiTrades } = useTrades({ agent_id: selectedId });
  const { stats: portfolioStats } = usePortfolioStats();

  const botTrades = apiTrades.map((t) => ({
        id: t.id,
        timestamp: t.timestamp,
        marketTitle: t.market_title || t.market_ticker,
        category: t.category || "Other",
        side: t.side.toUpperCase() as "YES" | "NO",
        pnl: t.pnl,
        botId: t.agent_id,
      }));

  const botPositions = (portfolioStats?.open_positions ?? [])
        .filter((p) => p.agent_id === selectedId)
        .map((p) => ({
          id: p.id,
          botId: p.agent_id,
          botName: p.agent_name,
          marketTitle: p.market_title || p.market_ticker,
          marketTicker: p.market_ticker,
          category: p.category || "Other",
          exchange: ((p as Record<string, unknown>).exchange as string || "kalshi") as "kalshi" | "polymarket",
          side: p.side.toUpperCase() as "YES" | "NO",
          size: p.total_cost,
          entryPrice: p.count > 0 ? p.total_cost / p.count : p.price,
          currentPrice: p.price,
          pnl: p.pnl,
        }));

  const logs = wsLogs.length > 0
    ? wsLogs.map((l, i) => ({ id: String(i), level: l.level, message: l.message, timestamp: l.timestamp.slice(11, 19) }))
    : [];

  const currentName = botNames[selectedId] ?? bot?.name ?? "";

  // P&L history from trades for chart
  const pnlHistory = useMemo(() => {
    if (botTrades.length === 0) return [];
    let cumPnl = 0;
    return botTrades
      .filter((t) => t.pnl !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((t) => {
        cumPnl += t.pnl ?? 0;
        return { date: t.timestamp.slice(0, 10), value: cumPnl };
      });
  }, [botTrades]);

  useEffect(() => {
    if (!terminalPaused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [selectedId, terminalPaused]);

  // category filter state removed

  // EXPIRY_OPTIONS removed — not enforced by backend rules engine

  const winRate = bot ? ((bot.settled_count ?? 0) > 0 ? Math.round((bot.win_count / bot.settled_count) * 100) : 0) : 0;
  const sharpe = bot ? (bot.capital_allocated > 0 ? (bot.total_pnl / (bot.capital_allocated * 0.12)).toFixed(2) : "0.00") : "0.00";
  const avgConfidence = `${Math.round((agentMetrics[bot?.id ?? ""]?.avg_confidence ?? 0) * 100)}%`;

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-[34px] font-bold text-text-primary tracking-tight">Strategies</h1>
          </div>
          <p className="text-[13px] text-text-tertiary mt-1">Loading agents...</p>
        </div>
      </div>
    );
  }

  if (agentsError) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-[34px] font-bold text-text-primary tracking-tight">Strategies</h1>
          </div>
          <p className="text-[13px] text-text-tertiary mt-1">Manage and monitor your trading strategies</p>
        </div>
        <div className="text-center py-20">
          <p className="text-red-400 text-sm font-medium mb-2">Failed to load agents</p>
          <p className="text-text-tertiary text-[13px]">{agentsError}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 text-[13px] border border-border rounded-lg hover:bg-surface-hover transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-[34px] font-bold text-text-primary tracking-tight">Strategies</h1>
          </div>
          <p className="text-[13px] text-text-tertiary mt-1">Manage and monitor your trading strategies</p>
        </div>
        <div className="text-center py-20 text-text-tertiary text-sm">
          No agents deployed yet. Add agents via the backend API.
        </div>
      </div>
    );
  }

  if (!bot) return null;

  return (
    <div className="relative animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] font-bold text-text-primary tracking-tight">Strategies</h1>
        </div>
        <p className="text-[13px] text-text-tertiary mt-1">Manage and monitor your trading strategies</p>
      </div>

      {/* ── Bot cards strip ─────────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-8" style={{ scrollbarWidth: "none" }}>
        {agents.map((b) => {
          const selected = b.id === selectedId;
          const running = runningBots[b.id] ?? false;
          const displayName = botNames[b.id] ?? b.name;
          const isAvailable = b.available !== false;
          return (
            <div
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              className={`shrink-0 w-56 rounded-xl p-4 border cursor-pointer transition-all ${
                !isAvailable ? "opacity-60" : ""
              } ${
                selected
                  ? "bg-black border-[#555] ring-1 ring-[#1a1a1a]"
                  : "bg-black border-border hover:border-border"
              }`}
            >
              {/* Exchange badge */}
              <div className="flex items-center justify-between mb-3">
                <ExchangeBadge exchange={(b as unknown as { bot_type_id?: string }).bot_type_id?.startsWith("polymarket") ? "polymarket" : "kalshi"} />
                {botMode[b.id] === "live" && isAvailable && (
                  <span className="shrink-0 text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30">
                    Live
                  </span>
                )}
              </div>

              {/* Bot name + avatar */}
              <div className="flex items-center gap-2 mb-1">
                <BotAvatar agentId={b.id} botTypeId={(b as unknown as { bot_type_id?: string }).bot_type_id} size={28} />
                <p className="text-sm font-semibold text-text-primary leading-snug truncate">{displayName}</p>
              </div>
              <p className="text-[12px] text-text-tertiary mb-3 pl-9 line-clamp-2">{b.strategy || b.description || ""}</p>

              {/* P&L */}
              <p className={`text-[15px] font-bold tabular-nums mb-3 ${pnlColor(b.total_pnl)}`}>
                {b.total_pnl >= 0 ? "+" : ""}${Math.abs(b.total_pnl).toFixed(2)}
              </p>

              {/* Action buttons */}
              {isAvailable ? (
                running ? (
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStop(b.id, e); }}
                      disabled={togglingBot === b.id}
                      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-full border border-warning text-[12px] font-semibold text-warning hover:bg-warning/10 transition-colors ${
                        togglingBot === b.id ? "opacity-50 cursor-wait" : ""
                      }`}
                    >
                      <Square className="w-2.5 h-2.5" /> Stop Bot
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleKill(b.id); }}
                      disabled={togglingBot === b.id}
                      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-full border border-loss text-[12px] font-semibold text-loss hover:bg-loss/10 transition-colors ${
                        togglingBot === b.id ? "opacity-50 cursor-wait" : ""
                      }`}
                    >
                      <Radiation className="w-2.5 h-2.5" /> Nuke
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStrategies(b.id, e); }}
                    disabled={togglingBot === b.id}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-full border border-gain text-[12px] font-semibold text-gain hover:bg-gain/10 transition-colors ${
                      togglingBot === b.id ? "opacity-50 cursor-wait" : ""
                    }`}
                  >
                    <Play className="w-3 h-3" /> Deploy
                  </button>
                )
              ) : (
                <div className="flex items-center justify-center py-2">
                  <span className="text-[12px] font-semibold px-2 py-1 rounded-full bg-[#111] text-text-tertiary border border-border">
                    Coming Soon
                  </span>
                </div>
              )}

              {/* Missing keys warning */}
              {isAvailable && keyStatuses[b.id] && !keyStatuses[b.id].ready_to_deploy && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[12px] text-amber-400/80">Missing API keys</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Selected bot panel ──────────────────────────────────────────────── */}
      <div>
        {/* Panel header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <BotAvatar agentId={bot.id} botTypeId={(bot as unknown as { bot_type_id?: string }).bot_type_id} size={40} />
            <h2 className="text-[22px] font-bold text-text-primary">{currentName}</h2>
            <ExchangeBadge exchange={(bot as unknown as { bot_type_id?: string }).bot_type_id?.startsWith("polymarket") ? "polymarket" : "kalshi"} />
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-[#111] text-text-secondary border border-border">
              {bot.strategy || bot.description || getBotShortDescription((bot as unknown as { bot_type_id?: string }).bot_type_id) || ""}
            </span>
            <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-gain" : "bg-[#444]"}`} />
          </div>
          <div className="flex items-center gap-2.5">
            {bot.available === false ? (
              <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#111] text-text-tertiary border border-border">
                Coming Soon
              </span>
            ) : isRunning ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStop(selectedId)}
                  disabled={togglingBot === selectedId}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors border border-warning text-warning hover:bg-warning/10 ${
                    togglingBot === selectedId ? "opacity-50 cursor-wait" : ""
                  }`}
                >
                  <Square className="w-3 h-3" /> Stop
                </button>
                <button
                  onClick={() => handleKill(selectedId)}
                  disabled={togglingBot === selectedId}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors border border-loss text-loss hover:bg-loss/10 ${
                    togglingBot === selectedId ? "opacity-50 cursor-wait" : ""
                  }`}
                  title="Emergency: delete all API keys and stop everything"
                >
                  <Radiation className="w-3 h-3" /> Nuke
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border mb-6">
          {(["performance", "settings", "reasoning"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[13px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === tab
                  ? "border-white text-text-primary"
                  : "border-transparent text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab === "reasoning" ? "Trade Pipeline" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── PERFORMANCE TAB ─────────────────────────────────────────────── */}
        {activeTab === "performance" && (
          <div className="space-y-6">
            {/* 6 metric cards */}
            <div className="grid grid-cols-6 gap-3">
              {[
                { label: "P&L",        value: `${bot.total_pnl >= 0 ? "+" : ""}$${Math.abs(bot.total_pnl).toFixed(0)}`, color: pnlColor(bot.total_pnl) },
                { label: "WIN RATE",   value: `${winRate}%`,                    color: "text-text-primary" },
                { label: "TRADES",     value: String(bot.trade_count),           color: "text-text-primary" },
                { label: "CONFIDENCE", value: avgConfidence,                       color: "text-text-primary" },
                { label: "SHARPE",     value: sharpe,                            color: "text-text-primary" },
                { label: "BEST CAT",   value: agentMetrics[bot.id]?.best_category ?? "N/A", color: "text-text-primary" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-black border border-border rounded-xl p-4">
                  <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-2">{label}</div>
                  <div className={`text-[22px] font-bold tabular-nums leading-none ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* P&L Chart */}
            <div className="bg-black border border-border rounded-xl overflow-hidden">
              <div className="px-5 pt-4 pb-1">
                <p className="text-[12px] text-text-tertiary uppercase tracking-wider">P&L Chart</p>
              </div>
              {pnlHistory.length > 0 ? (
                <PnlChart data={pnlHistory} height={200} />
              ) : (
                <div className="h-[200px] flex items-center justify-center text-text-tertiary text-[13px]">
                  No trade data for chart
                </div>
              )}
            </div>

            {/* Open positions + Live terminal */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black border border-border rounded-xl p-4">
                <p className="text-[12px] text-text-tertiary uppercase tracking-wider mb-3">Open Positions</p>
                {botPositions.length === 0 ? (
                  <p className="text-[13px] text-text-tertiary">No open positions</p>
                ) : (
                  <div className="space-y-1">
                    {botPositions.map((pos) => {
                      const contracts = (pos as Record<string, unknown>).contracts as number || Math.round(pos.size / Math.max(pos.entryPrice, 0.01));
                      const unrealized = (pos.currentPrice - pos.entryPrice) * contracts;
                      return (
                        <div key={pos.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <p className="text-[13px] text-text-primary truncate flex-1 mr-3">{pos.marketTitle}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <SideBadge side={pos.side} />
                            <span className={`text-[13px] font-semibold tabular-nums ${pnlColor(unrealized)}`}>
                              {unrealized >= 0 ? "+" : ""}${Math.abs(unrealized).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-black border border-border rounded-xl overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-[12px] text-text-tertiary uppercase tracking-wider">Live Terminal</p>
                  <button
                    onClick={() => setTerminalPaused((p) => !p)}
                    className="flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    {terminalPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    {terminalPaused ? "Resume" : "Pause"}
                  </button>
                </div>
                <div ref={logRef} className="overflow-y-auto p-3 space-y-1.5 font-mono max-h-52">
                  {logs.length === 0 ? (
                    <div className="text-[12px] text-text-tertiary text-center py-4">Waiting for logs...</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 text-[12px]">
                        <span className="text-text-tertiary tabular-nums shrink-0">{log.timestamp}</span>
                        <span className="font-bold shrink-0 text-text-tertiary">
                          [{TAG_LABEL[log.level] || "INFO"}]
                        </span>
                        <span className="text-text-tertiary">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Trade history */}
            <div className="bg-black border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[12px] text-text-tertiary uppercase tracking-wider">Trade History</p>
              </div>
              {botTrades.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-text-tertiary">No trades for this bot</p>
              ) : (
                <div className="divide-y divide-[#0a0a0a]">
                  {botTrades.map((t) => {
                    const won = (t.pnl ?? 0) > 0;
                    return (
                      <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                        <span className="text-[12px] text-text-tertiary tabular-nums w-16 shrink-0">{timeAgo(t.timestamp)}</span>
                        <p className="text-[13px] text-text-primary flex-1 truncate">{t.marketTitle}</p>
                        <span className="text-[12px] font-medium px-1.5 py-0.5 rounded bg-[#111] text-text-tertiary shrink-0">{t.category}</span>
                        <SideBadge side={t.side} />
                        <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${pnlColor(t.pnl ?? 0)}`}>
                          {won ? "Won" : "Lost"} {(t.pnl ?? 0) >= 0 ? "+" : ""}${Math.abs(t.pnl ?? 0).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-4 max-w-2xl">
            {/* Lock banner when bot is running */}
            {isRunning && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-400/[0.06] border border-amber-400/20">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-[12px] text-amber-400/90">Settings are locked while this bot is running. Stop the bot to make changes.</span>
              </div>
            )}
            {/* Bot Profile (read-only) */}
            {bot && (
              <div className="bg-black border border-border rounded-xl p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-primary">Bot Profile</h3>
                  <p className="text-[12px] text-text-tertiary">Identity and strategy — not editable</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-1">Description</div>
                    <p className="text-[13px] text-text-secondary leading-relaxed">{bot.description || getBotDescription((bot as unknown as { bot_type_id?: string }).bot_type_id, bot.strategy) || "No description available"}</p>
                  </div>
                  {bot.strategy && (
                    <div>
                      <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-1">Strategy</div>
                      <p className="text-[13px] text-text-secondary">{bot.strategy}</p>
                    </div>
                  )}
                  {String((bot as unknown as Record<string, unknown>).llms || "") !== "" && (
                    <div>
                      <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-1">Models</div>
                      <p className="text-[13px] text-text-secondary">{String((bot as unknown as Record<string, unknown>).llms)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode */}
            <div className="bg-black border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[15px] font-semibold text-text-primary">Mode</h3>
                <div className="flex gap-1.5">
                  {(["training", "live"] as const).map((m) => (
                    <button
                      key={m}
                      disabled={isRunning}
                      onClick={() => {
                        if (m === "live" && botMode[selectedId] !== "live") {
                          if (profile?.live_enabled) {
                            setConfirmLiveFor(selectedId);
                          } else {
                            setLiveNotEnabledModal(true);
                          }
                        } else if (m === "training") {
                          setBotMode((prev) => ({ ...prev, [selectedId]: "training" }));
                          agentsApi.updateConfig(selectedId, {}, undefined, "training").catch(() => {});
                        }
                      }}
                      className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        botMode[selectedId] === m
                          ? m === "live"
                            ? "bg-amber-400/15 border-amber-400/40 text-amber-400"
                            : "bg-[#111] border-border text-white"
                          : "border-border text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {botMode[selectedId] === "live" && (
                <p className="text-[13px] text-amber-400/80 mt-2">
                  Live mode — real money will be used via your production API key. Trades are irreversible.
                </p>
              )}
              {botMode[selectedId] !== "live" && (
                <p className="text-[13px] text-text-tertiary mt-2">
                  Training mode helps you learn how the agent performs in the market without risking capital.{" "}
                  <span className="text-gain">Trades won&apos;t actually be placed.</span>
                </p>
              )}
            </div>

            {/* API Key Status */}
            {keyStatuses[selectedId] && (
              <div className="bg-black border border-border rounded-xl p-5">
                <h3 className="text-[15px] font-semibold text-text-primary mb-4">API Key Status</h3>
                <div className="space-y-2">
                  {keyStatuses[selectedId].required_keys.map((k) => (
                    <div key={k.env_key} className="flex items-center justify-between py-1.5">
                      <span className="text-[13px] text-text-secondary">{k.provider}</span>
                      <span className={`flex items-center gap-1.5 text-[13px] font-medium ${k.configured ? "text-gain" : "text-loss"}`}>
                        <span className={`w-2 h-2 rounded-full ${k.configured ? "bg-gain" : "bg-loss"}`} />
                        {k.configured ? "Configured" : "Missing"}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-1.5 border-t border-border mt-2 pt-3">
                    <span className="text-[13px] text-text-secondary">{keyStatuses[selectedId]?.exchange === "polymarket" ? "Polymarket" : "Kalshi"} Credentials</span>
                    {(() => {
                      const isPolymarket = keyStatuses[selectedId]?.exchange === "polymarket";
                      const credOk = isPolymarket ? keyStatuses[selectedId].polymarket_configured : keyStatuses[selectedId].kalshi_configured;
                      return (
                        <span className={`flex items-center gap-1.5 text-[13px] font-medium ${credOk ? "text-gain" : "text-loss"}`}>
                          <span className={`w-2 h-2 rounded-full ${credOk ? "bg-gain" : "bg-loss"}`} />
                          {credOk ? "Configured" : "Missing"}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {!keyStatuses[selectedId].ready_to_deploy && (
                  <p className="text-[13px] text-amber-400/80 mt-3">
                    Add missing keys in Settings before deploying this bot.
                  </p>
                )}
              </div>
            )}

            {/* Trading Rules */}
            {isTailBuyer ? (
              <div className="bg-black border border-border rounded-xl p-5">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-text-primary">Tail Buyer Rules</h3>
                    <p className="text-[12px] text-text-tertiary">Rule-based buying of near-zero contracts</p>
                  </div>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Trade Size" value={tradeSize} min={1} max={20} unit="$" onChange={setTradeSize} disabled={isRunning} />
                  <NumberInputRow label="Max Open Positions" value={maxPositions} min={1} max={500} onChange={setMaxPositions} disabled={isRunning} />
                  <NumberInputRow label="Daily Loss Limit" value={dailyLoss} min={10} max={2000} unit="$" onChange={setDailyLoss} disabled={isRunning} />
                  <NumberInputRow label="Max Trades/Day" value={maxTradesDay} min={1} max={500} onChange={setMaxTradesDay} disabled={isRunning} />
                </div>
                <div className="mb-2">
                  <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Price Filtering</span>
                  <p className="text-[11px] text-text-tertiary mt-1">Target contracts priced between these values.</p>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Min Contract Price" value={minContractPrice} min={0.1} max={5} unit="c" onChange={setMinContractPrice} disabled={isRunning} />
                  <NumberInputRow label="Max Contract Price" value={maxContractPrice} min={0.5} max={10} unit="c" onChange={setMaxContractPrice} disabled={isRunning} />
                </div>
                <div className="mb-2">
                  <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Market Filtering</span>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Min Market Volume" value={minVolume} min={0} max={100000} onChange={setMinVolume} disabled={isRunning} />
                  <NumberInputRow label="Min Expiry (Days)" value={minExpiryDays} min={1} max={30} onChange={setMinExpiryDays} disabled={isRunning} />
                  <NumberInputRow label="Max Expiry (Days)" value={maxExpiryDays} min={1} max={90} onChange={setMaxExpiryDays} disabled={isRunning} />
                  <NumberInputRow label="Max Markets/Cycle" value={maxMarketsPerCycle} min={5} max={200} onChange={setMaxMarketsPerCycle} disabled={isRunning} />
                  <NumberInputRow label="Min Book Depth" value={minOrderBookDepthPct} min={0} max={50} unit="%" onChange={setMinOrderBookDepthPct} disabled={isRunning} />
                  <p className="text-[10px] text-text-tertiary">Minimum order book depth as % of market volume.</p>
                </div>
                {/* Category Filtering */}
                <div className="mb-2 mt-4">
                  <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Category Filtering</span>
                  <p className="text-[11px] text-text-tertiary mt-1">Only buy contracts in these categories. Uncheck all for no filter.</p>
                </div>
                <div className="rounded-xl border border-border bg-white/[0.02] p-4 mb-6">
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
                        <span className="text-[12px] text-text-tertiary">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    disabled={isRunning}
                    onClick={() => saveConfig()}
                    className={`px-4 py-2 rounded-lg bg-[#111] border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-border transition-colors flex items-center gap-1.5 ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Save Rules
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-black border border-border rounded-xl p-5">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-green-400/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-text-primary">Trading Rules</h3>
                    <p className="text-[12px] text-text-tertiary">Hard limits enforced before any trade</p>
                  </div>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Max Trade Size"     value={maxTradeSize}  min={5}  max={500}  unit="$" onChange={setMaxTradeSize} disabled={isRunning} />
                  <NumberInputRow label="Max Open Positions" value={maxPositions}  min={1}  max={50}          onChange={setMaxPositions} disabled={isRunning} />
                  <NumberInputRow label="Daily Loss Limit"   value={dailyLoss}     min={10} max={2000} unit="$" onChange={setDailyLoss} disabled={isRunning} />
                  <NumberInputRow label="Min Confidence"     value={minConf}       min={50} max={100}  unit="%" onChange={setMinConf} disabled={isRunning} />
                  <NumberInputRow label="Max Trades/Day"     value={maxTradesDay}  min={1}  max={100}          onChange={setMaxTradesDay} disabled={isRunning} />
                </div>

                {/* Market Filtering */}
                <div className="mb-2">
                  <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Market Filtering</span>
                  <p className="text-[11px] text-text-tertiary mt-1">Control which markets the bot scans. Volume 0 = automatic tiering by account balance.</p>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Min Market Volume"  value={minVolume}  min={0}  max={5000}          onChange={setMinVolume} disabled={isRunning} />
                  <NumberInputRow label="Max Expiry (Days)"  value={maxExpiryDays}  min={1}  max={90}        onChange={setMaxExpiryDays} disabled={isRunning} />
                  <p className="text-[10px] text-text-tertiary">Only scan markets closing within {maxExpiryDays} day{maxExpiryDays !== 1 ? 's' : ''}.</p>
                </div>

                {/* Position Sizing */}
                <div className="mb-2">
                  <span className="text-[12px] text-text-tertiary uppercase tracking-wider">Position Sizing</span>
                  <p className="text-[11px] text-text-tertiary mt-1">Controls how much the bot risks per trade. Auto-scales for small accounts.</p>
                </div>
                <div className="space-y-4 mb-6">
                  <NumberInputRow label="Kelly Multiplier"   value={Math.round(kellyMultiplier * 100)} min={10} max={100} unit="%" onChange={(v) => setKellyMultiplier(v / 100)} disabled={isRunning} />
                  <NumberInputRow label="Min Position Size"  value={minPositionSize}  min={0.1} max={10} unit="$" onChange={setMinPositionSize} disabled={isRunning} />
                  <NumberInputRow label="Max Position %"     value={maxPositionPct}   min={5}   max={50} unit="%" onChange={setMaxPositionPct} disabled={isRunning} />
                </div>

                {/* Allowed Categories — dropdown */}
                {/* Category filter removed — AI debate handles relevance */}

                {/* Save button */}
                <div className="flex justify-end pt-4 border-t border-border">
                  <button
                    disabled={isRunning}
                    onClick={() => saveConfig()}
                    className={`px-4 py-2 rounded-lg bg-[#111] border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-border transition-colors flex items-center gap-1.5 ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Save Rules
                  </button>
                </div>
              </div>
            )}

            {/* Market Expiry Window, Skip toggles, and Schedule removed — not enforced by backend rules */}

          </div>
        )}

        {/* ── TRADE PIPELINE TAB — Step Slider ────────────────────────────────── */}
        {activeTab === "reasoning" && (() => {
          if (isTailBuyer) {
            return (
              <div>
                <div className="bg-black border border-border rounded-xl p-5 mb-4">
                  <h3 className="text-[15px] font-semibold text-text-primary mb-3">Tail Buyer Pipeline</h3>
                  <p className="text-[12px] text-text-tertiary mb-4">Pure rule-based — no AI models, no debate, no research.</p>
                  <div className="space-y-3">
                    {[
                      { step: "01", title: "Market Scanning", desc: "Fetch active markets from exchange, filter by volume and expiry window" },
                      { step: "02", title: "Tail Price Filter", desc: "Select contracts where YES or NO side is priced within your configured range" },
                      { step: "03", title: "Order Book Depth", desc: "Skip markets with insufficient liquidity on the cheap side" },
                      { step: "04", title: "Rules Engine", desc: "Global safety checks — position limits, daily loss limit, duplicate prevention" },
                      { step: "05", title: "Execution", desc: "Buy the cheap side at fixed trade size through the intercept pipeline" },
                    ].map((s) => (
                      <div key={s.step} className="flex gap-3 items-start">
                        <span className="text-[11px] font-mono text-amber-400/70 bg-amber-400/5 px-1.5 py-0.5 rounded">{s.step}</span>
                        <div>
                          <div className="text-[13px] font-medium text-text-primary">{s.title}</div>
                          <div className="text-[11px] text-text-tertiary">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          const steps = [
            { title: "Overview", subtitle: "How Arbiter Works" },
            { title: "AI Models", subtitle: "6-Model Ensemble" },
            { title: "Bot Settings", subtitle: "Internal Configuration" },
            { title: "Market Ingestion", subtitle: "Phase 01" },
            { title: "News & Sentiment", subtitle: "Phase 02" },
            { title: "5-Model Debate", subtitle: "Phase 03" },
            { title: "Edge Filter & Sizing", subtitle: "Phase 04" },
            { title: "Rules Engine", subtitle: "Safety Net" },
            { title: "Execution & Exit", subtitle: "Final Phase" },
          ];
          const S = (props: { label: string; value: string; desc?: string }) => (
            <div className="py-2.5 px-3 bg-[#0a0a0a] rounded-lg border border-border">
              <div className="text-[12px] text-text-tertiary uppercase tracking-wider">{props.label}</div>
              <div className="text-[13px] font-semibold text-blue-400/90 mt-0.5 font-mono">{props.value}</div>
              {props.desc && <div className="text-[12px] text-text-tertiary/50 mt-0.5">{props.desc}</div>}
            </div>
          );
          const Row = (props: { icon?: string; text: string; value?: string }) => (
            <div className="flex items-center gap-2 py-1.5">
              {props.icon && <span className="text-sm w-5 text-center">{props.icon}</span>}
              <span className="text-[12px] text-text-secondary flex-1">{props.text}</span>
              {props.value && <span className="text-[12px] font-mono text-blue-400/70 shrink-0">{props.value}</span>}
            </div>
          );
          return (
          <div>
            {/* Step indicator */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setPipelineStep(Math.max(0, pipelineStep - 1))} disabled={pipelineStep === 0}
                className={`p-2 rounded-lg transition-colors ${pipelineStep === 0 ? "text-[#1a1a1a] cursor-default" : "text-text-tertiary hover:text-white hover:bg-[#0a0a0a]"}`}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <button key={i} onClick={() => setPipelineStep(i)}
                    className={`flex items-center gap-1 transition-all ${i === pipelineStep ? "" : "opacity-60 hover:opacity-100"}`}>
                    <div className={`w-2 h-2 rounded-full transition-all ${i === pipelineStep ? "bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.5)]" : i < pipelineStep ? "bg-[#444]" : "bg-[#111]"}`} />
                    {i < steps.length - 1 && <div className="w-4 h-px bg-[#0a0a0a]" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setPipelineStep(Math.min(steps.length - 1, pipelineStep + 1))} disabled={pipelineStep === steps.length - 1}
                className={`p-2 rounded-lg transition-colors ${pipelineStep === steps.length - 1 ? "text-[#1a1a1a] cursor-default" : "text-text-tertiary hover:text-white hover:bg-[#0a0a0a]"}`}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Step header */}
            <div className="mb-4">
              <div className="text-[12px] text-text-tertiary uppercase tracking-widest">{steps[pipelineStep].subtitle}</div>
              <h3 className="text-[18px] font-bold text-text-primary">{steps[pipelineStep].title}</h3>
            </div>

            {/* Step content */}
            <div className="bg-black border border-border rounded-xl p-6 min-h-[320px]">

            {/* Step 0: Overview */}
            {pipelineStep === 0 && (
              <div className="space-y-4">
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  Arbiter is an AI-powered prediction market trading system. Every potential trade flows through a multi-stage pipeline — from market discovery to AI debate to risk filtering — before any real money is committed.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    { num: "01-02", label: "Discovery", desc: "Find markets & fetch news" },
                    { num: "03", label: "AI Debate", desc: "5 models argue bull/bear" },
                    { num: "04-05", label: "Filtering", desc: "Edge filter & position sizing" },
                    { num: "06", label: "Rules Engine", desc: "Backend safety checks" },
                    { num: "07", label: "Execution", desc: `Order placed on ${botExchange}` },
                    { num: "08", label: "Exit Strategy", desc: "Stop-loss & take-profit" },
                  ].map(p => (
                    <div key={p.num} className="bg-[#0a0a0a] rounded-lg p-3 border border-border">
                      <div className="text-[12px] font-mono text-text-tertiary">{p.num}</div>
                      <div className="text-[13px] font-semibold text-text-primary mt-1">{p.label}</div>
                      <div className="text-[12px] text-text-tertiary mt-0.5">{p.desc}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-text-tertiary mt-2">
                  Navigate through each step using the arrows above to see the exact settings and thresholds used at each stage.
                </p>
              </div>
            )}

            {/* Step 1: AI Models */}
            {pipelineStep === 1 && (
              <div className="space-y-4">
                <p className="text-[12px] text-text-tertiary mb-3">Six specialized AI models form an adversarial debate council. Each sees prior agents&apos; arguments before making their case.</p>
                <div className="space-y-0">
                  {[
                    { role: "Forecaster", model: "grok-4-1-fast-reasoning", provider: "OpenRouter", job: "Estimates true P(YES) via base rates + calibration" },
                    { role: "News Analyst", model: "claude-sonnet-4.6", provider: "OpenRouter", job: "Scores news sentiment (-1 to +1) and relevance (0-1)" },
                    { role: "Bull Researcher", model: "o4-mini", provider: "OpenRouter", job: "Strongest YES case with evidence and catalysts" },
                    { role: "Bear Researcher", model: "gemini-3-flash-preview", provider: "OpenRouter", job: "Counter-arguments, risk factors, historical precedent" },
                    { role: "Risk Manager", model: "deepseek-v3.2", provider: "OpenRouter", job: "EV calculation, Kelly sizing, risk score, can VETO" },
                    { role: "Trader (Final)", model: "grok-4-1-fast-reasoning", provider: "OpenRouter", job: "Synthesizes all 5 → BUY or SKIP decision" },
                  ].map((m, i) => (
                    <div key={m.role} className={`flex items-center gap-3 py-3 ${i < 5 ? "border-b border-border" : ""}`}>
                      <span className="text-[13px] font-medium text-text-primary w-28 shrink-0">{m.role}</span>
                      <span className="text-[12px] font-mono text-text-tertiary flex-1 truncate">{m.model}</span>
                      <span className="text-[12px] text-text-tertiary/50 w-16 text-right">{m.provider}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                  <S label="Temperature" value="0" desc="Deterministic" />
                  <S label="Max Tokens" value="8,000" desc="Per response" />
                  <S label="Debate Timeout" value="5 min" desc="Total, 90s/step" />
                </div>
              </div>
            )}

            {/* Step 2: Bot Settings */}
            {pipelineStep === 2 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">Internal bot configuration — these values control how the AI makes trading decisions.</p>
                <div className="grid grid-cols-4 gap-3">
                  <S label="Min Confidence" value="50%" desc="To execute trade" />
                  <S label="Min Edge (Default)" value="8%" desc="AI prob vs market" />
                  <S label="High Conf Edge" value="6%" desc="≥80% confidence" />
                  <S label="Low Conf Edge" value="12%" desc="<60% confidence" />
                  <S label="Max Positions" value="3" desc="Concurrent" />
                  <S label="Position Cap" value="30%" desc="Of total capital" />
                  <S label="Kelly Fraction" value="25%" desc="Quarter-Kelly" />
                  <S label="Daily Loss Cap" value="20%" desc="Of total capital" />
                  <S label="Min Position" value="$1" desc="Exchange floor" />
                  <S label="Cash Reserve" value="5%" desc="Min buffer" />
                  <S label="AI Budget / Day" value="$10" desc="All models combined" />
                  <S label="Scan Interval" value="30s" desc="Per cycle" />
                </div>
              </div>
            )}

            {/* Step 3: Market Ingestion */}
            {pipelineStep === 3 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">{`Markets are fetched from the ${botExchange} API and filtered before any AI analysis runs.`}</p>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <S label="Min Volume" value="50" desc="Contracts traded" />
                  <S label="Max Expiry" value="30 days" />
                  <S label="Max Spread" value="20¢" desc="Bid-ask" />
                  <S label="Min Price Move" value="1.5¢" />
                  <S label="Scan Interval" value="30s" />
                  <S label="Skip Decided" value="Yes" desc="Via backend API" />
                </div>
                <div className="border-t border-border pt-4">
                  <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-2">Data Source</div>
                  <Row text={`${botExchange} REST API (paginated)`} value="100/page" />
                  <Row text="Price fields" value="yes_bid_dollars, yes_ask_dollars" />
                  <Row text="Volume field" value="volume_fp (float)" />
                  <Row text="Category inference" value="From event ticker" />
                </div>
              </div>
            )}

            {/* Step 4: News & Sentiment */}
            {pipelineStep === 4 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">Category-aware news feeds provide context for each market before the AI debate begins.</p>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <S label="Articles / Source" value="5 max" />
                  <S label="News Cache" value="30 min" desc="TTL" />
                  <S label="Sentiment Model" value="gemini-3-flash" />
                  <S label="Min Vol for Search" value="1,000" desc="Full news search" />
                  <S label="Dedup" value="Title-based" />
                  <S label="Fallback" value="General feeds" />
                </div>
                <div className="border-t border-border pt-4">
                  <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-2">Category → Feed Mapping</div>
                  <Row text="Sports" value="ESPN, AP Sports" />
                  <Row text="Politics" value="AP Politics, Google News" />
                  <Row text="Crypto" value="CoinDesk, Google News" />
                  <Row text="Economics" value="Google News Business" />
                  <Row text="Other" value="BBC, Google News" />
                </div>
              </div>
            )}

            {/* Step 5: 5-Model Debate */}
            {pipelineStep === 5 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">Each model sees previous agents&apos; arguments before making their case. The trader synthesizes everything into a final decision.</p>
                <div className="space-y-3">
                  {[
                    { step: "Pre-Analysis", agents: "Forecaster + News Analyst", desc: "Run in parallel. Forecaster estimates P(YES) via base rates. News Analyst scores sentiment and relevance.", returns: "probability, confidence, sentiment, key_factors" },
                    { step: "Bull Case", agents: "Bull Researcher (o4-mini)", desc: "Strongest YES case with specific evidence, probability floor, and near-term catalysts.", returns: "probability, probability_floor, key_arguments" },
                    { step: "Bear Case", agents: "Bear Researcher (gemini-3-flash)", desc: "Counters bull directly. Provides probability ceiling, risk factors, historical failures.", returns: "probability, probability_ceiling, risk_factors" },
                    { step: "Risk Assessment", agents: "Risk Manager (deepseek-v3.2)", desc: "Calculates EV precisely: (prob × $1) - cost. Can VETO with should_trade=false.", returns: "risk_score, ev_estimate, should_trade" },
                    { step: "Final Decision", agents: "Trader (grok-4-1-fast)", desc: "Checks consensus (>30pp = SKIP), EV (>10% edge), risk veto, conviction (3/5 agree).", returns: "action, side, limit_price, confidence" },
                  ].map(s => (
                    <div key={s.step} className="bg-[#0a0a0a] rounded-lg p-3 border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-text-primary">{s.step}</span>
                        <span className="text-[12px] text-text-tertiary ml-auto">{s.agents}</span>
                      </div>
                      <p className="text-[12px] text-text-tertiary leading-relaxed">{s.desc}</p>
                      <p className="text-[12px] font-mono text-text-tertiary mt-1">→ {s.returns}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 6: Edge Filter & Sizing */}
            {pipelineStep === 6 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">After the debate, the edge filter checks if the AI&apos;s probability estimate differs enough from the market price to justify a trade.</p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-3">Edge Thresholds</div>
                    <div className="grid grid-cols-2 gap-2">
                      <S label="High Confidence ≥80%" value="6% edge" />
                      <S label="Medium 60-80%" value="8% edge" />
                      <S label="Low Confidence <60%" value="12% edge" />
                      <S label="Min Confidence" value="50%" />
                    </div>
                    <div className="mt-3 text-[12px] text-text-tertiary">
                      Edge = |AI probability - market price|. Uses forecaster&apos;s P(YES), converted to P(NO) for NO-side trades.
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-3">Position Sizing</div>
                    <div className="grid grid-cols-2 gap-2">
                      <S label="Method" value="Kelly" desc="Fractional" />
                      <S label="Kelly Fraction" value="25%" desc="Quarter-Kelly" />
                      <S label="Max Position" value="30%" desc="Of capital" />
                      <S label="Max Concurrent" value="3" />
                      <S label="Min Size" value="$1" desc="Exchange floor" />
                      <S label="Cash Reserve" value="5%" desc="Min buffer" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Rules Engine */}
            {pipelineStep === 7 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">Every order passes through the backend rules engine before execution. These are <span className="text-amber-400/80 font-medium">configurable by you</span> in the Settings tab.</p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[12px] text-text-tertiary uppercase tracking-wider">Tier 1: Bot Rules</div>
                      <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400/80 border border-amber-400/20">Per-bot · Configurable</span>
                    </div>
                    <div className="space-y-1">
                      <Row text="Max trade size" value="$50" />
                      <Row text="Max capital per bot" value="$1,000" />
                      <Row text="Daily loss limit" value="$200" />
                      <Row text="Min confidence" value="65%" />
                      <Row text="Allowed categories" value="All" />
                      <Row text="Blocked tickers" value="None" />
                      <Row text="Max concurrent positions" value="10" />
                      <Row text="Duplicate market prevention" value="✓" />
                      <Row text="Opposing position prevention" value="✓" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[12px] text-text-tertiary uppercase tracking-wider">Tier 2: Global Rules</div>
                      <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400/80 border border-blue-400/20">Account · Configurable</span>
                    </div>
                    <div className="space-y-1">
                      <Row text="Max trades per day" value="50" />
                      <Row text="Global daily loss limit" value="$200" />
                      <Row text="Daily AI API budget" value="$50" />
                      <Row text="Max trades per market" value="Unlimited" />
                      <Row text="Cooldown per ticker" value="Configurable" />
                      <Row text="Trading schedule" value="24/7" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 8: Execution & Exit */}
            {pipelineStep === 8 && (
              <div>
                <p className="text-[12px] text-text-tertiary mb-4">{`Orders that pass all checks are sent to ${botExchange}. Open positions are monitored with automatic exit strategies.`}</p>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-3">Trade Execution</div>
                    <Row text="Training mode" value="Simulated (paper)" />
                    <Row text="Live mode" value={`Real order on ${botExchange}`} />
                    <Row text="Auth method" value="RSA-PSS signed" />
                    <Row text="Position tracking" value="Every 15s" />
                    <Row text="Settlement polling" value="Every cycle" />
                    <Row text="WebSocket updates" value="Real-time to UI" />
                  </div>
                  <div>
                    <div className="text-[12px] text-text-tertiary uppercase tracking-wider mb-3">Exit Strategy</div>
                    <div className="grid grid-cols-2 gap-2">
                      <S label="Take Profit" value="20%" desc="Gain threshold" />
                      <S label="Stop Loss" value="15%" desc="Loss threshold" />
                      <S label="Confidence Decay" value="25%" desc="Drop triggers exit" />
                      <S label="Max Hold" value="10 days" desc="240 hours" />
                      <S label="Volatility Adjust" value="Enabled" />
                      <S label="Auto Sell Limits" value="On open positions" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            </div>

            {/* Step counter */}
            <div className="text-center mt-3">
              <span className="text-[12px] text-text-tertiary">{pipelineStep + 1} / {steps.length}</span>
            </div>

          </div>);
        })()
        }
      </div>

      {/* Old pipeline content removed — step slider above replaces it */}
      {/* ── Live mode confirmation modal ─────────────────────────────────── */}
      {/* ── Stop/Kill confirmation modal ── */}
      {confirmAction && (() => {
        const isKill = confirmAction.action === "kill";
        const botName = botNames[confirmAction.botId] ?? agents.find(a => a.id === confirmAction.botId)?.name ?? confirmAction.botId;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className={`bg-[#111] border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl ${
              isKill ? "border-loss/20" : "border-warning/20"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {isKill
                  ? <Radiation className="w-5 h-5 text-loss" />
                  : <Square className="w-5 h-5 text-warning" />}
                <h3 className="text-[15px] font-semibold text-text-primary">
                  {isKill ? "Nuke Agent?" : "Stop Agent?"}
                </h3>
              </div>
              <p className="text-[13px] text-text-secondary mb-1">
                {isKill
                  ? <>Nuke <span className="text-text-primary font-medium">{botName}</span>? This will force-stop all agents and <strong className="text-loss">delete all API keys</strong>.</>
                  : <>Stop <span className="text-text-primary font-medium">{botName}</span>? Pending orders will be cancelled and the agent process will end.</>}
              </p>
              <p className={`text-[13px] mb-6 ${isKill ? "text-loss/70" : "text-text-tertiary"}`}>
                {isKill
                  ? "Emergency use only. You will need to re-enter credentials to deploy again."
                  : "Redeploy from this page to restart the agent."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => isKill ? executeKill(confirmAction.botId) : executeStop(confirmAction.botId)}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                    isKill
                      ? "bg-loss/15 border border-loss/30 text-loss hover:bg-loss/20"
                      : "bg-warning/15 border border-warning/30 text-warning hover:bg-warning/20"
                  }`}
                >
                  {isKill ? <><Radiation className="w-3.5 h-3.5" /> Nuke</> : "Stop"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmLiveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-400 text-lg">!</span>
              <h3 className="text-[15px] font-semibold text-text-primary">Enable Live Trading?</h3>
            </div>
            <p className="text-[13px] text-text-secondary mb-1">
              You are enabling real money trading for <span className="text-text-primary font-medium">{botNames[confirmLiveFor] ?? agents.find(a => a.id === confirmLiveFor)?.name ?? confirmLiveFor}</span>.
            </p>
            <p className="text-[13px] text-text-tertiary mb-6">
              Real trades will be placed using your production API key. This cannot be undone per trade.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLiveFor(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setBotMode((prev) => ({ ...prev, [confirmLiveFor]: "live" }));
                  agentsApi.updateConfig(confirmLiveFor, {}, undefined, "live").catch(() => {});
                  setConfirmLiveFor(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-400/15 border border-amber-400/40 text-[13px] font-semibold text-amber-400 hover:bg-amber-400/20 transition-colors"
              >
                Enable Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Not Enabled Modal ── */}
      {liveNotEnabledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-[15px] font-semibold text-text-primary">Live Trading Not Enabled</h3>
            </div>
            <p className="text-[13px] text-text-secondary mb-1">
              Your account is not enabled for live trading.
            </p>
            <p className="text-[13px] text-text-tertiary mb-6">
              Use <span className="text-white font-medium">Training mode</span> to see how the agent
              would perform in the market without risking any actual capital.
            </p>
            <button
              onClick={() => setLiveNotEnabledModal(false)}
              className="w-full py-2.5 rounded-lg border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Deploy Modal ── */}
      {deployModal && (() => {
        const deployBot = agents.find(a => a.id === deployModal);
        const deployBotName = botNames[deployModal] ?? deployBot?.name ?? "Bot";
        const deployBotTypeId = (deployBot as Record<string, unknown> | undefined)?.bot_type_id as string | undefined;
        const isPolymarketBot = deployBotTypeId?.startsWith("polymarket") ?? false;
        const isTailBuyerDeploy = deployBotTypeId?.includes("tail-buyer") ?? false;
        const deployModeLabel = botMode[deployModal] === "live" ? "Live" : "Training";
        const freqMin = deployFrequency / 60;
        const cyclesPerHour = 60 / freqMin;

        // Per-model cost breakdown (per market, ~2K input + ~1.5K output tokens each)
        // Prices per 1M tokens as of March 2026 (from OpenRouter, matching bot's MODEL_PRICING)
        const MODEL_COSTS = [
          { role: "Forecaster", model: "Grok 4.1 Fast", inRate: 0.20, outRate: 0.50 },
          { role: "News Analyst", model: "Claude Sonnet 4.6", inRate: 3.00, outRate: 15.00 },
          { role: "Bull Researcher", model: "o4-mini", inRate: 1.10, outRate: 4.40 },
          { role: "Bear Researcher", model: "Gemini 3 Flash", inRate: 0.50, outRate: 3.00 },
          { role: "Risk Manager", model: "DeepSeek V3.2", inRate: 0.26, outRate: 0.38 },
          { role: "Trader", model: "Grok 4.1 Fast", inRate: 0.20, outRate: 0.50 },
          { role: "News Search", model: "Perplexity Sonar", inRate: 3.00, outRate: 15.00 },
        ].map((m) => {
          const costPerCall = (2000 * (m.inRate / 1_000_000) + 1500 * (m.outRate / 1_000_000)) * 1.055;
          return { ...m, costPerCall };
        });

        const rawCostPerMarket = MODEL_COSTS.reduce((sum, m) => sum + m.costPerCall, 0);
        const COST_PER_MARKET = rawCostPerMarket * 1.2; // 20% safety buffer

        const marketsPerCycle = 10;
        // After first ~5 cycles, decided-markets cache kicks in — new markets drop to ~3/cycle average
        const durationMin = deployDuration || 60;
        const totalCycles = durationMin / freqMin;
        const freshCycles = Math.min(totalCycles, 5); // First 5 cycles analyze 10 fresh markets each
        const cachedCycles = Math.max(0, totalCycles - freshCycles);
        const avgMarketsAfterCache = 3; // ~3 new markets per cycle after cache warms up
        const totalMarkets = freshCycles * marketsPerCycle + cachedCycles * avgMarketsAfterCache;
        const costPerCycle = COST_PER_MARKET * marketsPerCycle;
        const costPerHour = costPerCycle * cyclesPerHour;
        const tokensPerCycle = marketsPerCycle * MODEL_COSTS.length * 3500;
        const tokensPerHour = Math.round(cyclesPerHour * tokensPerCycle);
        const durationLabel = deployDuration === 0 ? "∞" : deployDuration >= 60 ? `${deployDuration / 60}h` : `${deployDuration}m`;
        const totalCostEst = deployDuration === 0 ? null : totalMarkets * COST_PER_MARKET;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setDeployModal(null)}>
            <div className="bg-[#0c0c0c] border border-border rounded-xl p-7 max-w-lg w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <BotAvatar agentId={deployModal} botTypeId={deployBotTypeId} size={40} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[18px] font-display font-semibold text-text-primary truncate">Deploy {deployBotName}</h3>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                  deployModeLabel === "Live" ? "bg-amber-400/10 border border-amber-400/20 text-amber-400" : "bg-[#111] border border-border text-text-tertiary"
                }`}>{deployModeLabel}</span>
              </div>

              {/* Duration */}
              <div className="mb-5">
                <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Run for</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "30 min", value: 30 },
                    { label: "1 hour", value: 60 },
                    { label: "4 hours", value: 240 },
                    { label: "8 hours", value: 480 },
                    { label: "24 hours", value: 1440 },
                    { label: "Until stopped", value: 0 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDeployDuration(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                        deployDuration === opt.value
                          ? "bg-white text-black"
                          : "bg-[#111] border border-border text-text-tertiary hover:text-text-secondary hover:border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frequency */}
              <div className="mb-5">
                <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Trading frequency</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    ...(isPolymarketBot ? [{ label: "2 min", value: 120 }] : []),
                    { label: "5 min", value: 300 },
                    { label: "10 min", value: 600 },
                    { label: "15 min", value: 900 },
                    { label: "30 min", value: 1800 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDeployFrequency(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                        deployFrequency === opt.value
                          ? "bg-white text-black"
                          : "bg-[#111] border border-border text-text-tertiary hover:text-text-secondary hover:border-border"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border my-5" />

              {/* Cost Estimate — expandable */}
              {isTailBuyerDeploy ? (
                <div className="mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Estimated AI Cost</span>
                    <span className="text-[14px] font-semibold text-green-400 tabular-nums">$0.00</span>
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-1">Rule-based bot — no AI model calls, no API costs.</p>
                </div>
              ) : (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                    className="w-full flex items-center justify-between group"
                  >
                    <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Estimated Cost</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] font-semibold text-white tabular-nums">
                        {totalCostEst !== null ? `$${totalCostEst.toFixed(2)}` : `$${costPerHour.toFixed(2)}/hr`}
                      </span>
                      <svg className={`w-4 h-4 text-text-tertiary transition-transform ${showCostBreakdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {showCostBreakdown && (
                    <div className="mt-3 bg-[#080808] border border-border rounded-lg overflow-hidden">
                      {/* Summary row */}
                      <div className="px-4 py-3 border-b border-border">
                        <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                          <span className="text-text-tertiary">Cycles/hour</span>
                          <span className="text-text-primary text-right tabular-nums">{cyclesPerHour.toFixed(0)}</span>
                          <span className="text-text-tertiary">Markets/cycle</span>
                          <span className="text-text-primary text-right tabular-nums">{marketsPerCycle}</span>
                          <span className="text-text-tertiary">Tokens/hour</span>
                          <span className="text-text-primary text-right tabular-nums">~{(tokensPerHour / 1_000_000).toFixed(1)}M</span>
                          <span className="text-text-tertiary">Cost/hour</span>
                          <span className="text-text-primary text-right tabular-nums font-medium">${costPerHour.toFixed(2)}</span>
                          {totalCostEst !== null && (
                            <>
                              <span className="text-text-secondary font-medium">Total ({durationLabel})</span>
                              <span className="text-white text-right tabular-nums font-semibold">${totalCostEst.toFixed(2)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Per-model breakdown */}
                      <div className="px-4 py-3">
                        <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-2">Per-market model costs</p>
                        <div className="space-y-1.5">
                          {MODEL_COSTS.map((m) => (
                            <div key={m.role} className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-text-tertiary truncate">{m.role}</span>
                                <span className="text-[10px] text-[#333] truncate">{m.model}</span>
                              </div>
                              <span className="text-text-secondary tabular-nums shrink-0 ml-2">${m.costPerCall.toFixed(4)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border">
                            <span className="text-text-secondary font-medium">Subtotal/market</span>
                            <span className="text-text-primary tabular-nums font-medium">${rawCostPerMarket.toFixed(4)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-text-tertiary">+ 20% buffer</span>
                            <span className="text-text-secondary tabular-nums">${COST_PER_MARKET.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeployModal(null)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-[#444] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeploy}
                  className="flex-1 py-2.5 rounded-lg bg-gain text-black text-[13px] font-semibold hover:bg-gain/90 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  Deploy
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
