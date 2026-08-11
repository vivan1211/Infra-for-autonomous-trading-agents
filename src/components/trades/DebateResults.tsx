"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────── */
/*  Reasoning Helpers (shared across trades + strategy pages)      */
/* ────────────────────────────────────────────────────────────── */

export function cleanReasoning(raw: string): string {
  if (!raw || raw === "No reasoning provided") return raw;
  let text = raw;
  text = text.replace(/\x1b\[[0-9;]*m/g, "");
  text = text.replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(\.\d+)?\s*\[\w+\]\s*/g, "");
  text = text.replace(/\{["\s]*event["\s]*:.*?\}\s*/g, "");
  text = text.replace(/^(INFO|DEBUG|WARNING|ERROR|CRITICAL)\s*[:\-]\s*/gim, "");
  text = text.replace(/timestamp=\S+\s+level=\S+\s*/g, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > 2000) text = text.slice(0, 2000) + "\u2026";
  return text || raw;
}

export function formatReasoning(text: string): string {
  if (!text) return text;
  let formatted = text;
  // Add line breaks before numbered items like (1), (2), (3)
  formatted = formatted.replace(/\s*\((\d+)\)\s*/g, "\n($1) ");
  // Add line breaks before KEY EVIDENCE:, THESIS:, COUNTER-THESIS:, etc.
  formatted = formatted.replace(/\s*((?:KEY\s+)?(?:EVIDENCE|THESIS|COUNTER-THESIS|ARGUMENTS?|STRUCTURAL\s+RISKS?|PROBABILITY\s+FLOOR|PROBABILITY\s+CEILING|RECOMMENDATION):)/gi, "\n\n$1");
  // Add line breaks before "Adjusting upward/downward"
  formatted = formatted.replace(/\s*(Adjusting (?:upward|downward) for:)/g, "\n$1");
  // Add line break before "Final calibrated" or "Final decision"
  formatted = formatted.replace(/\s*(Final (?:calibrated|decision)[^.]*)/g, "\n\n$1");
  // Clean up multiple newlines
  formatted = formatted.replace(/\n{3,}/g, "\n\n").trim();
  return formatted;
}

export function parseDebateResults(rawReasoning: string): Record<string, Record<string, unknown>> | null {
  if (!rawReasoning) return null;
  const marker = "---DEBATE_RESULTS_JSON---";
  const idx = rawReasoning.indexOf(marker);
  if (idx !== -1) {
    try { return JSON.parse(rawReasoning.slice(idx + marker.length).trim()); } catch { /* fall through */ }
  }
  const tMarker = "--- DEBATE TRANSCRIPT ---";
  const tIdx = rawReasoning.indexOf(tMarker);
  if (tIdx === -1) return null;
  const transcript = rawReasoning.slice(tIdx + tMarker.length);
  const blockRegex = /\[((?:PRE-ANALYSIS|STEP\s*\d+)[^\]]*)\]\s*\(([^)]*)\)/g;
  const results: Record<string, Record<string, unknown>> = {};
  let match;
  const blocks: { matchStart: number; matchEnd: number; header: string; meta: string }[] = [];
  while ((match = blockRegex.exec(transcript)) !== null) {
    blocks.push({ matchStart: match.index, matchEnd: match.index + match[0].length, header: match[1], meta: match[2] });
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const content = transcript.slice(block.matchEnd, i + 1 < blocks.length ? blocks[i + 1].matchStart : undefined).trim();
    const agentMatch = block.meta.match(/agent=(\w+)/);
    const modelMatch = block.meta.match(/model=([^,)]+)/);
    const elapsedMatch = block.meta.match(/([\d.]+)\s*s/);
    const role = agentMatch ? agentMatch[1] : block.header.toLowerCase().replace(/[^a-z_]/g, "");
    const fields: Record<string, unknown> = { _model: modelMatch?.[1]?.trim() || "", _elapsed: elapsedMatch?.[1] || "" };
    const probMatch = content.match(/probability:\s*([\d.]+)/);
    const confMatch = content.match(/confidence:\s*([\d.]+)/);
    const actionMatch = content.match(/action:\s*(\w+)/);
    const sideMatch = content.match(/side:\s*(\w+)/);
    const riskMatch = content.match(/risk_score:\s*([\d.]+)/);
    const reasonMatch = content.match(/reasoning:\s*(.+?)(?=\s+(?:probability|confidence|action|side|risk_score|key_arguments|should_trade|probability_floor):|$)/);
    if (probMatch) fields.probability = parseFloat(probMatch[1]);
    if (confMatch) fields.confidence = parseFloat(confMatch[1]);
    if (actionMatch) fields.action = actionMatch[1];
    if (sideMatch) fields.side = sideMatch[1];
    if (riskMatch) fields.risk_score = parseFloat(riskMatch[1]);
    if (reasonMatch) fields.reasoning = reasonMatch[1].trim();
    if (!fields.reasoning) fields.reasoning = content;
    results[role] = fields;
  }
  return Object.keys(results).length > 0 ? results : null;
}

