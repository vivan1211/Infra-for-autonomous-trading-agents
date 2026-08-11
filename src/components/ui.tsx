"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";
import { BotStatus, TradeStatus, pnlColor, formatMoney, formatPercent } from "@/lib/utils";

// ============ CARD ============
export function Card({
  children,
  className,
  hover = false,
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: string;
}) {
  return (
    <div
      className={clsx(
        "bg-surface border border-border rounded-card",
        padding,
        hover && "card-hover cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============ METRIC CARD ============
export function MetricCard({
  label,
  value,
  sub,
  trend,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  icon?: ReactNode;
  iconBg?: string;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        {icon && (
          <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconBg || "bg-surface-hover")}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wider">{label}</div>
          <div className="text-[18px] font-semibold text-text-primary mt-0.5 tabular-nums">{value}</div>
          {(sub || trend !== undefined) && (
            <div className="flex items-center gap-2 mt-0.5">
              {trend !== undefined && (
                <span className={clsx("text-[13px] font-medium tabular-nums", pnlColor(trend))}>
                  {formatPercent(trend)}
                </span>
              )}
              {sub && <span className="text-[12px] text-text-tertiary">{sub}</span>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============ STATUS BADGE ============
const statusConfig: Record<BotStatus, { bg: string; dot: string; label: string }> = {
  active: { bg: "bg-gain-light text-gain", dot: "bg-gain", label: "Active" },
  paused: { bg: "bg-warning-light text-warning", dot: "bg-warning", label: "Paused" },
  error: { bg: "bg-loss-light text-loss", dot: "bg-loss", label: "Error" },
};

export function StatusBadge({ status }: { status: BotStatus }) {
  const c = statusConfig[status];
  return (
    <span className={clsx("status-badge", c.bg)}>
      <span className={clsx("w-1.5 h-1.5 rounded-full", c.dot, status === "active" && "animate-pulse-dot")} />
      {c.label}
    </span>
  );
}

// ============ TRADE STATUS PILL ============
const tradeStatusConfig: Record<TradeStatus, { bg: string; label: string }> = {
  executed: { bg: "bg-gain-light text-gain", label: "Executed" },
  settled: { bg: "bg-[rgba(96,165,250,0.1)] text-blue-400", label: "Settled" },
  open: { bg: "bg-[rgba(96,165,250,0.1)] text-blue-400", label: "Open" },
  skipped: { bg: "bg-warning-light text-warning", label: "Skipped" },
  paper: { bg: "bg-[rgba(96,165,250,0.1)] text-blue-400", label: "Paper" },
  rejected: { bg: "bg-loss-light text-loss", label: "Rejected" },
  error: { bg: "bg-loss-light text-loss", label: "Error" },
  pending: { bg: "bg-surface-hover text-text-secondary", label: "Pending" },
  pending_fill: { bg: "bg-warning-light text-warning", label: "Pending Fill" },
  voided: { bg: "bg-surface-hover text-text-secondary", label: "Voided" },
};

export function TradeStatusPill({ status }: { status: TradeStatus }) {
  const c = tradeStatusConfig[status];
  return <span className={clsx("status-badge", c.bg)}>{c.label}</span>;
}

// ============ SIDE BADGE ============
export function SideBadge({ side }: { side: "YES" | "NO" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-[13px] font-bold",
        side === "YES" ? "bg-gain-light text-text-primary" : "bg-loss-light text-text-primary"
      )}
    >
      {side}
    </span>
  );
}

// ============ EXCHANGE BADGE ============
export function ExchangeBadge({ exchange }: { exchange: "kalshi" | "polymarket" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium",
        exchange === "kalshi" ? "bg-[rgba(168,85,247,0.1)] text-purple-400" : "bg-[rgba(96,165,250,0.1)] text-blue-400"
      )}
    >
      {exchange === "kalshi" ? "Kalshi" : "Polymarket"}
    </span>
  );
}

// ============ CONFIDENCE BAR ============
export function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden" />
        <span className="text-[13px] text-text-tertiary tabular-nums w-8">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gain/40" style={{ width: `${value}%` }} />
      </div>
      <span className="text-[13px] text-gain tabular-nums w-8">{Math.round(value)}%</span>
    </div>
  );
}

// ============ PNL DISPLAY ============
export function PnlDisplay({
  value,
  size = "md",
}: {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClasses = {
    sm: "text-[13px]",
    md: "text-sm",
    lg: "text-lg",
    xl: "text-3xl",
  };
  return (
    <span className={clsx("font-semibold tabular-nums", sizeClasses[size], pnlColor(value))}>
      {formatMoney(value)}
    </span>
  );
}

// ============ SECTION HEADER ============
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[18px] font-semibold text-text-primary">{title}</h2>
      {action}
    </div>
  );
}

// ============ PAGE HEADER ============
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[34px] font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-[14px] text-text-tertiary mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ============ TAB BAR ============
export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            "px-4 py-2 rounded-full text-[14px] font-medium transition-all border",
            active === tab.key
              ? "border-gain bg-gain/10 text-gain"
              : "border-border text-text-secondary hover:text-text-primary hover:border-border"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[13px] text-text-tertiary">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ============ TIME RANGE SELECTOR (Robinhood-style underline tabs) ============
export function TimeRangeSelector({
  active,
  onChange,
}: {
  active: string;
  onChange: (range: string) => void;
}) {
  const ranges = ["LIVE", "1D", "1W", "1M", "3M", "1Y", "ALL"];
  return (
    <div className="flex items-center gap-6">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={clsx(
            "relative pb-2 text-[14px] font-medium tracking-wide transition-colors",
            active === r
              ? "text-gain"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          {r === "LIVE" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-gain mr-1 align-middle" />}
          {r}
          {active === r && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gain rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}

// ============ EMPTY STATE ============
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-text-tertiary mb-3">{icon}</div>
      <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>
      <p className="text-[14px] text-text-secondary mt-1 max-w-sm">{description}</p>
    </div>
  );
}

// ============ TOGGLE SWITCH ============
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <div
        className={clsx(
          "w-10 h-[22px] rounded-full relative transition-colors",
          checked ? "bg-gain" : "bg-surface-hover"
        )}
        onClick={() => onChange(!checked)}
      >
        <div
          className={clsx(
            "absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </div>
      {label && <span className="text-[14px] text-text-primary">{label}</span>}
    </label>
  );
}

// ============ INPUT ============
export function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-[14px] font-medium text-text-primary mb-1.5">{label}</label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-[14px] text-text-tertiary">{prefix}</span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={clsx(
            "w-full h-10 bg-surface border border-border rounded-lg text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-gain/20 focus:border-gain transition-all",
            prefix ? "pl-8" : "pl-3",
            suffix ? "pr-12" : "pr-3"
          )}
        />
        {suffix && (
          <span className="absolute right-3 text-[14px] text-text-tertiary">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ============ BUTTON ============
export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  onClick,
  disabled,
  fullWidth,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const variants = {
    primary: "bg-gain text-black font-semibold hover:brightness-110 active:brightness-95",
    secondary: "bg-transparent text-gain border border-gain hover:bg-gain/10",
    danger: "bg-loss text-white hover:brightness-110",
    ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
  };
  const sizes = {
    sm: "h-8 px-3 text-[12px]",
    md: "h-10 px-4 text-[14px]",
    lg: "h-12 px-6 text-[14px]",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

// ============ SELECT ============
export function Select({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (val: string) => void;
}) {
  return (
    <div>
      {label && (
        <label className="block text-[14px] font-medium text-text-primary mb-1.5">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full h-10 bg-surface border border-border rounded-lg text-[14px] text-text-primary px-3 focus:outline-none focus:ring-2 focus:ring-gain/20 focus:border-gain appearance-none [&>option]:bg-surface [&>option]:text-text-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============ ENVIRONMENT BADGE ============
export function EnvironmentBadge({ environment }: { environment: "training" | "actual" | string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
        environment === "actual"
          ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
          : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
      )}
    >
      {environment === "actual" ? "Actual" : "Training"}
    </span>
  );
}

// ============ CATEGORY PILL ============
const catColors: Record<string, string> = {
  Politics: "bg-[rgba(96,165,250,0.1)] text-blue-400",
  Crypto: "bg-[rgba(251,146,60,0.1)] text-orange-400",
  Sports: "bg-[rgba(168,85,247,0.1)] text-purple-400",
  Economics: "bg-[rgba(52,211,153,0.1)] text-emerald-400",
  Climate: "bg-[rgba(45,212,191,0.1)] text-teal-400",
};

export function CategoryPill({ category }: { category: string }) {
  return (
    <span className={clsx("status-badge", catColors[category] || "bg-surface-hover text-text-secondary")}>
      {category}
    </span>
  );
}
