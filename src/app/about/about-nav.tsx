"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Menu, X } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/strategy", label: "Strategies" },
  { href: "/trades", label: "Trades" },
  { href: "/terminal", label: "Terminal" },
  { href: "/leaderboard", label: "Benchmarking" },
  { href: "/settings", label: "Settings" },
  { href: "/about", label: "About" },
];

export function AboutNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="h-16 bg-black/60 backdrop-blur-xl flex items-center px-4 md:px-6 border-b border-white/[0.04]">
        {/* Logo */}
        <Link href="/portfolio" className="flex items-center mr-4 md:mr-8 shrink-0">
          <span className="text-[15px] font-bold text-white">Prediction Market Agents</span>
        </Link>

        {/* Search — hidden on mobile */}
        <div className="relative w-[320px] mr-8 shrink-0 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search"
            className="w-full h-9 bg-transparent border border-border rounded-lg text-[13px] text-text-primary pl-9 pr-3 placeholder:text-text-tertiary focus:outline-none focus:border-border transition-colors"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = item.href === "/about"
              ? pathname.startsWith("/about")
              : item.href === "/portfolio"
                ? pathname === "/portfolio"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "text-gain" : "text-white hover:text-gain"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Log In + Hamburger */}
        <div className="flex items-center gap-3 ml-4 md:ml-6">
          <Link
            href="/login"
            className="hidden md:block text-[13px] text-white/60 hover:text-white transition-colors"
          >
            Log In
          </Link>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <Menu className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-[#0a0a0a] border-l border-border animate-slide-in-right flex flex-col">
            <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
              <span className="text-[14px] font-semibold text-white">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              {navItems.map((item) => {
                const isActive = item.href === "/about"
                  ? pathname.startsWith("/about")
                  : item.href === "/portfolio"
                    ? pathname === "/portfolio"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-[14px] font-medium transition-colors",
                      isActive ? "text-gain bg-gain/[0.08]" : "text-white/60 active:bg-white/[0.04]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-border px-4 py-4 shrink-0">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-full py-2.5 rounded-full bg-gain text-black text-[13px] font-semibold"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-full py-2.5 rounded-full border border-white/[0.12] text-white/60 text-[13px] font-medium mt-2"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
