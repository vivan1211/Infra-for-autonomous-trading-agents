"use client";

import { useRef, useState, useEffect } from "react";
import type { WebSocketMessage } from "@/lib/websocket";

/* Log row highlight — copied exactly from trades page */
export function getLogHighlight(text: string, level: string) {
  // Rules
  if (/rules_result|BLOCKED|REJECTED|SKIPPING|Checking rules|RULES PASSED|ACCOUNT CHECK/i.test(text)) {
    if (/BLOCKED|REJECTED/i.test(text)) return { bg: "bg-[#f87171]/8 border-[#f87171]/20", typeLabel: "REJECT", typeColor: "text-[#f87171]", msgColor: "text-[#f1948a]" };
    if (/RULES PASSED|ACCOUNT CHECK PASSED/i.test(text)) return { bg: "bg-[#4ade80]/8 border-[#4ade80]/20", typeLabel: "RULES ✓", typeColor: "text-[#4ade80]", msgColor: "text-[#7dcea0]" };
    return { bg: "bg-[#fbbf24]/5 border-[#fbbf24]/15", typeLabel: "RULE", typeColor: "text-[#fbbf24]", msgColor: "text-[#d4a053]" };
  }
  if (level === "trade" || /Executed position|PAPER TRADE|place_order|live_mode=|Trading mode check/i.test(text)) {
    return { bg: "bg-[#4ade80]/8 border-[#4ade80]/20", typeLabel: "TRADE", typeColor: "text-[#4ade80]", msgColor: "text-[#7dcea0]" };
  }
  if (level === "error" || /Failed|❌|Error executing/i.test(text)) {
    return { bg: "bg-[#f87171]/8 border-[#f87171]/20", typeLabel: "ERROR", typeColor: "text-[#f87171]", msgColor: "text-[#f1948a]" };
  }
  if (/EDGE APPROVED/i.test(text)) return { bg: "bg-[#4ade80]/5 border-[#4ade80]/15", typeLabel: "EDGE ✓", typeColor: "text-[#4ade80]", msgColor: "text-[#88c0a0]" };
  if (/EDGE REJECTED/i.test(text)) return { bg: "bg-[#fbbf24]/5 border-[#fbbf24]/15", typeLabel: "EDGE ✗", typeColor: "text-[#fbbf24]", msgColor: "text-[#d4a053]" };
  if (/POSITION LIMITS OK|POSITION LIMITS STATUS.*healthy/i.test(text)) return { bg: "bg-[#4ade80]/5 border-[#4ade80]/15", typeLabel: "POS ✓", typeColor: "text-[#4ade80]", msgColor: "text-[#88c0a0]" };
  if (/POSITION COUNT LIMIT|POSITION SIZE LIMIT|Position limits enforcement/i.test(text)) return { bg: "bg-[#fbbf24]/5 border-[#fbbf24]/15", typeLabel: "POS ✗", typeColor: "text-[#fbbf24]", msgColor: "text-[#d4a053]" };
  if (/CASH RESERVES OK|CASH RESERVES APPROVED/i.test(text)) return { bg: "bg-[#4ade80]/5 border-[#4ade80]/15", typeLabel: "CASH ✓", typeColor: "text-[#4ade80]", msgColor: "text-[#88c0a0]" };
  if (/CASH RESERVES BLOCK|CASH RESERVES INSUFFICIENT|CASH EMERGENCY/i.test(text)) return { bg: "bg-[#f87171]/8 border-[#f87171]/20", typeLabel: "CASH ✗", typeColor: "text-[#f87171]", msgColor: "text-[#f1948a]" };
  if (/eligible markets|Fetched.*markets|upserted|markets to process/i.test(text)) return { bg: "", typeLabel: "SCAN", typeColor: "text-[#60a5fa]", msgColor: "text-[#7aa2d4]" };
  if (/Optimi|allocat|portfolio|Sharpe|capital used|Kelly/i.test(text)) return { bg: "", typeLabel: "ALLOC", typeColor: "text-[#c084fc]", msgColor: "text-[#b09ada]" };
  if (/analyzing|analysis|Grok|AI|ensemble|model|predicted_prob/i.test(text)) return { bg: "", typeLabel: "AI", typeColor: "text-[#fb923c]", msgColor: "text-[#d4a06a]" };
  if (/risk|rebalanc|Sharpe ratio|drawdown|volatil/i.test(text)) return { bg: "", typeLabel: "RISK", typeColor: "text-[#f472b6]", msgColor: "text-[#d48aaa]" };
  if (/✅/i.test(text)) return { bg: "bg-[#4ade80]/5 border-[#4ade80]/15", typeLabel: "PASS", typeColor: "text-[#4ade80]", msgColor: "text-[#88c0a0]" };
  return { bg: "", typeLabel: "LOG", typeColor: "text-[#666]", msgColor: "text-[#999]" };
}

