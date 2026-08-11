"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useWikiAgent } from "@/hooks/use-wiki";
import InfoTip from "@/components/InfoTip";
/* Recharts removed — clean design uses no charts */

/* ════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════ */

/* gradeColor removed — badge replaced with plain text */

function gradeRingColor(grade: string): string {
  switch (grade) {
    case "S": return "#a855f7";
    case "A": return "#00C807";
    case "B": return "#22d3ee";
    case "C": return "#FFC107";
    case "D": case "F": return "#FF6B8A";
    default: return "#555";
  }
}

const DIST_LABELS: { key: string; label: string; color: string; desc: string; tooltip: string }[] = [
  { key: "harmful",      label: "Harmful",      color: "#FF6B8A", desc: "Score 1-3", tooltip: "Score 1-3: agent's input was detrimental to the trade decision" },
  { key: "neutral",      label: "Neutral",      color: "#FFC107", desc: "Score 4-5", tooltip: "Score 4-5: agent's input had negligible impact" },
  { key: "constructive", label: "Constructive", color: "#22d3ee", desc: "Score 6-8", tooltip: "Score 6-8: agent's input meaningfully improved the decision" },
  { key: "exceptional",  label: "Exceptional",  color: "#00C807", desc: "Score 9-10", tooltip: "Score 9-10: agent's input was the decisive factor in a correct outcome" },
];

/* ════════════════════════════════════════════════════════════════ */
/*  PAGE                                                            */
/* ════════════════════════════════════════════════════════════════ */

