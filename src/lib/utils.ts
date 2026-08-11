export function formatCurrency(value: number, showSign = false): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (showSign) {
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }
  return `$${formatted}`;
}

// Format a market resolution date as "relative · absolute" (e.g. "3d · May 31").
// `soon` is true when it resolves within 48h, for highlighting. Returns null
// for missing/invalid dates so callers can render a placeholder.
export function formatResolve(iso: string | null | undefined): { text: string; soon: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const ms = t - Date.now();
  const hours = ms / 3600000, days = ms / 86400000;
  const rel = ms < 0 ? "ended" : hours < 24 ? `${Math.max(0, Math.floor(hours))}h` : days < 60 ? `${Math.floor(days)}d` : `${Math.floor(days / 30)}mo`;
  const abs = new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: `${rel} · ${abs}`, soon: ms >= 0 && hours < 48 };
}

export function formatPercent(value: number, showSign = false): string {
  const abs = Math.abs(value);
  const formatted = abs.toFixed(2);
  if (showSign) {
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  }
  return `${formatted}%`;
}

export function formatVolume(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

export function pnlColor(value: number): string {
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-txt-secondary";
}

/** Inverted P&L color for counterfactual: positive CF = bad (missed money), negative CF = good (saved money) */
export function cfPnlColor(value: number): string {
  if (value > 0) return "text-loss";
  if (value < 0) return "text-gain";
  return "text-txt-secondary";
}

export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatMoneyFull(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

// ============ TYPES ============
export type BotStatus = "active" | "paused" | "error";
export type TradeStatus = "executed" | "settled" | "skipped" | "paper" | "error" | "pending" | "open" | "rejected" | "pending_fill" | "voided";
export type LogLevel = "info" | "trade" | "warn" | "error";

export type CategoryChampion = {
  category: string;
  agent: {
    id: string;
    name: string;
    [key: string]: unknown;
  };
  pnl: number;
  pnlPercent: number;
  trades: number;
  winRate: number;
};

export function pnlBg(value: number): string {
  if (value > 0) return "bg-gain-light";
  if (value < 0) return "bg-loss-light";
  return "bg-gray-50";
}
