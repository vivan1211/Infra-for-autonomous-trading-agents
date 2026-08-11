"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Settings, TrendingUp, Trophy } from "lucide-react";

const navItems = [
  { href: "/portfolio", label: "Portfolio", icon: BarChart3 },
  { href: "/strategy", label: "Strategies", icon: Bot },
  { href: "/leaderboard", label: "Benchmarking", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-surface-card border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gain flex items-center justify-center">
          <TrendingUp className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-heading-md text-txt-primary">Prediction Market Agents</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/portfolio"
                ? pathname === "/portfolio"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 h-11 px-3 rounded-lg transition-colors duration-150 ${
                    isActive
                      ? "bg-gain/10 text-gain font-semibold"
                      : "text-txt-secondary hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                  <span className="text-[15px]">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gain animate-pulse" />
          <span className="text-body-sm text-txt-tertiary">3 agents running</span>
        </div>
      </div>
    </aside>
  );
}
