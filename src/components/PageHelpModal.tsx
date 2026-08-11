"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

/* ── Help content per page ─────────────────────────────────────────────────── */

interface HelpSection {
  heading: string;
  body: string;
}

interface PageHelp {
  title: string;
  subtitle: string;
  sections: HelpSection[];
}

const PAGE_HELP: Record<string, PageHelp> = {
  portfolio: {
    title: "Portfolio",
    subtitle: "Your fund overview at a glance.",
    sections: [
      {
        heading: "Portfolio Chart",
        body: "Track your fund value over time. Toggle between portfolio value and trade history views. Filter by period — Live, 1D, 1W, 1M, 3M, 1Y, or All.",
      },
      {
        heading: "Buying Power",
        body: "Expandable breakdown of Cash, Portfolio Value, and Capital Deployed across your agents.",
      },
      {
        heading: "Performance & Trading Stats",
        body: "Key metrics including Total Return, ROI, Best/Worst Day, Win Rate, Average Trade P&L, and Open Positions count.",
      },
      {
        heading: "Sidebar",
        body: "Open Positions shows your active market positions with real-time P&L. Agents lists all deployed bots with their status, trade count, and returns.",
      },
    ],
  },
  strategies: {
    title: "Strategies",
    subtitle: "Browse and manage your trading strategies.",
    sections: [
      {
        heading: "Strategy Table",
        body: "Each row shows a strategy name, target market (Kalshi or Polymarket), and its current status — Deployed, Available, or Coming Soon.",
      },
      {
        heading: "Active Strategies",
        body: "The sidebar highlights which strategies are currently deployed and running with an active indicator.",
      },
      {
        heading: "Strategy Detail",
        body: "Click any strategy to view its full configuration, live P&L chart, trade history, and agent reasoning logs.",
      },
    ],
  },
  trades: {
    title: "Trades",
    subtitle: "Complete trade history, reasoning, and market exposure.",
    sections: [
      {
        heading: "Trades Tab",
        body: "Searchable, filterable list of every trade your agents have made. Each row shows the agent, market, side, size, and P&L. Expand any trade to see the full AI deliberation and debate transcript.",
      },
      {
        heading: "Agent Reasoning",
        body: "Expand any trade to see the full AI deliberation. For Council strategies, this includes the structured debate between roles — Lead Forecaster, News Analyst, Bull/Bear Researcher, Risk Manager, and Trader.",
      },
      {
        heading: "Exposure Tab",
        body: "View your market positions and cross-agent exposure. Switch between My Positions and All Markets. Each card shows agent positions with side, size, confidence, and P&L.",
      },
    ],
  },
  terminal: {
    title: "Terminal",
    subtitle: "Live execution feed and signal pipeline.",
    sections: [
      {
        heading: "Terminal Logs",
        body: "Real-time log stream from your running agents. Color-coded entries show trades, rule checks, AI analysis, risk assessments, and errors. Filter by bot to isolate a specific agent's activity.",
      },
      {
        heading: "Signal Pipeline",
        body: "Watch signals flow through the pipeline stages — Scan, Filter, Debate, Rules, Queue, Execute. Switch between Card view (detailed signal cards) and Race Track view (animated pipeline visualization).",
      },
      {
        heading: "Actions",
        body: "Start Trading links to the Strategies page to deploy agents. Stop All halts all running agents. Nuke force-stops everything and deletes API keys — use with caution.",
      },
    ],
  },
  benchmarking: {
    title: "Benchmarking",
    subtitle: "Agent performance rankings and comparison.",
    sections: [
      {
        heading: "Head-to-Head Chart",
        body: "Visual comparison of your top agents plotted over time. Select a period — 1D, 7D, 1M, 3M, or All — to see how they stack up.",
      },
      {
        heading: "Leaderboard Table",
        body: "All agents ranked by P&L with columns for Win Rate, Trade Count, Confidence, Best Category, and a sparkline chart showing recent performance.",
      },
      {
        heading: "When Deployed",
        body: "Rankings update in real-time. Use this to identify which strategies outperform across different market categories and time periods.",
      },
    ],
  },
  logs: {
    title: "Audit Logs",
    subtitle: "Full system event log for transparency and debugging.",
    sections: [
      {
        heading: "Event Types",
        body: "Every event is categorized — API Call, Trade Decision, User Action, Bot Lifecycle, or System Event — with source attribution (Kalshi, OpenAI, Anthropic, etc.).",
      },
      {
        heading: "Search & Filters",
        body: "Filter by category, source, agent, and status. Search across all event descriptions to find specific actions or errors.",
      },
      {
        heading: "Expandable Details",
        body: "Click any log entry to view the full JSON payload, including request/response data, token usage, timestamps, and duration.",
      },
    ],
  },
  settings: {
    title: "Settings",
    subtitle: "Configure your account, connections, and safeguards.",
    sections: [
      {
        heading: "Account",
        body: "Set your display name and avatar color. Click the avatar circle to change its color.",
      },
      {
        heading: "Exchanges",
        body: "Connect your Kalshi and Polymarket accounts with API credentials. Test connections to verify they work before deploying agents.",
      },
      {
        heading: "API Keys",
        body: "Add AI model keys (OpenAI, Anthropic, OpenRouter) used by your trading agents for market analysis and decision-making.",
      },
      {
        heading: "Global Safeguards",
        body: "Account-wide limits that apply across all agents — max position size, daily loss limit, max daily trades, and more. These act as hard stops to protect your capital.",
      },
    ],
  },
};

/* ── Modal component ───────────────────────────────────────────────────────── */

function HelpModal({ pageKey, onClose }: { pageKey: string; onClose: () => void }) {
  const help = PAGE_HELP[pageKey];
  if (!help) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-[480px] max-h-[80vh] mx-4 bg-[#0a0a0a] border border-white/[0.12] rounded-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-white tracking-tight">{help.title}</h2>
            <p className="text-[13px] text-white/40 mt-0.5">{help.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {help.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-[13px] font-semibold text-white/80 uppercase tracking-wider mb-1.5">
                {section.heading}
              </h3>
              <p className="text-[13px] text-white/45 leading-relaxed">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Trigger button ────────────────────────────────────────────────────────── */

export function PageHelpButton({ pageKey }: { pageKey: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-white/[0.12] hover:border-white/30 transition-colors ml-2"
        title="Page info"
      >
        <Info className="w-3 h-3 text-white/30" />
      </button>
      {open && <HelpModal pageKey={pageKey} onClose={() => setOpen(false)} />}
    </>
  );
}
