"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Square } from "lucide-react";
import { BotAvatar } from "@/components/BotAvatar";
import { useAgents } from "@/hooks/use-agents";
import { agents as agentsApi, BotType } from "@/lib/api";
import { getBotDescription, getBotShortDescription } from "@/lib/bot-descriptions";
import { useWalkthrough } from "@/context/walkthrough";
import { DEMO_BOT_TYPES } from "@/lib/demo-data";

/* ────────────────────────────────────────────────────────────── */
/*  Strategy type (derived from API BotType)                       */
/* ────────────────────────────────────────────────────────────── */
interface Strategy {
  botTypeId: string;
  name: string;
  fullName: string;
  description: string;
  market: string;
  llms: string[];
  accent: string;
  bgTint: string;
}

function botTypeToStrategy(bt: BotType): Strategy {
  return {
    botTypeId: bt.id,
    name: bt.name,
    fullName: bt.full_name || bt.name,
    description: bt.description || getBotShortDescription(bt.id) || getBotDescription(bt.id) || "",
    market: bt.exchange === "kalshi" ? "Kalshi" : "Polymarket",
    llms: bt.llms ? bt.llms.split(", ") : ["Grok", "Claude", "GPT", "Gemini", "DeepSeek"],
    accent: bt.accent_color || "#4ade80",
    bgTint: bt.bg_tint || "#7de964",
  };
}

