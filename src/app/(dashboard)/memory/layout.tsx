"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

/* ════════════════════════════════════════════════════════════════ */
/*  NAV CONFIG                                                      */
/* ════════════════════════════════════════════════════════════════ */

type NavItem = {
  key: string;
  label: string;
  href: string;
  matchPrefix?: string;
};

const MAIN_NAV: NavItem[] = [
  { key: "overview",    label: "Overview",        href: "/memory" },
  { key: "bots",        label: "Strategies",      href: "/memory?tab=bots",       matchPrefix: "/memory/bot" },
  { key: "agents",      label: "Agents",          href: "/memory?tab=agents",     matchPrefix: "/memory/agent" },
  { key: "categories",  label: "Categories",      href: "/memory?tab=categories", matchPrefix: "/memory/category" },
  { key: "trades",      label: "Trades",          href: "/memory?tab=trades",     matchPrefix: "/memory/trade" },
  { key: "aggregates",  label: "Aggregates",      href: "/memory/aggregates" },
  { key: "analysis",    label: "Analysis",        href: "/memory/analysis" },
  { key: "visuals",     label: "Visuals",         href: "/memory/visuals" },
  { key: "sweep",       label: "Parameter Sweep", href: "/memory/sweep" },
  { key: "activity",    label: "Activity",        href: "/memory?tab=activity" },
];

/* ════════════════════════════════════════════════════════════════ */
/*  LAYOUT                                                          */
/* ════════════════════════════════════════════════════════════════ */

export default function MemoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <MemoryLayoutInner>{children}</MemoryLayoutInner>
    </Suspense>
  );
}

function MemoryLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-6 md:px-10 lg:px-14 pt-2 pb-16 animate-fade-in">
      <PageTitle />
      <TopNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/*  PAGE TITLE + INFO MODAL                                         */
/* ════════════════════════════════════════════════════════════════ */

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

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowInfo(false)} />
          <div className="relative bg-[#111] border border-white/[0.08] rounded-xl px-6 py-5 max-w-lg mx-4 shadow-2xl">
            <h2 className="text-[18px] font-bold text-white mb-3">About Evaluations</h2>
            <p className="text-[14px] text-white/80 leading-relaxed mb-3">
              Evaluations is your system&apos;s learning engine. After every trade settles, it runs a post-mortem analysis to understand what worked, what didn&apos;t, and why.
            </p>
            <p className="text-[14px] text-white/80 leading-relaxed mb-3">
              It scores each AI agent&apos;s contribution, detects behavioral patterns across your bots, measures calibration accuracy by category, and identifies the optimal filtering thresholds to maximize P&L.
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

/* ════════════════════════════════════════════════════════════════ */
/*  TOP NAV                                                         */
/* ════════════════════════════════════════════════════════════════ */

function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeKey = getActiveKey(pathname, searchParams);

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

/* ════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                         */
/* ════════════════════════════════════════════════════════════════ */

function getActiveKey(pathname: string, searchParams: URLSearchParams): string {
  for (const item of MAIN_NAV) {
    if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) {
      return item.key;
    }
  }

  if (pathname === "/memory/sweep") return "sweep";
  if (pathname === "/memory/aggregates") return "aggregates";
  if (pathname === "/memory/analysis") return "analysis";
  if (pathname === "/memory/visuals") return "visuals";

  if (pathname === "/memory") {
    const tab = searchParams.get("tab");
    if (tab && MAIN_NAV.some((n) => n.key === tab)) return tab;
    return "overview";
  }

  return "overview";
}
