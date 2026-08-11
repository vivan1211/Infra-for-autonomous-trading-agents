"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { EvalErrorBoundary } from "./error-boundary";

/* ================================================================ */
/*  NAV CONFIG                                                        */
/* ================================================================ */

type NavItem = {
  key: string;
  label: string;
  href: string;
  matchPrefix?: string;
};

const MAIN_NAV: NavItem[] = [
  { key: "overview-v2", label: "Overview",      href: "/evaluations/overview-v2" },
  { key: "analysis",    label: "Analysis",      href: "/evaluations/analysis" },
  // { key: "trades",   label: "Trades",    href: "/evaluations/trades", matchPrefix: "/evaluations/trades" },  // hidden: autopsies disabled
  { key: "sweep",       label: "Sweep",         href: "/evaluations/sweep" },
  { key: "activity",    label: "Activity",      href: "/evaluations/activity" },
];

/* ================================================================ */
/*  LAYOUT                                                            */
/* ================================================================ */

export default function EvaluationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-6 md:px-10 lg:px-14 pt-2 pb-16 animate-fade-in">
      <PageTitle />
      <TopNav />
      <div className="min-w-0"><EvalErrorBoundary>{children}</EvalErrorBoundary></div>
    </div>
  );
}

/* ================================================================ */
/*  PAGE TITLE + INFO MODAL                                           */
/* ================================================================ */

function PageTitle() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2.5 mb-6">
        <h1 className="text-[28px] md:text-[34px] font-bold text-white tracking-tight">Evaluations</h1>
        <button
          onClick={() => setShowInfo(true)}
          className="flex items-center justify-center w-5 h-5 rounded-full border border-white/[0.15] text-white/70 hover:text-white/90 hover:border-white/[0.3] transition-colors text-[11px] font-medium mt-1"
        >
          i
        </button>
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInfo(false)} />
          <div className="relative bg-[#111] border border-white/[0.08] rounded-xl px-6 py-5 max-w-lg mx-4 shadow-2xl">
            <h2 className="text-[18px] font-bold text-white mb-3">About Evaluations</h2>
            <p className="text-[14px] text-white/80 leading-relaxed mb-3">
              Evaluations is your system&apos;s learning engine. After every trade settles, it runs a post-mortem analysis to understand what worked, what didn&apos;t, and why.
            </p>
            <p className="text-[14px] text-white/80 leading-relaxed mb-3">
              It scores each AI agent&apos;s contribution, detects behavioral patterns across your bots, measures calibration accuracy by category, and identifies the optimal filtering thresholds to maximize P&amp;L.
            </p>
            <p className="text-[14px] text-white/80 leading-relaxed">
              The data here is platform-level — aggregated across all your bots and trades. Use it to understand how your system is performing and where to improve.
            </p>
            <button
              onClick={() => setShowInfo(false)}
              className="mt-5 w-full py-2.5 text-[14px] font-medium text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ================================================================ */
/*  TOP NAV                                                           */
/* ================================================================ */

function TopNav() {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);

  return (
    <div className="mb-8 border-b border-white/[0.06]">
      <nav className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {MAIN_NAV.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`relative px-4 py-3 text-[15px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "text-[#00C807]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {item.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#00C807] rounded-t-full" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ================================================================ */
/*  HELPERS                                                           */
/* ================================================================ */

function getActiveKey(pathname: string): string {
  if (pathname.startsWith("/evaluations/trades")) return "trades";
  if (pathname === "/evaluations/overview-v2") return "overview-v2";
  if (pathname === "/evaluations/visuals") return "overview-v2";
  if (pathname === "/evaluations/analysis") return "analysis";
  if (pathname === "/evaluations/sweep") return "sweep";
  if (pathname === "/evaluations/activity") return "activity";
  return "overview-v2";
}
