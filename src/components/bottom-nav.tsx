"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Home, Layers, BarChart3, Trophy } from "lucide-react";

const tabs = [
  { href: "/portfolio", label: "Portfolio", icon: Home },
  { href: "/strategy", label: "Strategies", icon: Layers },
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/leaderboard", label: "Benchmark", icon: Trophy },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-black/95 backdrop-blur-lg border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/portfolio"
              ? pathname === "/portfolio"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 min-h-[44px]",
                isActive ? "text-gain" : "text-white/30"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
