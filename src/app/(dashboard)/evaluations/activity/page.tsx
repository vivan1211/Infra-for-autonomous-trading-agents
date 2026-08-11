"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useWikiLog } from "@/hooks/use-wiki";

/* ================================================================ */
/*  HELPERS                                                           */
/* ================================================================ */

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function eventLevel(entry: any): "error" | "warning" | "normal" {
  const action = (entry.action ?? "").toLowerCase();
  if (action.includes("error")) return "error";
  if (action.includes("warning")) return "warning";
  const msg = (entry.message ?? "").toLowerCase();
  if (msg.includes("failed") || msg.includes("crashed")) return "error";
  if (msg.includes("failure")) return "warning";
  return "normal";
}

const LEVEL_STYLES = {
  error:   { dot: "#FF6B8A", event: "#FF6B8A", msg: "rgba(255,107,138,0.8)", bg: "rgba(255,107,138,0.04)" },
  warning: { dot: "#FB923C", event: "#FB923C", msg: "rgba(251,146,60,0.8)",  bg: "rgba(251,146,60,0.04)" },
  normal:  { dot: "transparent", event: "#fff", msg: "rgba(255,255,255,0.7)", bg: "transparent" },
};

/* ================================================================ */
/*  PAGE                                                              */
/* ================================================================ */

export default function ActivityPage() {
  const { log, loading, error } = useWikiLog(50);
  const [showAll, setShowAll] = useState(false);

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.04] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  /* Error */
  if (error) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error}</p>;
  }

  /* Empty */
  if (!Array.isArray(log) || log.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-[16px] text-white/60">No activity yet</p>
        <p className="text-[13px] text-white/40 mt-2">Pipeline activity will appear here once evaluations run.</p>
      </div>
    );
  }

  const visible = showAll ? log : log.slice(0, 15);

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-white mb-1">Activity</h2>
      <p className="text-[13px] text-white/60 mb-6">Recent evaluation pipeline events</p>

      <div className="border-t border-white/[0.08] pt-6">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div style={{ minWidth: "500px" }}>
            {/* Header row */}
            <div
              className="grid items-center pb-4 text-[14px] font-bold text-white"
              style={{ gridTemplateColumns: "1.5fr 2fr 0.8fr" }}
            >
              <span>Event</span>
              <span>Details</span>
              <span className="text-right">Time</span>
            </div>
            <div className="h-[1.5px] bg-white/[0.2]" />

            {/* Rows */}
            {visible.map((entry: any, i: number) => {
              const level = eventLevel(entry);
              const s = LEVEL_STYLES[level];
              return (
                <div key={i}>
                  <div
                    className="grid items-center py-3.5 text-[14px]"
                    style={{ gridTemplateColumns: "1.5fr 2fr 0.8fr", background: s.bg, borderRadius: level !== "normal" ? 6 : 0, padding: level !== "normal" ? "14px 12px" : "14px 0" }}
                  >
                    <span className="flex items-center gap-2">
                      {level !== "normal" && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                      )}
                      <span style={{ color: s.event, fontWeight: level !== "normal" ? 600 : 400 }}>
                        {entry.stage || entry.action || "\u2014"}
                      </span>
                    </span>
                    <span className="truncate" style={{ color: s.msg }}>
                      {entry.message || "\u2014"}
                    </span>
                    <span className="text-white/70 text-right">
                      {entry.timestamp ? timeAgo(entry.timestamp) : ""}
                    </span>
                  </div>
                  {i < visible.length - 1 && (
                    <div className="h-[1px] bg-white/[0.12]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Show more button */}
        {log.length > 15 && !showAll && (
          <div className="flex items-center justify-between mt-5">
            <span className="text-[12px] text-white/70 italic">
              Showing {visible.length} of {log.length} events
            </span>
            <button
              onClick={() => setShowAll(true)}
              className="text-[13px] text-[#00C807] hover:text-[#00E808] transition-colors"
            >
              View more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
