"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useWikiAnalysisLatest, useWikiAggregates } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-[#FF6B8A]/20 text-[#FF6B8A]",
    high: "bg-[#FB923C]/20 text-[#FB923C]",
    medium: "bg-[#FBBF24]/20 text-[#FBBF24]",
    low: "bg-white/[0.06] text-white/70",
    info: "bg-[#60a5fa]/20 text-[#60a5fa]",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${colors[severity] ?? colors.low}`}>
      {severity}
    </span>
  );
}

/** Minimal markdown-like rendering: paragraphs, bold, headers, bullet lists */
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  function flushList() {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4 text-[14px] text-white/80 leading-relaxed">
          {currentList.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  }

  function formatInline(s: string): React.ReactNode {
    // Bold: **text** or __text__
    const parts = s.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("__") && part.endsWith("__")) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      currentList.push(trimmed.slice(2));
      continue;
    }

    flushList();

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={elements.length} className="text-[15px] font-semibold text-white mt-5 mb-2">
          {formatInline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={elements.length} className="text-[17px] font-semibold text-white mt-6 mb-2">
          {formatInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={elements.length} className="text-[19px] font-bold text-white mt-6 mb-3">
          {formatInline(trimmed.slice(2))}
        </h2>
      );
    } else if (trimmed === "") {
      // skip blank lines (spacing handled by margins)
    } else {
      elements.push(
        <p key={elements.length} className="text-[14px] text-white/80 leading-relaxed mb-3">
          {formatInline(trimmed)}
        </p>
      );
    }
  }
  flushList();

  return <div>{elements}</div>;
}

function recSeverityBadge(severity: string) {
  const s = (severity ?? "").toLowerCase();
  if (s === "critical") {
    return (
      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide" style={{ background: "rgba(255,107,138,0.2)", color: "#FF6B8A" }}>
        {severity}
      </span>
    );
  }
  if (s === "high") {
    return (
      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide" style={{ background: "rgba(251,146,60,0.2)", color: "#FB923C" }}>
        {severity}
      </span>
    );
  }
  return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-white/[0.06] text-white/70">
      {severity}
    </span>
  );
}

export default function AnalysisPage() {
  const { analysis, loading, error } = useWikiAnalysisLatest();
  const { aggregates } = useWikiAggregates();

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-full h-64 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error}</p>;
  }

  if (!analysis) {
    return (
      <div className="text-center py-20">
        <p className="text-[16px] text-white/60">No analysis yet</p>
        <p className="text-[13px] text-white/40 mt-2">Weekly analysis will appear here after enough trades settle.</p>
      </div>
    );
  }

  const raw: any = analysis;
  const rawSnap = raw?.data_snapshot;
  const a: any = typeof rawSnap === "string" ? JSON.parse(rawSnap) : (rawSnap ?? raw ?? {});
  const narrative: string = a.narrative ?? a.summary ?? "";
  const interactions: any[] = Array.isArray(a.interactions) ? a.interactions : [];
  const configSuggestions: any[] = Array.isArray(a.config_suggestions) ? a.config_suggestions : [];
  const topAgent: any = a.top_agent ?? null;
  const worstAgent: any = a.worst_agent ?? null;
  const meta: any = a._metadata ?? {};
  const week: string = raw?.page_key ?? meta.week_key ?? "";
  const cost: any = meta.cost_usd ?? a.cost ?? null;
  const hash: string = meta.input_data_hash ?? "";

  /* Recommendations from aggregates */
  const aggSnap: any = (() => {
    const rs = aggregates?.data_snapshot;
    if (typeof rs === "string") { try { return JSON.parse(rs); } catch { return {}; } }
    return rs ?? {};
  })();
  const recs: any[] = Array.isArray(aggSnap.recommendations) ? aggSnap.recommendations : [];

  return (
    <>
      {/* Header */}
      <div className="mb-10">
        <h2 className="text-[22px] font-semibold text-white">
          Weekly Analysis
          <InfoTip text="LLM-generated weekly review of your trading system performance" />
        </h2>
        {week && (
          <p className="text-[13px] text-white/60 mt-1">Week: {week}</p>
        )}
      </div>

      {/* Narrative */}
      {narrative && (
        <div>
          <div className="border border-white/[0.06] rounded-xl p-6">
            <SimpleMarkdown text={narrative} />
          </div>
        </div>
      )}

      {/* Recommendations (from aggregates) */}
      {recs.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Recommendations</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 500 }}>
                <div
                  className="grid text-[14px] font-bold text-white"
                  style={{ gridTemplateColumns: "0.5fr 1.2fr 2.5fr", borderBottom: "1.5px solid rgba(255,255,255,0.2)", paddingBottom: 16 }}
                >
                  <span>Severity</span>
                  <span>Rule</span>
                  <span>Details</span>
                </div>
                {recs.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="grid items-center"
                    style={{ gridTemplateColumns: "0.5fr 1.2fr 2.5fr", padding: "24px 0", borderBottom: "1px solid rgba(255,255,255,0.12)", fontSize: 14 }}
                  >
                    <span>{recSeverityBadge(r.severity ?? "low")}</span>
                    <span style={{ color: "#919fa6" }}>{r.rule ?? "\u2014"}</span>
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{r.message ?? "\u2014"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top / Worst Agent */}
      {(topAgent || worstAgent) && (
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          {topAgent && (
            <div className="border border-[#00C807]/30 rounded-xl p-5 bg-[#00C807]/[0.04]">
              <p className="text-[12px] font-medium text-[#00C807] uppercase tracking-wider mb-2">Top Agent</p>
              <p className="text-[16px] font-semibold text-white">{topAgent.name ?? topAgent.agent ?? topAgent.role ?? "\u2014"}</p>
              {topAgent.reason && (
                <p className="text-[13px] text-white/70 mt-2 leading-relaxed">{topAgent.reason}</p>
              )}
              {topAgent.score != null && (
                <p className="text-[13px] text-white/50 mt-2">Score: {topAgent.score}</p>
              )}
            </div>
          )}
          {worstAgent && (
            <div className="border border-[#FF6B8A]/30 rounded-xl p-5 bg-[#FF6B8A]/[0.04]">
              <p className="text-[12px] font-medium text-[#FF6B8A] uppercase tracking-wider mb-2">Worst Agent</p>
              <p className="text-[16px] font-semibold text-white">{worstAgent.name ?? worstAgent.agent ?? worstAgent.role ?? "\u2014"}</p>
              {worstAgent.reason && (
                <p className="text-[13px] text-white/70 mt-2 leading-relaxed">{worstAgent.reason}</p>
              )}
              {worstAgent.score != null && (
                <p className="text-[13px] text-white/50 mt-2">Score: {worstAgent.score}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interactions */}
      {interactions.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">Interactions</h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6 space-y-4">
            {interactions.map((ix: any, i: number) => (
              <div key={i} className="border border-white/[0.06] rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  {ix.severity && severityBadge(ix.severity)}
                  <span className="text-[15px] font-medium text-white">{ix.title ?? ix.name ?? `Interaction ${i + 1}`}</span>
                </div>
                {ix.description && (
                  <p className="text-[13px] text-white/70 leading-relaxed">{ix.description}</p>
                )}
                {ix.affected_bots && (
                  <p className="text-[12px] text-white/50 mt-2">
                    Affected bots: {Array.isArray(ix.affected_bots) ? ix.affected_bots.join(", ") : ix.affected_bots}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config Suggestions */}
      {configSuggestions.length > 0 && (
        <div className="mt-14">
          <h2 className="text-[22px] font-semibold text-white">
            Config Suggestions
            <InfoTip text="LLM-recommended configuration changes based on this week's performance" />
          </h2>
          <div className="border-t border-white/[0.08] mt-3 pt-6 space-y-4">
            {configSuggestions.map((cs: any, i: number) => (
              <div key={i} className="border border-white/[0.06] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 flex items-center justify-center rounded border border-white/[0.15] text-[11px] text-white/60">{i + 1}</span>
                  <span className="text-[14px] font-medium text-white font-mono">{cs.field ?? cs.key ?? "config"}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-[13px]">
                  <div>
                    <span className="text-white/50 block mb-1">Current</span>
                    <span className="text-white font-mono">{cs.current != null ? String(cs.current) : "\u2014"}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block mb-1">Suggested</span>
                    <span className="text-[#60a5fa] font-mono">{cs.suggested != null ? String(cs.suggested) : "\u2014"}</span>
                  </div>
                </div>
                {cs.rationale && (
                  <p className="text-[13px] text-white/60 mt-3 leading-relaxed">{cs.rationale}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-14 pt-6 border-t border-white/[0.06] flex items-center gap-6 text-[12px] text-white/40">
        {week && <span>Week: {week}</span>}
        {cost != null && <span>LLM Cost: ${typeof cost === "number" ? cost.toFixed(4) : cost}</span>}
        {hash && <span className="font-mono">{String(hash).slice(0, 12)}</span>}
      </div>
    </>
  );
}
