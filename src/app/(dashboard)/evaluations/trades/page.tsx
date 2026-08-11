"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { useWikiTrades } from "@/hooks/use-wiki";

/* ================================================================ */
/*  FILTERS                                                           */
/* ================================================================ */

/** Safely parse data_snapshot — may arrive as a JSON string from the API. */
function safeSnap(raw: any): any {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw ?? {};
}

const FILTERS = [
  { key: "all",             label: "All" },
  { key: "live",            label: "Live" },
  { key: "training",        label: "Training" },
  { key: "won",             label: "Won" },
  { key: "lost",            label: "Lost" },
  { key: "skipped",         label: "Skipped" },
  { key: "rejected",        label: "Rejected" },
  { key: "would_have_won",  label: "Would Have Won" },
  { key: "would_have_lost", label: "Would Have Lost" },
];

/* ================================================================ */
/*  PAGE                                                              */
/* ================================================================ */

export default function TradesPage() {
  const { trades, loading, error } = useWikiTrades();
  const [filter, setFilter] = useState("all");

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-white/[0.04] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  /* Error */
  if (error) {
    return <p className="text-[13px] text-white/70 text-center py-20">{error}</p>;
  }

  /* Empty */
  if (!trades.length) {
    return (
      <div className="text-center py-20">
        <p className="text-[16px] text-white/60">No trade data yet</p>
        <p className="text-[13px] text-white/40 mt-2">Trades will appear here once the evaluation pipeline has run.</p>
      </div>
    );
  }

  /* Apply filter */
  const filtered = filter === "all" ? trades : trades.filter((t: any) => {
    const tSnap = safeSnap(t.data_snapshot);
    const bucket = t.frontmatter?.bucket || tSnap.signals?.bucket || "";
    const sig = tSnap.signals || {};
    const fm = t.frontmatter || {};
    if (filter === "live") return (sig.environment || fm.environment) === "actual";
    if (filter === "training") return (sig.environment || fm.environment) === "training";
    if (filter === "won") return bucket === "won";
    if (filter === "lost") return bucket === "lost";
    if (filter === "skipped") return bucket.includes("skipped");
    if (filter === "rejected") return bucket.includes("rejected");
    if (filter === "would_have_won") return bucket.includes("would_have_won");
    if (filter === "would_have_lost") return bucket.includes("would_have_lost");
    return true;
  });

  return (
    <div>
      {/* Header + filter bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-[22px] font-semibold text-white">Trades</h2>
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors ${
                filter === f.key
                  ? "text-[#00C807] border border-[#00C807]"
                  : "text-white/40 border border-white/[0.08] hover:border-white/[0.15]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-white/[0.08] mt-3 pt-6">
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div style={{ minWidth: "600px" }}>
            {/* Header row */}
            <div
              className="grid items-center pb-4 text-[14px] font-bold text-white"
              style={{ gridTemplateColumns: "2.5fr 0.8fr 0.8fr 0.8fr" }}
            >
              <span>Market</span>
              <span>Bot</span>
              <span>Status</span>
              <span className="text-right">P&amp;L</span>
            </div>
            <div className="h-[1.5px] bg-white/[0.2]" />

            {/* Rows */}
            {filtered.length === 0 && (
              <p className="text-[13px] text-white/50 text-center py-10">No trades match this filter.</p>
            )}
            {filtered.slice(0, 50).map((trade: any, i: number) => {
              const fm: any = trade.frontmatter || {};
              const sig: any = safeSnap(trade.data_snapshot).signals || {};
              const tradePnl = Number(sig.pnl ?? fm.pnl ?? 0);
              const botId = sig.bot_type_id || fm.bot_type_id || "";
              const bucket = fm.bucket || sig.bucket || "";
              const environment = sig.environment || fm.environment || "";

              return (
                <div key={trade.page_key || i}>
                  <Link
                    href={`/evaluations/trades/${trade.page_key}`}
                    className="grid items-center py-4 text-[14px] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: "2.5fr 0.8fr 0.8fr 0.8fr" }}
                  >
                    <span className="text-white truncate pr-3">
                      {fm.market_title || trade.page_key}
                    </span>
                    <span className="text-white/70">{botId || "\u2014"}</span>
                    <span
                      className={`${
                        bucket === "won"
                          ? "text-[#00C807]"
                          : bucket === "lost"
                          ? "text-[#FF6B8A]"
                          : "text-white/40"
                      }`}
                    >
                      {bucket.replace(/_/g, " ") || "\u2014"}
                      {environment === "training" && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-white/70 bg-white/[0.04]">
                          TRAIN
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-medium tabular-nums text-right ${
                        tradePnl > 0
                          ? "text-[#00C807]"
                          : tradePnl < 0
                          ? "text-[#FF6B8A]"
                          : "text-white/40"
                      }`}
                    >
                      {tradePnl !== 0
                        ? `${tradePnl >= 0 ? "+" : ""}${formatCurrency(tradePnl)}`
                        : "\u2014"}
                    </span>
                  </Link>
                  {i < filtered.slice(0, 50).length - 1 && (
                    <div className="h-[1px] bg-white/[0.12]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Count footer */}
        {filtered.length > 50 && (
          <p className="text-[12px] text-white/50 italic mt-4">
            Showing 50 of {filtered.length} trades
          </p>
        )}
      </div>
    </div>
  );
}
