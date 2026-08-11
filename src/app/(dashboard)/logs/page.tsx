"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useAudit } from "@/hooks/use-audit";
import { useAgents } from "@/hooks/use-agents";
import { useWebSocket } from "@/hooks/use-websocket";
import { clsx } from "clsx";
import { PageHelpButton } from "@/components/PageHelpModal";

const CATEGORY_COLORS: Record<string, string> = {
  api_call: "bg-blue-500/15 text-blue-400",
  trade_decision: "bg-emerald-500/15 text-emerald-400",
  user_action: "bg-purple-500/15 text-purple-400",
  bot_lifecycle: "bg-orange-500/15 text-orange-400",
  system_event: "bg-gray-500/15 text-gray-400",
};

const SOURCE_COLORS: Record<string, string> = {
  kalshi: "bg-yellow-500/15 text-yellow-400",
  openai: "bg-green-500/15 text-green-400",
  anthropic: "bg-orange-500/15 text-orange-400",
  openrouter: "bg-cyan-500/15 text-cyan-400",
  orchestrator: "bg-indigo-500/15 text-indigo-400",
  user: "bg-purple-500/15 text-purple-400",
  system: "bg-gray-500/15 text-gray-400",
};

const STATUS_DOT: Record<string, string> = {
  success: "bg-gain",
  error: "bg-loss",
  warning: "bg-yellow-400",
};

