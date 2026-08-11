"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LogOut,
  Menu,
  ChevronDown,
  Settings,
  Compass,
} from "lucide-react";
import { useTickerPreferences } from "@/context/ticker-preferences";
import { useWalkthrough } from "@/context/walkthrough";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/context/auth";
import { MobileMenu } from "@/components/mobile-menu";
import { SearchTrades } from "@/components/search-trades";
import { trades as tradesApi, type Trade } from "@/lib/api";
import { useAgents } from "@/hooks/use-agents";

const navItems = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/strategy", label: "Strategies" },
  { href: "/trades", label: "Trades" },
  { href: "/evaluations", label: "Evaluations" },
  { href: "/terminal", label: "Terminal" },
  { href: "/leaderboard", label: "Benchmarking" },
];

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();
  const { start: startTour, hasCompleted: tourCompleted } = useWalkthrough();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[13px] font-semibold text-text-secondary cursor-pointer hover:text-text-primary transition-colors select-none"
      >
        {user?.email ? user.email.split("@")[0] : "Account"}
        <ChevronDown className="w-3.5 h-3.5" />
      </div>
      {open && (
        <div className="absolute right-0 top-9 w-48 bg-[#0a0a0a] border border-border rounded-lg shadow-lg py-1 z-50">
          {user?.email && (
            <div className="px-3 py-2 text-[12px] text-text-tertiary truncate border-b border-border">
              {user.email}
            </div>
          )}
          <button
            onClick={() => { setOpen(false); startTour(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Compass className="w-3.5 h-3.5" />
            {tourCompleted ? "Retake Tour" : "Take a Tour"}
          </button>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Ticker item type
type TickerItem = {
  mode: "LIVE" | "TRAINING";
  bot: string;
  action: "ACCEPTED" | "SKIPPED" | "REJECTED";
  market: string;
  detail: string;
  type: "accepted" | "skipped" | "rejected";
};

function mapWsToTickerItem(msg: Record<string, unknown>): TickerItem {
  const status = ((msg.status as string) || "").toLowerCase();
  const action_raw = ((msg.action as string) || "").toLowerCase();
  const env = ((msg.environment as string) || "").toLowerCase();
  const side = ((msg.side as string) || "").toUpperCase();

  // Mode: "actual" = LIVE, everything else = TRAINING
  const mode: "LIVE" | "TRAINING" = env === "actual" ? "LIVE" : "TRAINING";

  // Map status → ACCEPTED / SKIPPED / REJECTED
  let action: "ACCEPTED" | "SKIPPED" | "REJECTED";
  let type: "accepted" | "skipped" | "rejected";

  if (status === "skipped" || action_raw === "skip") {
    action = "SKIPPED";
    type = "skipped";
  } else if (status === "rejected" || status === "error") {
    action = "REJECTED";
    type = "rejected";
  } else {
    // executed, paper, pending — all count as accepted
    action = "ACCEPTED";
    type = "accepted";
  }

  // Build detail string
  let detail: string;
  const pnl = msg.pnl as number | undefined;
  const verdict = (msg.ai_verdict as string) || "";

  if (type === "skipped" || type === "rejected") {
    // Show reason if available, otherwise generic
    detail = verdict || (type === "skipped" ? "No edge" : "Rules blocked");
  } else if (pnl !== undefined && pnl !== 0) {
    detail = `${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`;
  } else {
    const count = (msg.count as number) || 1;
    const price = (msg.price as number) || 0;
    detail = `${count} ${side || "YES"} @ $${price.toFixed(2)}`;
  }

  return {
    mode,
    bot: (msg.agent_name as string) || (msg.agent_id as string) || "Bot",
    action,
    market: (msg.market_title as string) || (msg.market_ticker as string) || "Unknown",
    detail,
    type,
  };
}

function mapTradeToTickerItem(t: Trade): TickerItem {
  const status = (t.status || "").toLowerCase();
  const env = (t.environment || "").toLowerCase();
  const side = (t.side || "").toUpperCase();
  const mode: "LIVE" | "TRAINING" = env === "actual" ? "LIVE" : "TRAINING";

  let action: "ACCEPTED" | "SKIPPED" | "REJECTED";
  let type: "accepted" | "skipped" | "rejected";
  if (status === "skipped") { action = "SKIPPED"; type = "skipped"; }
  else if (status === "rejected" || status === "error") { action = "REJECTED"; type = "rejected"; }
  else { action = "ACCEPTED"; type = "accepted"; }

  let detail: string;
  if (type === "skipped" || type === "rejected") {
    detail = t.ai_verdict || (type === "skipped" ? "No edge" : "Rules blocked");
  } else if (t.pnl != null && t.pnl !== 0) {
    detail = `${t.pnl >= 0 ? "+" : ""}$${Math.abs(t.pnl).toFixed(2)}`;
  } else {
    detail = `${t.count} ${side || "YES"} @ $${t.price.toFixed(2)}`;
  }

  return { mode, bot: t.agent_id.slice(0, 8), action, market: t.market_title || t.market_ticker, detail, type };
}

const ACTION_COLORS: Record<TickerItem["type"], string> = {
  accepted: "text-gain",
  skipped: "text-text-tertiary",
  rejected: "text-loss",
};

const MODE_COLORS: Record<TickerItem["mode"], string> = {
  LIVE: "bg-gain/20 text-gain",
  TRAINING: "bg-blue-500/20 text-blue-400",
};

export function TickerBanner() {
  const { showTicker } = useTickerPreferences();
  const { agents } = useAgents();
  const { messages } = useWebSocket({ types: ["trade"] });
  const [seedItems, setSeedItems] = useState<TickerItem[]>([]);
  // Track new item keys for "NEW" badge
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const seenKeysRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed ticker from REST API on mount so it persists across refreshes
  useEffect(() => {
    tradesApi.list({ per_page: 20 }).then((res) => {
      if (res?.trades?.length) {
        const items = res.trades.slice(0, 20).map(mapTradeToTickerItem);
        setSeedItems(items);
        // Mark seed items as already seen so they don't get "NEW" badge
        items.forEach((item) => {
          seenKeysRef.current.add(`${item.bot}-${item.market}-${item.action}-${item.detail}`);
        });
      }
    }).catch(() => {});
  }, []);

  const wsTickerItems = useMemo(() => {
    return messages.slice(-30).map(mapWsToTickerItem);
  }, [messages]);

  // Deduplicate: merge WS items with seed, removing duplicates by key
  const tickerItems = useMemo(() => {
    const keyFn = (item: TickerItem) => `${item.bot}-${item.market}-${item.action}-${item.detail}`;
    if (wsTickerItems.length === 0) return seedItems;
    // WS items first, then seed items not already in WS
    const wsKeys = new Set(wsTickerItems.map(keyFn));
    const dedupedSeed = seedItems.filter((item) => !wsKeys.has(keyFn(item)));
    return [...wsTickerItems, ...dedupedSeed].slice(0, 30);
  }, [wsTickerItems, seedItems]);

  // Mark newly arrived WS items with a "NEW" badge that fades after 15s
  useEffect(() => {
    if (wsTickerItems.length === 0) return;
    const freshKeys: string[] = [];
    wsTickerItems.forEach((item) => {
      const key = `${item.bot}-${item.market}-${item.action}-${item.detail}`;
      if (!seenKeysRef.current.has(key)) {
        seenKeysRef.current.add(key);
        freshKeys.push(key);
      }
    });
    if (freshKeys.length === 0) return;
    setNewKeys((prev) => new Set([...Array.from(prev), ...freshKeys]));
    const timer = setTimeout(() => {
      setNewKeys((prev) => {
        const next = new Set(prev);
        freshKeys.forEach((k) => next.delete(k));
        return next;
      });
    }, 15000);
    return () => clearTimeout(timer);
  }, [wsTickerItems]);

  // Compute animation duration based on item count for consistent speed
  // ~6s per item gives a slower, more readable pace
  const animDuration = Math.max(40, tickerItems.length * 6);

  // Only show in live mode when at least one bot is deployed
  const hasDeployedBot = agents.some(
    (a) => a.status === "running" || a.status === "active"
  );

  // Respect user preference to hide ticker
  if (!showTicker) return null;

  // Only show when a bot is deployed and there are trade events
  if (!hasDeployedBot || tickerItems.length === 0) {
    return null;
  }

  // Double the items for seamless loop
  const items = [...tickerItems, ...tickerItems];

  return (
    <div className="h-8 bg-black overflow-hidden relative border-b border-border opacity-30 hover:opacity-100 transition-opacity duration-300">
      <div
        ref={scrollRef}
        className="ticker-scroll flex items-center h-full gap-8 whitespace-nowrap"
        style={{ animationDuration: `${animDuration}s` }}
      >
        {items.map((item, i) => {
          const key = `${item.bot}-${item.market}-${item.action}-${item.detail}`;
          const isNew = newKeys.has(key);
          return (
            <span key={`${key}-${i}`} className="flex items-center gap-2 text-[12px] shrink-0">
              {isNew && (
                <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#00C807]/20 text-[#00C807] animate-pulse">
                  NEW
                </span>
              )}
              <span className={clsx(
                "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                MODE_COLORS[item.mode]
              )}>
                {item.mode}
              </span>
              <span className="font-medium text-text-secondary">{item.bot}</span>
              <span className={clsx("font-bold", ACTION_COLORS[item.type])}>
                {item.action}
              </span>
              <span className="text-text-tertiary">{item.market}</span>
              <span className={clsx(
                "font-medium tabular-nums",
                ACTION_COLORS[item.type]
              )}>
                {item.detail}
              </span>
              <span className="text-border ml-2">•</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="h-16 bg-black flex items-center px-4 md:px-6">
        {/* Logo */}
        <Link href="/portfolio" className="mr-4 md:mr-8 shrink-0 text-[15px] font-semibold text-white tracking-tight select-none">
          Prediction Market Agents
        </Link>

        {/* Search — hidden on mobile */}
        <SearchTrades />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1">
          {[...navItems, ...(pathname.startsWith("/about") ? [{ href: "/about", label: "About" }] : [])].map((item) => {
            const isActive =
              item.href === "/portfolio"
                ? pathname === "/portfolio"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative px-3 py-1.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "text-gain"
                    : "text-white hover:text-gain"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right icons */}
        <div className="flex items-center gap-3 ml-4 md:ml-6">
          {/* AccountMenu — hidden on mobile (in hamburger instead) */}
          <div className="hidden md:block">
            <AccountMenu />
          </div>
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <Menu className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </>
  );
}

// Keep old exports for backwards compat during transition — will be removed
export function Sidebar() {
  return null;
}

export function TopBar() {
  return null;
}
