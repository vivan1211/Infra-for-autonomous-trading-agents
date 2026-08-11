import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatCurrency, pnlColor } from "@/lib/utils";
import type { CategoryChampion } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, string> = {
  Crypto: "₿",
  Economics: "📈",
  Politics: "🏛",
  Tech: "💻",
  Markets: "📊",
  Weather: "🌤",
};

interface CategoryChampionCardProps {
  champion: CategoryChampion;
}

export function CategoryChampionCard({ champion }: CategoryChampionCardProps) {
  const { category, agent, pnl, trades, winRate } = champion;

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="relative bg-[#111] rounded-xl p-4 flex flex-col overflow-hidden hover:bg-[#161616] transition-colors duration-150 group"
    >
      {/* Subtle wave texture */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.045] pointer-events-none"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {[0, 18, 36, 54, 72, 90, 108, 126].map((offset, i) => (
          <path
            key={i}
            d={`M-40,${offset} C30,${offset - 20} 80,${offset + 20} 160,${offset} S280,${offset - 20} 360,${offset}`}
            fill="none"
            stroke="white"
            strokeWidth="1"
          />
        ))}
      </svg>

      {/* Top row: category label + trophy */}
      <div className="relative z-10 flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] leading-none">{CATEGORY_ICONS[category] ?? "•"}</span>
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{category}</span>
        </div>
        <Trophy className="w-3 h-3 text-amber-400/70" />
      </div>

      {/* Agent name (left) + Win rate (right, hero number) */}
      <div className="relative z-10 flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-semibold text-white leading-snug truncate group-hover:text-text-secondary transition-colors">
          {agent.name}
        </p>
        <div className="text-right shrink-0">
          <span className="text-[26px] font-black text-white tabular-nums leading-none">
            {winRate.toFixed(0)}
          </span>
          <span className="text-[12px] font-semibold text-text-tertiary">%</span>
        </div>
      </div>

      {/* PnL */}
      <p className={`relative z-10 text-[13px] font-semibold tabular-nums ${pnlColor(pnl)}`}>
        {formatCurrency(pnl, true)}
      </p>

      {/* Trades footer */}
      <p className="relative z-10 text-[11px] text-text-tertiary mt-3">
        + {trades} trades
      </p>
    </Link>
  );
}