interface TerminalPanelProps {
  messages: WebSocketMessage[];
  botFilter?: string;
  anyBotRunning: boolean;
}

export function TerminalPanel({ messages, botFilter, anyBotRunning }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalPaused, setTerminalPaused] = useState(false);

  // Filter messages by bot if set
  const botFiltered = botFilter && botFilter !== "all"
    ? messages.filter((m) => m.agent_id === botFilter)
    : messages;

  // Filter out technical noise — only show user-meaningful messages
  const filteredMessages = botFiltered.filter((m) => {
    const text = String(m.message || "").trim();
    if (!text || text.length < 3) return false;

    // Always show errors, warnings, and failures — never filter these
    const level = (m.level as string) || "";
    if (level === "error") return true;
    if (/Failed|Error|❌|error|failed|timed? ?out|429|500|502|503/i.test(text)) return true;

    // Hide HTTP/network noise only — keep all trading logic visible
    if (text.startsWith("HTTP Request:")) return false;
    if (text.startsWith("http") && /HTTP\/\d/.test(text)) return false;
    if (/^x\d+$/.test(text)) return false;
    if (text.includes("CLOB client initialized")) return false;
    if (text.includes("PolymarketClient initialized")) return false;
    if (text.includes("PolymarketClient closed")) return false;
    if (text.includes("Reused cached CLOB")) return false;
    if (text.includes("get_balance:")) return false;
    if (text.includes("Returning balance=")) return false;
    if (/Fetched .+ from backend \(\d+ chars\)/.test(text)) return false;
    if (text.includes("Subprocess mode")) return false;
    if (text.includes("derive-api-key")) return false;
    if (text.includes("balance-allowance")) return false;
    if (/\/api\/bot\/credentials/.test(text)) return false;
    if (text.includes("gamma-api.polymarket.com")) return false;
    if (text.includes("openrouter.ai/api")) return false;
    if (text.includes("data-api.polymarket.com")) return false;
    if (text.includes("clob.polymarket.com")) return false;
    if (text.includes("commandos-production")) return false;

    return true;
  });

  // Auto-scroll
  useEffect(() => {
    if (!terminalPaused && terminalRef.current) {
      terminalRef.current.scrollTop = 0;
    }
  }, [filteredMessages.length, terminalPaused]);

  const handleScroll = () => {
    if (terminalRef.current) {
      setTerminalPaused(terminalRef.current.scrollTop > 10);
    }
  };

  return (
    <div ref={terminalRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 bg-black space-y-1.5">
      {filteredMessages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center py-12">
            <div className="text-[24px] mb-2 opacity-20">{"///"}</div>
            <p className="text-[13px] text-white/30">{anyBotRunning ? "Waiting for live activity\u2026" : "Deploy an agent to see live logs here"}</p>
          </div>
        </div>
      ) : (
        [...filteredMessages].reverse().map((msg, i) => {
          const level = (msg.level as string) || msg.type;
          const text = String(msg.message || "");
          const h = getLogHighlight(text, level);
          const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return (
            <div key={i} className={`rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 ${h.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40 ${h.typeColor}`}>
                  {h.typeLabel}
                </span>
                <span className="text-[11px] text-white/20 ml-auto font-mono">{time}</span>
              </div>
              <p className={`text-[13px] leading-relaxed ${h.msgColor}`}>{text}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
