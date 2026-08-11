"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  X, Search, Home, Layers, BarChart3, Settings,
  Trophy, LogOut, Terminal, Brain,
} from "lucide-react";
import { useAuth } from "@/context/auth";

const menuItems = [
  { href: "/portfolio", label: "Portfolio", icon: Home },
  { href: "/strategy", label: "Strategies", icon: Layers },
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/evaluations", label: "Evaluations", icon: Brain },
  { href: "/terminal", label: "Terminal", icon: Terminal },
  { href: "/leaderboard", label: "Benchmarking", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  // Close on route change
  useEffect(() => {
    if (open) onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-[#0a0a0a] border-l border-border animate-slide-in-right flex flex-col pb-4 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <span className="text-[14px] font-semibold text-white">Menu</span>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search"
              className="w-full h-10 bg-transparent border border-border rounded-lg text-[13px] text-white pl-9 pr-3 placeholder:text-white/30 focus:outline-none focus:border-border transition-colors"
            />
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {menuItems.map((item) => {
            const isActive =
              item.href === "/portfolio"
                ? pathname === "/portfolio"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-[14px] font-medium transition-colors",
                  isActive
                    ? "text-gain bg-gain/[0.08]"
                    : "text-white/60 active:bg-white/[0.04]"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Account section */}
        <div className="border-t border-border px-4 py-4 space-y-1 shrink-0 safe-bottom">
          {user?.email && (
            <div className="text-[12px] text-white/30 truncate mb-3 px-1">
              {user.email}
            </div>
          )}
          <button
            onClick={() => { onClose(); signOut(); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-[14px] text-white/60 active:bg-white/[0.04] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