export default function AgentWikiPage() {
  const { role } = useParams<{ role: string }>();
  const { agent, loading, error } = useWikiAgent(role);

  if (loading) {
    return (
      <>
        <div className="w-48 h-6 bg-white/[0.04] rounded animate-pulse mb-4" />
        <div className="w-96 h-8 bg-white/[0.04] rounded animate-pulse mb-2" />
        <div className="w-64 h-4 bg-white/[0.04] rounded animate-pulse" />
      </>
    );
  }

  if (error || !agent) {
    return (
      <p className="text-[13px] text-white/70 text-center py-20">{error || "Agent not found"}</p>
    );
  }

  const a: any = agent;
  const fm: any = a.frontmatter ?? {};
  const snap: any = a.data_snapshot ?? {};
  const dist: any = snap.score_distribution ?? {};
  const topTrades: string[] = snap.top_trades ?? [];
  const worstTrades: string[] = snap.worst_trades ?? [];

  const avgScore = Number(snap.avg_score ?? fm.score ?? 0);
  const grade = snap.grade ?? fm.grade ?? (avgScore >= 8 ? "A" : avgScore >= 6 ? "B" : avgScore >= 4 ? "C" : "D");
  const nScored = Number(snap.n_scored ?? 0);
  const scoreOnWins = snap.score_on_wins != null ? Number(snap.score_on_wins) : null;
  const scoreOnLosses = snap.score_on_losses != null ? Number(snap.score_on_losses) : null;
  const displayName = (fm.role || role || "").replace(/_/g, " ");

  // Compute total for distribution bars
  const distTotal = DIST_LABELS.reduce((sum, d) => sum + Number(dist[d.key] ?? 0), 0);

  return (
    <>
      {/* -- Header -- */}
      <div className="mb-10">
        <Link href="/memory?tab=agents" className="text-[13px] text-white/60 hover:text-white/80 transition-colors">
          &larr; Back to Agents
        </Link>
        <h1 className="text-[28px] md:text-[36px] font-bold text-white tracking-tight mt-3">
          {displayName}
        </h1>
        <div className="flex items-center gap-4 mt-3 text-[14px] text-white/70">
          <span className="text-white">Grade {grade}</span>
          <span>&middot;</span>
          <span>{nScored} trades scored</span>
          {avgScore > 0 && (
            <>
              <span>&middot;</span>
              <span className="text-white">{avgScore.toFixed(1)} / 10</span>
            </>
          )}
        </div>
      </div>

      {/* -- Single column layout -- */}
      <div>

        {/* ====== Score Distribution ====== */}
        {distTotal > 0 && (
          <div className="mt-0">
            <h2 className="text-[22px] font-semibold text-white">Score distribution<InfoTip text="Breakdown of this agent's post-mortem scores across all evaluated trades" /></h2>
            <div className="border-t border-white/[0.08] mt-3 pt-6">
              <div className="flex items-start gap-10">
                {/* Score Ring */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="relative w-[100px] h-[100px]">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a1a" strokeWidth="6" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke={gradeRingColor(grade)} strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${(avgScore / 10) * 264} 264`} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[24px] font-bold text-white tabular-nums">{avgScore > 0 ? avgScore.toFixed(1) : "\u2014"}</span>
                      <span className="text-[10px] text-white/70 uppercase tracking-wider">/ 10</span>
                    </div>
                  </div>
                  <span className="text-[12px] text-white/70 mt-2">{distTotal} scored</span>
                </div>

                {/* Distribution rows with bars */}
                <div className="flex-1">
                  <div className="divide-y divide-white/[0.06]">
                    {DIST_LABELS.map((d) => {
                      const count = Number(dist[d.key] ?? 0);
                      const barPct = distTotal > 0 ? (count / distTotal) * 100 : 0;
                      return (
                        <div key={d.key} className="py-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[14px] text-white">{d.label}<InfoTip text={d.tooltip} /></span>
                            <span className="text-[14px] font-medium tabular-nums text-white">
                              {count} <span className="text-white/70">({barPct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: "rgba(255,255,255,0.25)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== Win vs Loss Performance ====== */}
        {(scoreOnWins != null || scoreOnLosses != null) && (
          <div className="mt-14">
            <h2 className="text-[22px] font-semibold text-white">Win vs loss performance<InfoTip text="Compare this agent's score on trades that won vs trades that lost" /></h2>
            <div className="border-t border-white/[0.08] mt-3 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ScoreCard
                  title="Score on Wins"
                  score={scoreOnWins}
                  color="#00C807"
                  icon="+"
                  tooltip="Average agent score on trades that won"
                />
                <ScoreCard
                  title="Score on Losses"
                  score={scoreOnLosses}
                  color="#FF6B8A"
                  icon="-"
                  tooltip="Average agent score on trades that lost"
                />
              </div>
              {scoreOnWins != null && scoreOnLosses != null && (
                <div className="mt-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-white/70">Differential<InfoTip text="Score on wins minus score on losses. Positive = agent adds more value on winners" /></span>
                    <span className={`text-[14px] font-medium tabular-nums ${(scoreOnWins - scoreOnLosses) >= 0 ? "text-gain" : "text-loss"}`}>
                      {(scoreOnWins - scoreOnLosses) >= 0 ? "+" : ""}{(scoreOnWins - scoreOnLosses).toFixed(1)}
                    </span>
                  </div>
                  <p className="text-[13px] text-white/70 mt-1">
                    {(scoreOnWins - scoreOnLosses) > 1
                      ? "Performs better on winning trades"
                      : (scoreOnWins - scoreOnLosses) < -1
                        ? "Performs better on losing trades"
                        : "Consistent across outcomes"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== Top Trades ====== */}
        {topTrades.length > 0 && (
          <div className="mt-14">
            <h2 className="text-[22px] font-semibold text-white">Top trades<InfoTip text="Trades where this agent scored highest and contributed most to a good outcome" /></h2>
            <div className="border-t border-white/[0.08] mt-3 pt-6">
              {topTrades.slice(0, 5).map((tradeId: string, i: number) => (
                <div key={tradeId}>
                  <Link href={`/memory/trade/${tradeId}`}
                    className="flex items-center py-3 text-[14px] hover:bg-white/[0.02] transition-colors">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gain/10 text-gain text-[11px] font-bold mr-3">
                      {i + 1}
                    </span>
                    <span className="text-white hover:text-[#60a5fa] transition-colors truncate">{tradeId}</span>
                  </Link>
                  {i < Math.min(topTrades.length, 5) - 1 && <div className="h-[1px] bg-white/[0.08]" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====== Worst Trades ====== */}
        {worstTrades.length > 0 && (
          <div className="mt-14">
            <h2 className="text-[22px] font-semibold text-white">Worst trades<InfoTip text="Trades where this agent scored lowest and may have contributed to a bad outcome" /></h2>
            <div className="border-t border-white/[0.08] mt-3 pt-6">
              {worstTrades.slice(0, 5).map((tradeId: string, i: number) => (
                <div key={tradeId}>
                  <Link href={`/memory/trade/${tradeId}`}
                    className="flex items-center py-3 text-[14px] hover:bg-white/[0.02] transition-colors">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-loss/10 text-loss text-[11px] font-bold mr-3">
                      {i + 1}
                    </span>
                    <span className="text-white hover:text-[#60a5fa] transition-colors truncate">{tradeId}</span>
                  </Link>
                  {i < Math.min(worstTrades.length, 5) - 1 && <div className="h-[1px] bg-white/[0.08]" />}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  SUB-COMPONENTS                                                  */
/* ════════════════════════════════════════════════════════════════ */

function ScoreCard({ title, score, color, icon, tooltip }: { title: string; score: number | null; color: string; icon?: string; tooltip?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon && (
          <span className="text-[14px] font-medium" style={{ color }}>{icon}</span>
        )}
        <span className="text-[13px] text-white/70">{title}{tooltip && <InfoTip text={tooltip} />}</span>
      </div>
      <div className="text-[28px] font-bold tracking-tight mt-2 tabular-nums text-white">
        {score != null ? score.toFixed(1) : "\u2014"}
      </div>
      {score != null && (
        <div className="mt-2">
          <div className="w-full h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(score / 10) * 100}%`, background: color }} />
          </div>
        </div>
      )}
    </div>
  );
}
