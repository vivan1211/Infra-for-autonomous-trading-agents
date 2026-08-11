const statusConfig = {
  active: {
    bg: "bg-gain/10",
    text: "text-gain",
    dot: "bg-gain",
    label: "Active",
    pulse: true,
  },
  paused: {
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
    label: "Paused",
    pulse: false,
  },
  error: {
    bg: "bg-loss/10",
    text: "text-loss",
    dot: "bg-loss",
    label: "Error",
    pulse: false,
  },
  paper: {
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
    label: "Training",
    pulse: false,
  },
  training: {
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
    label: "Training",
    pulse: false,
  },
  live: {
    bg: "bg-gain",
    text: "text-black",
    dot: "bg-black",
    label: "Live",
    pulse: true,
  },
  executed: {
    bg: "bg-gain/10",
    text: "text-gain",
    dot: "bg-gain",
    label: "Executed",
    pulse: false,
  },
  skipped: {
    bg: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
    label: "Skipped",
    pulse: false,
  },
};

type StatusType = keyof typeof statusConfig;

export function StatusBadge({ status }: { status: StatusType }) {
  const config = statusConfig[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs uppercase tracking-wide font-medium ${config.bg} ${config.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dot} ${
          config.pulse ? "animate-pulse" : ""
        }`}
      />
      {config.label}
    </span>
  );
}
