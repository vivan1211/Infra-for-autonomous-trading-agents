"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Check, ChevronDown, ScrollText } from "lucide-react";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { ActionBar } from "@/components/terminal/ActionBar";
import { SignalRaceTrack } from "@/components/signals/SignalRaceTrack";
import { SignalCardsView } from "@/components/signals/SignalCardsView";
import { PageHelpButton } from "@/components/PageHelpModal";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAgents } from "@/hooks/use-agents";
import { useToast } from "@/components/toast";

/* ── Local FilterDropdown ── */
function FilterDropdown({ value, onChange, options, className = "" }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button onClick={() => setOpen(!open)} className="h-10 md:h-8 flex items-center gap-2 bg-black border border-border rounded-lg text-[13px] text-[#ffffff] px-3 pr-7 hover:border-[#555] transition-colors whitespace-nowrap">
        {selected?.label || value}
        <ChevronDown className={`w-3 h-3 text-[#919fa6] absolute right-2 top-1/2 -translate-y-1/2 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-black border border-border rounded-lg overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)] min-w-full w-max max-h-[280px] overflow-y-auto">
          {options.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                value === opt.value ? "text-[#ffffff] bg-white/[0.06]" : "text-[#919fa6] hover:text-[#919fa6] hover:bg-white/[0.03]"
              }`}>
              <span className="w-4 shrink-0">{value === opt.value && <Check className="w-3.5 h-3.5 text-[#ffffff]" />}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Terminal Page ── */
export default function TerminalPage() {
  const { agents, refresh: refreshAgents } = useAgents();
  const { messages } = useWebSocket();
  const { toast: addToast } = useToast();

  const [leftBotFilter, setLeftBotFilter] = useState("all");
  const [rightBotFilter, setRightBotFilter] = useState("all");
  const [signalView, setSignalView] = useState<"cards" | "track">("cards");

  const anyBotRunning = agents.some((a) => a.status === "running");

  // Bot list for filter dropdowns
  const bots = agents.map((a) => ({
    id: a.id,
    name: a.name,
  }));
  // Filter options for dropdowns
  const botFilterOptions = [
    { value: "all", label: "All Agents" },
    ...bots.map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] md:text-[28px] font-bold text-text-primary tracking-tight">Terminal</h1>
            <PageHelpButton pageKey="terminal" />
          </div>
        </div>
        <p className="text-[13px] text-text-tertiary mt-1">Live execution &amp; signal feed</p>
      </div>

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border border-border rounded-lg bg-[#0a0a0a] mb-4">
        <div className="flex items-center gap-2">
          {anyBotRunning && <span className="w-2 h-2 rounded-full bg-gain animate-pulse" />}
          <span className="text-[13px] text-text-secondary">
            {anyBotRunning
              ? `${agents.filter(a => a.status === "running").length} agent${agents.filter(a => a.status === "running").length !== 1 ? "s" : ""} running`
              : "No agents running"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ActionBar
            anyBotRunning={anyBotRunning}
            refreshAgents={refreshAgents}
            addToast={addToast}
          />
          <Link
            href="/logs"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-text-tertiary hover:text-text-primary hover:border-border transition-colors"
          >
            <ScrollText className="w-3 h-3" />
            Audit Logs
          </Link>
        </div>
      </div>

      {/* ── Two-panel layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Terminal */}
        <div data-tour="terminal-logs" className="border border-border rounded-lg bg-black flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-text-primary">Terminal</span>
            <FilterDropdown
              value={leftBotFilter}
              onChange={setLeftBotFilter}
              options={botFilterOptions}
            />
          </div>
          <div className="min-h-[300px] md:min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto">
            <TerminalPanel
              messages={messages}
              botFilter={leftBotFilter}
              anyBotRunning={anyBotRunning}
            />
          </div>
        </div>

        {/* RIGHT: Signals */}
        <div data-tour="signal-pipeline" className="border border-border rounded-lg bg-black flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold text-text-primary">Signals</span>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown
                value={rightBotFilter}
                onChange={setRightBotFilter}
                options={botFilterOptions}
              />
              {/* View toggle */}
              <div className="flex items-center bg-black border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setSignalView("cards")}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    signalView === "cards"
                      ? "text-text-primary bg-white/[0.06]"
                      : "text-[#919fa6] hover:text-[#919fa6]"
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setSignalView("track")}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    signalView === "track"
                      ? "text-text-primary bg-white/[0.06]"
                      : "text-[#919fa6] hover:text-[#919fa6]"
                  }`}
                >
                  Track
                </button>
              </div>
            </div>
          </div>
          <div className="min-h-[300px] md:min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto">
            {signalView === "cards" ? (
              <SignalCardsView agentId={rightBotFilter !== "all" ? rightBotFilter : undefined} />
            ) : (
              <SignalRaceTrack agentId={rightBotFilter !== "all" ? rightBotFilter : undefined} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