export const AGENT_ICONS: Record<string, { label: string }> = {
  research: { label: "Research" },
  forecaster: { label: "Lead Forecaster" }, news_analyst: { label: "News Analyst" },
  bull_researcher: { label: "Bull Researcher" }, bear_researcher: { label: "Bear Researcher" },
  risk_manager: { label: "Risk Manager" }, trader: { label: "Trader (Final)" },
  superforecaster: { label: "Superforecaster" },
};

export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  return (
    <div>
      <p className={`text-[12px] text-[#919fa6] leading-[1.6] ${!expanded && isLong ? "line-clamp-3" : ""}`}>{text}</p>
      {isLong && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-[12px] text-[#ffffff] hover:text-[#919fa6] mt-1 transition-colors font-medium">
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}

export function DebateResultsView({ results }: { results: Record<string, Record<string, unknown>> }) {
  const orderedRoles = ["research", "superforecaster", "forecaster", "news_analyst", "bull_researcher", "bear_researcher", "risk_manager", "trader"];
  const knownRoles = orderedRoles.filter(r => results[r]);
  const extraRoles = Object.keys(results).filter(r => !orderedRoles.includes(r));
  const roles = [...knownRoles, ...extraRoles];
  if (roles.length === 0) return null;
  return (
    <div className="space-y-3">
      {roles.map((role) => {
        const agent = results[role];
        const meta = AGENT_ICONS[role] || { label: role };
        const reasoning = (agent.reasoning as string) || (agent.content as string) || "";
        const confidence = agent.confidence as number | undefined;
        const action = agent.action as string | undefined;
        const side = agent.side as string | undefined;
        const probability = agent.probability as number | undefined;
        const riskScore = agent.risk_score as number | undefined;
        const model = (agent._model as string) || "";
        const elapsed = (agent._elapsed as string) || "";
        const isTrader = role === "trader";
        const isSuperforecaster = role === "superforecaster";
        const keyFactors = agent.key_factors as string[] | undefined;
        return (
          <div key={role} className="rounded-lg border border-border bg-[#0d1117] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12px] font-semibold text-[#ffffff]">{meta.label}</span>
              <div className="flex items-center gap-2 ml-auto">
                {elapsed && <span className="text-[11px] text-[#919fa6]">{elapsed}s</span>}
                {model && <span className="text-[11px] text-[#919fa6] font-mono">{model.split("/").pop()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {(isTrader || isSuperforecaster) && action && <span className="text-[12px] font-bold px-1.5 py-0.5 rounded bg-[#1a1f25] text-[#ffffff]">{action} {side}</span>}
              {probability !== undefined && <span className="text-[12px] text-[#ffffff]">P(YES): {(probability * 100).toFixed(1)}%</span>}
              {confidence !== undefined && <span className="text-[12px] text-[#ffffff]">Conf: {(confidence * 100).toFixed(0)}%</span>}
              {riskScore !== undefined && <span className="text-[12px] text-[#919fa6]">Risk: {riskScore.toFixed(1)}/10</span>}
            </div>
            {reasoning && <ExpandableText text={reasoning} />}
            {keyFactors && keyFactors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="text-[11px] text-[#919fa6] mb-1">Key Factors</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {keyFactors.map((f, i) => <li key={i} className="text-[12px] text-[#919fa6]">{f}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
