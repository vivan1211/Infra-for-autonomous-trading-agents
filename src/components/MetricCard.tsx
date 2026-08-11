interface MetricCardProps {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

export function MetricCard({ label, value, valueColor = "text-text-primary", sub }: MetricCardProps) {
  return (
    <div className="bg-surface border border-border rounded-card p-5 flex flex-col gap-1.5">
      <span className="text-xs text-text-tertiary uppercase tracking-wide font-medium">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-text-tertiary">{sub}</span>}
    </div>
  );
}