export default function LogsPage() {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { entries, total, loading, loadingMore, hasMore, loadMore, refresh } = useAudit({
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    agent_id: agentFilter !== "all" ? agentFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: searchQuery || undefined,
  });

  const { agents } = useAgents();
  const { messages: wsAudit } = useWebSocket({ types: ["audit"] });

  const getTokens = (entry: { category: string; detail: Record<string, unknown> | string }): number | null => {
    if (entry.category !== "api_call") return null;
    try {
      const d = typeof entry.detail === "string" ? JSON.parse(entry.detail) : entry.detail;
      if (d?.tokens) return d.tokens as number;
      if (d?.tokens_in != null && d?.tokens_out != null) return (d.tokens_in as number) + (d.tokens_out as number);
    } catch { /* ignore parse errors */ }
    return null;
  };

  const hasActiveFilters = categoryFilter !== "all" || sourceFilter !== "all" || agentFilter !== "all" || statusFilter !== "all" || searchQuery !== "";
  const clearFilters = () => {
    setCategoryFilter("all");
    setSourceFilter("all");
    setAgentFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  const relativeTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-[24px] md:text-[34px] font-bold text-text-primary tracking-tight">Audit Logs</h1>
            <PageHelpButton pageKey="logs" />
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-[13px] text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <p className="text-[13px] text-text-tertiary mt-1">
          {total} total entries
          {wsAudit.length > 0 && ` | ${wsAudit.length} new`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search actions or details..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); }}
            className="w-full h-9 bg-transparent border border-border rounded-full text-[13px] text-text-primary pl-9 pr-3 placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); }}
          className="h-8 bg-transparent border border-border rounded-full text-[12px] text-text-primary px-3 focus:outline-none focus:border-text-tertiary appearance-none cursor-pointer"
        >
          <option value="all">All Categories</option>
          <option value="api_call">API Call</option>
          <option value="trade_decision">Trade Decision</option>
          <option value="user_action">User Action</option>
          <option value="bot_lifecycle">Bot Lifecycle</option>
          <option value="system_event">System Event</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); }}
          className="h-8 bg-transparent border border-border rounded-full text-[12px] text-text-primary px-3 focus:outline-none focus:border-text-tertiary appearance-none cursor-pointer"
        >
          <option value="all">All Sources</option>
          <option value="kalshi">Kalshi</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
          <option value="orchestrator">Orchestrator</option>
          <option value="user">User</option>
          <option value="system">System</option>
        </select>
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); }}
          className="h-8 bg-transparent border border-border rounded-full text-[12px] text-text-primary px-3 focus:outline-none focus:border-text-tertiary appearance-none cursor-pointer"
        >
          <option value="all">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); }}
          className="h-8 bg-transparent border border-border rounded-full text-[12px] text-text-primary px-3 focus:outline-none focus:border-text-tertiary appearance-none cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-[12px] text-text-tertiary mb-3">
        Showing {entries.length} of {total} entries
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="border-t border-border">
              <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[8%]">Time</th>
              <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[12%]">Category</th>
              <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[10%]">Source</th>
              <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[10%]">Agent</th>
              <th className="text-left text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3">Action</th>
              <th className="text-right text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[7%]">Tokens</th>
              <th className="text-center text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[6%]">Status</th>
              <th className="text-right text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 pr-3 w-[8%]">Duration</th>
              <th className="text-center text-[12px] font-medium text-text-tertiary uppercase tracking-wider py-3 w-[3%]"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const agentName = entry.agent_id ? (agents.find(a => a.id === entry.agent_id)?.name || entry.agent_id) : "-";

              return (
                <tr key={entry.id} className="group">
                  <td colSpan={9} className="p-0">
                    {/* Main row */}
                    <div
                      className="grid items-center hover:bg-[#0a0a0a] transition-colors cursor-pointer border-t border-border"
                      style={{ gridTemplateColumns: "8% 12% 10% 10% 1fr 7% 6% 7% 3%" }}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <div className="py-3.5 pr-3" title={new Date(entry.timestamp).toLocaleString()}>
                        <span className="text-[13px] text-text-secondary tabular-nums">{relativeTime(entry.timestamp)}</span>
                      </div>
                      <div className="py-3.5 pr-3">
                        <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full", CATEGORY_COLORS[entry.category] || "bg-gray-500/15 text-gray-400")}>
                          {entry.category.replace("_", " ")}
                        </span>
                      </div>
                      <div className="py-3.5 pr-3">
                        <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full", SOURCE_COLORS[entry.source] || "bg-gray-500/15 text-gray-400")}>
                          {entry.source}
                        </span>
                      </div>
                      <div className="py-3.5 pr-3">
                        <span className="text-[13px] text-text-secondary truncate block">{agentName}</span>
                      </div>
                      <div className="py-3.5 pr-3">
                        <span className="text-[13px] text-text-primary truncate block">{entry.action}</span>
                      </div>
                      <div className="py-3.5 pr-3 text-right text-[13px] text-text-secondary tabular-nums">
                        {(() => { const t = getTokens(entry); return t !== null ? t.toLocaleString() : "-"; })()}
                      </div>
                      <div className="py-3.5 pr-3 text-center">
                        <span className={clsx("inline-block w-2 h-2 rounded-full", STATUS_DOT[entry.status] || "bg-gray-500")} />
                      </div>
                      <div className="py-3.5 pr-3 text-right text-[13px] text-text-secondary tabular-nums">
                        {entry.duration_ms !== null ? `${entry.duration_ms}ms` : "-"}
                      </div>
                      <div className="py-3.5 text-center">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-text-tertiary inline-block" />
                          : <ChevronDown className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                        }
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-8 py-5 animate-fade-in border-t border-border bg-black">
                        <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3">Detail</div>
                        <pre className="text-[12px] text-text-secondary font-mono leading-[1.8] whitespace-pre-wrap break-all bg-surface rounded-lg p-4 max-h-[400px] overflow-y-auto">
                          {typeof entry.detail === "string"
                            ? (() => { try { return JSON.stringify(JSON.parse(entry.detail as string), null, 2); } catch { return entry.detail; } })()
                            : JSON.stringify(entry.detail, null, 2)
                          }
                        </pre>
                        <div className="mt-3 flex items-center gap-6 text-[11px] text-text-tertiary">
                          <span>ID: {entry.id}</span>
                          <span>Time: {new Date(entry.timestamp).toLocaleString()}</span>
                          {entry.duration_ms !== null && <span>Duration: {entry.duration_ms}ms</span>}
                          <span>Status: {entry.status}</span>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {entries.length === 0 && (
        <div className="py-16 text-center text-[14px] text-text-tertiary border-t border-border">
          {loading ? "Loading audit logs..." : "No audit log entries yet"}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-[13px] font-medium text-gain hover:text-gain/80 transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