/* ────────────────────────────────────────────────────────────── */
/*  Dropdown Filter (box style, like trades page)                  */
/* ────────────────────────────────────────────────────────────── */

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = value !== "all";
  const activeLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/[0.15] bg-white/[0.04] text-[13px] font-medium text-white/70 hover:bg-white/[0.08] hover:border-white/[0.25] transition-colors"
      >
        <span className="text-white/40">{label}:</span>
        <span className="text-white">{isActive ? activeLabel : "All"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 min-w-[200px] bg-[#141414] border border-white/[0.15] rounded-xl overflow-hidden shadow-2xl z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-[13px] transition-colors ${
                value === opt.value
                  ? "bg-white/[0.08] text-white font-semibold"
                  : "text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              {opt.label}
              {value === opt.value && (
                <div className="w-[18px] h-[18px] rounded-full border-2 border-white bg-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-black" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Main Page                                                      */
/* ────────────────────────────────────────────────────────────── */

export default function StrategiesPage() {
  const { agents } = useAgents();
  const { demoMode } = useWalkthrough();

  /* ── Fetch bot types from API ── */
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  useEffect(() => {
    if (demoMode) {
      setStrategies(DEMO_BOT_TYPES.map(botTypeToStrategy));
      return;
    }
    agentsApi.types().then((types) => setStrategies(types.map(botTypeToStrategy))).catch(() => {});
  }, [demoMode]);

  /* ── Filter state ── */
  const [statusFilter, setStatusFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");

  /* ── Map agent data to strategies ── */
  const strategiesWithStatus = strategies.map((s) => {
    const agent = agents.find((a) => a.bot_type_id === s.botTypeId);
    const isRunning = agent?.status === "running";
    const wasUsed = !!agent;
    const isComingSoon = "comingSoon" in s && s.comingSoon;
    const status: "active" | "used" | "available" | "unavailable" = isComingSoon
      ? "unavailable"
      : isRunning
        ? "active"
        : wasUsed
          ? "used"
          : "available";
    return { ...s, agent, status, isRunning };
  });

  /* ── Apply filters ── */
  const filtered = strategiesWithStatus.filter((s) => {
    if (statusFilter === "active" && s.status !== "active") return false;
    if (statusFilter === "used" && s.status !== "used") return false;
    if (statusFilter === "available" && s.status !== "available") return false;
    if (marketFilter !== "all" && s.market.toLowerCase() !== marketFilter) return false;
    return true;
  });

  /* ── Counts for filter labels ── */
  const activeCount = strategiesWithStatus.filter((s) => s.status === "active").length;
  const usedCount = strategiesWithStatus.filter((s) => s.status === "used").length;
  const availableCount = strategiesWithStatus.filter((s) => s.status === "available").length;

  return (
    <div className="relative animate-fade-in h-[calc(100vh-56px)] -mt-14 md:-mt-16 -mb-20 md:-mb-8 flex flex-col overflow-hidden">
      {/* ── Bordered container (Robinhood style) ── */}
      <div className="flex-1 flex flex-col border border-white/[0.15] rounded-xl mx-4 md:mx-6 my-4 overflow-hidden">
        {/* Header row: title left, filters right */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-white/[0.10]">
          <div>
            <h1 className="text-[22px] md:text-[28px] font-bold text-white tracking-tight">Choose your strategy</h1>
            <p className="text-[13px] text-white/40 mt-1">
              {filtered.length} strateg{filtered.length !== 1 ? "ies" : "y"} available
            </p>
          </div>

          {/* Filter dropdowns — right side */}
          <div className="flex items-center gap-2.5" data-tour="strategy-filters">
            <FilterDropdown
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All Strategies" },
                { value: "active", label: `Active (${activeCount})` },
                { value: "used", label: `Previously Used (${usedCount})` },
                { value: "available", label: `Available (${availableCount})` },
              ]}
            />
            <FilterDropdown
              label="Market"
              value={marketFilter}
              onChange={setMarketFilter}
              options={[
                { value: "all", label: "All Markets" },
                { value: "kalshi", label: "Kalshi" },
                { value: "polymarket", label: "Polymarket" },
              ]}
            />
          </div>
        </div>

        {/* ── Strategy Cards grid — scrollable ── */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" data-tour="strategy-cards">
            {(() => { let firstRunningFound = false; return filtered.map((strategy) => {
              const isFirstRunning = strategy.isRunning && !firstRunningFound;
              if (isFirstRunning) firstRunningFound = true;
              const navigateTo = strategy.agent
                ? `/strategy/${strategy.agent.id}`
                : `/strategy/${strategy.botTypeId}`;
              const isComingSoon = "comingSoon" in strategy && strategy.comingSoon;

              const cardClass = `group block border border-white/[0.15] rounded-xl overflow-hidden transition-all duration-200 no-underline ${
                isComingSoon
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:border-white/30 hover:translate-y-[-2px]"
              }`;

              const statusBadge = isComingSoon ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/50">
                  Coming Soon
                </span>
              ) : strategy.isRunning ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-loss/20 text-loss">
                  Deployed
                </span>
              ) : strategy.status === "used" ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/[0.08] text-white/40">
                  Previously used
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(0,200,7,0.15)", color: "#00c807" }}>
                  Available
                </span>
              );

              const cardContent = (
                <>
                  {/* Avatar area — tinted background */}
                  <div
                    className="relative flex items-center justify-center py-12"
                    style={{ background: strategy.bgTint }}
                  >
                    <BotAvatar
                      agentId={strategy.agent?.id || strategy.botTypeId}
                      botTypeId={strategy.botTypeId}
                      size={160}
                    />
                    {strategy.isRunning && (
                      <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-gain animate-pulse" />
                    )}
                  </div>

                  {/* Info area — transparent bg */}
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      {statusBadge}
                    </div>
                    <h3 className="text-[16px] font-bold text-white mb-1">{strategy.name}</h3>
                    <p className="text-[12px] text-white/50 leading-relaxed line-clamp-2">{strategy.description}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[11px] text-white/40 uppercase tracking-wider">{strategy.market}</span>
                      {strategy.isRunning && (
                        <>
                          <span className="text-[11px] font-medium text-gain">Running</span>
                          <button
                            {...(isFirstRunning ? { "data-tour": "strategy-stop-btn" } : {})}
                            onClick={async (e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (strategy.agent) {
                                await agentsApi.pause(strategy.agent.id);
                                window.location.reload();
                              }
                            }}
                            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-white/20 text-[10px] text-white/60 hover:text-white hover:border-white/40 transition-colors"
                          >
                            <Square className="w-2.5 h-2.5" /> Stop
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              );

              return isComingSoon ? (
                <div key={strategy.botTypeId} className={cardClass}>{cardContent}</div>
              ) : (
                <Link key={strategy.botTypeId} href={navigateTo} prefetch className={cardClass}>{cardContent}</Link>
              );
            }); })()}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20 text-white/30 text-[14px]">
              No strategies match your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
