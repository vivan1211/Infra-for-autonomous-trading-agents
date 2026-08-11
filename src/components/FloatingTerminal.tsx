"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Terminal, X, Maximize2 } from "lucide-react";
import { useWebSocket } from "@/hooks/use-websocket";

type LogLevel = "info" | "trade" | "warn" | "error";

const levelColor: Record<LogLevel, string> = {
  info: "text-white/50",
  trade: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const levelDot: Record<LogLevel, string> = {
  info: "bg-white/30",
  trade: "bg-emerald-400",
  warn: "bg-amber-400",
  error: "bg-red-400",
};

export function FloatingTerminal() {
  const router = useRouter();
  const [state, setState] = useState<"open" | "minimized" | "closed">("closed");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen to ALL log + trade messages (no agent filter — shows all running bots)
  const { messages } = useWebSocket({ types: ["log", "trade"] });

  // Auto-open when first log message arrives (means a bot is running)
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevCountRef.current && state === "closed") {
      setState("open");
    }
    prevCountRef.current = messages.length;
  }, [messages.length, state]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && state === "open") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, state]);

  // Filter out technical noise, show last 50 meaningful messages
  const recentLogs = messages
    .filter((m) => {
      const text = String(m.message || "").trim();
      if (!text || text.length < 3) return false;
      // Always show errors and failures
      const level = (m.level as string) || "";
      if (level === "error") return true;
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
      if (/Trading cycle completed|Bot cycle completed|Bot cycle started|Starting Superforecaster.*trading|Starting Council.*trading/.test(text)) return false;
      return true;
    })
    .slice(-50)
    .map((m, i) => ({
      id: i,
      level: ((m.level as string) || "info") as LogLevel,
      message: (m.message as string) || "",
      agent_id: (m.agent_id as string) || "",
      timestamp: (m.timestamp as string) || new Date().toISOString(),
    }));

  // Don't render if no messages and terminal is closed
  if (messages.length === 0 && state === "closed") return null;

  // Minimized tab
  if (state === "minimized") {
    return (
      <button
        onClick={() => setState("open")}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-black border border-emerald-400/30 shadow-xl hover:border-emerald-400/60 transition-all group"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <Terminal className="w-3.5 h-3.5 text-emerald-400/60 group-hover:text-emerald-400" />
        <span className="text-[11px] text-emerald-400/60 group-hover:text-emerald-400 font-mono">
          Agent Running
        </span>
      </button>
    );
  }

  // Closed — show nothing (unless auto-opened above)
  if (state === "closed") return null;

  // Open — floating terminal
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl bg-[#0a0a0a] border border-border shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#111] border-b border-border">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-[12px] font-mono text-white/70">Live Terminal</span>
          <span className="text-[10px] text-white/30 font-mono">{recentLogs.length} logs</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push("/trades")}
            title="Expand to Trades page"
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white/40 hover:text-white/80" />
          </button>
          <button
            onClick={() => setState("minimized")}
            title="Close"
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/40 hover:text-white/80" />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="h-[240px] overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10"
      >
        {recentLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20 text-[11px] font-mono">
            Waiting for bot output...
          </div>
        ) : (
          recentLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-1.5 py-0.5">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${levelDot[log.level]}`} />
              <span className={`text-[11px] font-mono leading-relaxed break-all ${levelColor[log.level]}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
