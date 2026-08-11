"use client";

import { useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, PageHeader, Input, Button, Toggle, Select } from "@/components/ui";
import {
  Key, Shield, Brain, Clock, AlertTriangle,
  ArrowLeft, Trash2, RotateCcw, XCircle, History,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useAgent } from "@/hooks/use-agents";
import {
  agents as agentsApi,
  type BotConfigHistoryRow,
  type PlatformCodeHistoryRow,
  type ConfigChangedField,
  type PlatformCodeChangedField,
} from "@/lib/api";

export default function BotSettings() {
  const { id } = useParams();
  const agentId = typeof id === "string" ? id : "";
  const { agent } = useAgent(agentId);
  const bot = agent
    ? { id: agent.id, name: agent.name, strategy: agent.strategy, llms: agent.llms, exchange: "kalshi" as const }
    : null;

  const [maxTradeSize, setMaxTradeSize] = useState("50");
  const [maxPositions, setMaxPositions] = useState("5");
  const [minConfidence, setMinConfidence] = useState("60");
  const [maxDailyTrades, setMaxDailyTrades] = useState("20");
  const [strictness, setStrictness] = useState(75);
  const [continuousMode, setContinuousMode] = useState(true);
  const [activeHoursStart, setActiveHoursStart] = useState("09:00");
  const [activeHoursEnd, setActiveHoursEnd] = useState("18:00");

  // Checkboxes state
  const [categories, setCategories] = useState({
    Politics: true,
    Crypto: true,
    Sports: false,
    Economics: true,
    Climate: false,
  });

  const toggleCategory = (cat: string) => {
    setCategories((prev) => ({ ...prev, [cat]: !prev[cat as keyof typeof prev] }));
  };

  if (!bot) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <h2 className="text-xl font-semibold">Bot not found</h2>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-[800px]">
      {/* Back link */}
      <Link
        href={`/agents/${bot.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {bot.name}
      </Link>

      <PageHeader
        title={`${bot.name} Settings`}
        subtitle="Configure credentials, rules, and behavior for this bot"
      />

      {/* Exchange Credentials */}
      <Card className="mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[rgba(168,85,247,0.1)] flex items-center justify-center">
            <Key className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Exchange Credentials</h3>
            <p className="text-xs text-text-secondary">
              {bot.exchange === "kalshi" ? "Kalshi demo API key + private key" : "Polymarket wallet address"}
            </p>
          </div>
        </div>
        {bot.exchange === "kalshi" ? (
          <div className="space-y-4">
            <Input label="API Key" placeholder="Enter Kalshi API key" type="password" />
            <Input label="Private Key" placeholder="Enter Kalshi private key" type="password" />
          </div>
        ) : (
          <Input label="Wallet Address" placeholder="0x..." />
        )}
        <div className="mt-4">
          <Button variant="secondary" size="sm">Test Connection</Button>
        </div>
      </Card>

      {/* AI Validation Layer */}
      <Card className="mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[rgba(96,165,250,0.1)] flex items-center justify-center">
            <Brain className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">AI Validation Layer</h3>
            <p className="text-xs text-text-secondary">
              Every trade is validated by AI before execution
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Select
            label="Validator Model"
            options={[
              { value: "claude", label: "Claude 3.5 Sonnet" },
              { value: "gpt4o", label: "GPT-4o" },
              { value: "both", label: "Both (consensus required)" },
              { value: "none", label: "No AI validation" },
            ]}
          />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Validation Rules
            </label>
            <textarea
              className="w-full h-28 bg-surface border border-border rounded-lg text-sm text-text-primary p-3 font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-gain/20 focus:border-gain resize-none"
              placeholder={`never trade markets closing in less than 24 hours\nonly trade political markets\nreject any trade with confidence below 70%\nmax $50 per trade`}
              defaultValue={`never trade markets closing in less than 24 hours\nreject any trade with confidence below 60%\nmax $50 per trade\nskip sports markets on weekdays`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-primary">Strictness</label>
              <span className="text-xs text-text-secondary">
                {strictness <= 25 ? "Advisory (log but allow)" : strictness >= 75 ? "Enforced (block if rejected)" : "Moderate"}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={strictness}
              onChange={(e) => setStrictness(Number(e.target.value))}
              className="w-full h-2 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-gain"
            />
            <div className="flex justify-between mt-1 text-[10px] text-text-tertiary">
              <span>Advisory</span>
              <span>Enforced</span>
            </div>
          </div>

          <div className="space-y-3">
            <Input label="Claude API Key" type="password" placeholder="sk-ant-..." />
            <Input label="OpenAI API Key" type="password" placeholder="sk-..." />
          </div>
        </div>
      </Card>

      {/* Trading Rules */}
      <Card className="mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gain-light flex items-center justify-center">
            <Shield className="w-4 h-4 text-gain" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Trading Rules</h3>
            <p className="text-xs text-text-secondary">Hard limits enforced before any trade</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <Input label="Max Trade Size" prefix="$" value={maxTradeSize} onChange={setMaxTradeSize} />
          <Input label="Max Open Positions" value={maxPositions} onChange={setMaxPositions} />
          <Input label="Min Confidence Score" suffix="%" value={minConfidence} onChange={setMinConfidence} />
          <Input label="Max Daily Trades" value={maxDailyTrades} onChange={setMaxDailyTrades} />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-3">
            Allowed Market Categories
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(categories).map(([cat, enabled]) => (
              <label
                key={cat}
                className={`flex items-center gap-2.5 p-3 border rounded-lg cursor-pointer transition-all ${
                  enabled ? "border-gain bg-gain-light/30" : "border-border hover:bg-surface-hover"
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleCategory(cat)}
                  className="w-4 h-4 rounded text-gain focus:ring-gain"
                />
                <span className="text-sm text-text-primary">{cat}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      {/* Schedule */}
      <Card className="mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-warning-light flex items-center justify-center">
            <Clock className="w-4 h-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Schedule</h3>
            <p className="text-xs text-text-secondary">When the bot should trade</p>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-border">
          <div>
            <div className="text-sm font-medium text-text-primary">Run Continuously</div>
            <div className="text-xs text-text-secondary mt-0.5">Bot trades 24/7 when active</div>
          </div>
          <Toggle checked={continuousMode} onChange={setContinuousMode} />
        </div>

        {!continuousMode && (
          <div className="grid grid-cols-2 gap-4 pt-4 animate-fade-in">
            <Input label="Active Hours Start" type="time" value={activeHoursStart} onChange={setActiveHoursStart} />
            <Input label="Active Hours End" type="time" value={activeHoursEnd} onChange={setActiveHoursEnd} />
          </div>
        )}
      </Card>

      {/* Danger Zone */}
      <Card className="mb-6 !border-loss/30">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-loss-light flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-loss" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-loss">Danger Zone</h3>
            <p className="text-xs text-text-secondary">Destructive actions — proceed with caution</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 px-4 bg-bg rounded-lg">
            <div>
              <div className="text-sm font-medium text-text-primary">Reset Paper Balance</div>
              <div className="text-xs text-text-secondary">Reset simulated balance to initial amount</div>
            </div>
            <Button variant="secondary" size="sm">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>

          <div className="flex items-center justify-between py-3 px-4 bg-bg rounded-lg">
            <div>
              <div className="text-sm font-medium text-text-primary">Clear Trade History</div>
              <div className="text-xs text-text-secondary">Delete all trade logs for this bot</div>
            </div>
            <Button variant="secondary" size="sm">
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>

          <div className="flex items-center justify-between py-3 px-4 bg-bg rounded-lg">
            <div>
              <div className="text-sm font-medium text-text-primary">Disable Bot</div>
              <div className="text-xs text-text-secondary">Stop bot completely and remove from fund</div>
            </div>
            <Button variant="danger" size="sm">
              <XCircle className="w-3.5 h-3.5" />
              Disable
            </Button>
          </div>
        </div>
      </Card>

      {/* Change History */}
      <ChangeHistorySection agentId={agentId} botTypeId={agent?.bot_type_id ?? null} />

      {/* Save */}
      <Button variant="primary" size="lg" fullWidth>
        Save Settings
      </Button>
    </div>
  );
}

// ── Change History section ────────────────────────────────────────────────
// Surfaces two streams:
//   1. Your changes (per-user dashboard saves + deploys, RLS-scoped)
//   2. Platform updates (code-level changes — defaults + prompts — global)
// Data comes from GET /api/agents/{id}/config-history and
// GET /api/agents/platform-code-history.

function ChangeHistorySection({ agentId, botTypeId }: { agentId: string; botTypeId: string | null }) {
  const { data: myChanges, isLoading: myLoading, error: myError } = useSWR<BotConfigHistoryRow[]>(
    agentId ? ["/api/agents/config-history", agentId] : null,
    () => agentsApi.configHistory(agentId),
  );

  const { data: platformChanges, isLoading: platformLoading, error: platformError } = useSWR<PlatformCodeHistoryRow[]>(
    botTypeId ? ["/api/agents/platform-code-history", botTypeId] : null,
    () => agentsApi.platformCodeHistory({ bot_type_id: botTypeId ?? undefined }),
  );

  return (
    <Card className="mb-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[rgba(168,85,247,0.1)] flex items-center justify-center">
          <History className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Change History</h3>
          <p className="text-xs text-text-secondary">
            What you changed and what the platform changed underneath
          </p>
        </div>
      </div>

      {/* Your changes */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Your changes
        </div>
        {myLoading && <div className="text-xs text-text-secondary py-2">Loading…</div>}
        {myError && <div className="text-xs text-red-400 py-2">Failed to load.</div>}
        {!myLoading && !myError && (!myChanges || myChanges.length === 0) && (
          <div className="text-xs text-text-secondary py-2">
            No changes yet. Edit settings or deploy this bot to start tracking history.
          </div>
        )}
        {myChanges && myChanges.length > 0 && (
          <div className="flex flex-col gap-1">
            {myChanges.map((row) => (
              <MyChangeRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

      {/* Platform updates */}
      <div>
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Platform updates
        </div>
        {!botTypeId && (
          <div className="text-xs text-text-secondary py-2">
            Bot type unknown — platform history unavailable.
          </div>
        )}
        {botTypeId && platformLoading && <div className="text-xs text-text-secondary py-2">Loading…</div>}
        {botTypeId && platformError && <div className="text-xs text-red-400 py-2">Failed to load.</div>}
        {botTypeId && !platformLoading && !platformError && (!platformChanges || platformChanges.length === 0) && (
          <div className="text-xs text-text-secondary py-2">
            No platform updates recorded yet for this bot type.
          </div>
        )}
        {platformChanges && platformChanges.length > 0 && (
          <div className="flex flex-col gap-1">
            {platformChanges.map((row) => (
              <PlatformChangeRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function MyChangeRow({ row }: { row: BotConfigHistoryRow }) {
  const [expanded, setExpanded] = useState(false);
  const when = row.changed_at ? new Date(row.changed_at).toLocaleString() : "—";
  const fieldCount = row.changed_fields.length;
  const capitalChanged = row.capital_before !== row.capital_after;
  const modeChanged = row.mode_before !== row.mode_after;
  const summaryParts: string[] = [];
  if (fieldCount > 0) summaryParts.push(`${fieldCount} field${fieldCount > 1 ? "s" : ""}`);
  if (capitalChanged) summaryParts.push("capital");
  if (modeChanged) summaryParts.push("mode");
  const summary = summaryParts.length > 0 ? summaryParts.join(", ") : "deploy";

  return (
    <div className="rounded-lg bg-bg border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          )}
          <span className="text-xs text-text-secondary shrink-0">{when}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[rgba(96,165,250,0.1)] text-blue-400 shrink-0">
            {row.source}
          </span>
          <span className="text-xs text-text-primary truncate">{summary}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          {capitalChanged && (
            <ScalarDiffRow label="capital_allocated" from={row.capital_before} to={row.capital_after} />
          )}
          {modeChanged && (
            <ScalarDiffRow label="mode" from={row.mode_before} to={row.mode_after} />
          )}
          {row.changed_fields.map((f, i) => (
            <DashboardFieldDiff key={i} field={f} />
          ))}
          {row.changed_fields.length === 0 && !capitalChanged && !modeChanged && (
            <div className="text-xs text-text-secondary py-1">No field-level changes recorded.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardFieldDiff({ field }: { field: ConfigChangedField }) {
  return (
    <div className="text-xs py-1 font-mono">
      <span className="text-text-secondary">{field.field}:</span>{" "}
      <span className="text-red-400">{formatValue(field.from)}</span>
      <span className="text-text-secondary"> → </span>
      <span className="text-green-400">{formatValue(field.to)}</span>
    </div>
  );
}

function ScalarDiffRow({ label, from, to }: { label: string; from: unknown; to: unknown }) {
  return (
    <div className="text-xs py-1 font-mono">
      <span className="text-text-secondary">{label}:</span>{" "}
      <span className="text-red-400">{formatValue(from)}</span>
      <span className="text-text-secondary"> → </span>
      <span className="text-green-400">{formatValue(to)}</span>
    </div>
  );
}

function PlatformChangeRow({ row }: { row: PlatformCodeHistoryRow }) {
  const [expanded, setExpanded] = useState(false);
  const when = row.detected_at ? new Date(row.detected_at).toLocaleString() : "—";
  const defaultCount = row.changed_fields.filter((f) => f.kind === "default").length;
  const promptCount = row.changed_fields.filter((f) => f.kind === "prompt").length;
  const summaryParts: string[] = [];
  if (defaultCount > 0) summaryParts.push(`${defaultCount} default${defaultCount > 1 ? "s" : ""}`);
  if (promptCount > 0) summaryParts.push(`${promptCount} prompt${promptCount > 1 ? "s" : ""}`);
  const summary = summaryParts.length > 0 ? summaryParts.join(", ") : "initial baseline";

  return (
    <div className="rounded-lg bg-bg border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-[rgba(255,255,255,0.02)] transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          )}
          <span className="text-xs text-text-secondary shrink-0">{when}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[rgba(168,85,247,0.1)] text-purple-400 shrink-0">
            platform
          </span>
          <span className="text-xs text-text-primary truncate">{summary}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          {row.changed_fields.length === 0 && (
            <div className="text-xs text-text-secondary py-1">Initial baseline snapshot.</div>
          )}
          {row.changed_fields.map((f, i) => (
            <PlatformFieldDiff key={i} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformFieldDiff({ field }: { field: PlatformCodeChangedField }) {
  if (field.kind === "default") {
    return (
      <div className="text-xs py-1 font-mono">
        <span className="text-text-secondary">{field.field}:</span>{" "}
        <span className="text-red-400">{formatValue(field.from)}</span>
        <span className="text-text-secondary"> → </span>
        <span className="text-green-400">{formatValue(field.to)}</span>
      </div>
    );
  }
  // kind === 'prompt'
  return (
    <div className="text-xs py-2 border-b border-border last:border-b-0">
      <div className="font-mono text-text-secondary mb-1">
        {field.field}{" "}
        <span className="text-text-secondary/70">({field.chars_changed ?? 0} chars changed)</span>
      </div>
      {field.from_preview && (
        <div className="text-red-400 line-clamp-2 text-[11px] leading-snug">
          - {field.from_preview}
        </div>
      )}
      {field.to_preview && (
        <div className="text-green-400 line-clamp-2 text-[11px] leading-snug mt-0.5">
          + {field.to_preview}
        </div>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
