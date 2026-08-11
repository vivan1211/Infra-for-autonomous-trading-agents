"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import {
  CheckCircle2, Loader2, Eye, EyeOff, Trash2, KeyRound, Radiation,
  AlertTriangle, Square, User, Building2, Key, Shield, ShieldCheck, FileText,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { rules as rulesApi, credentials as credentialsApi, agents as agentsApi, portfolio as portfolioApi, type RulesConfig, type Credential } from "@/lib/api";
import { useAuth } from "@/context/auth";
import { useTickerPreferences } from "@/context/ticker-preferences";
import { useAgents } from "@/hooks/use-agents";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createClient } from "@/lib/supabase";
import { PageHelpButton } from "@/components/PageHelpModal";
import { MFASettings } from "@/components/mfa-settings";
import { TwitterConnectCard } from "@/components/TwitterConnectCard";
import { EXCHANGE_CONFIGS } from "@/components/exchanges/types";
import type { ExchangeProvider } from "@/components/exchanges/types";
import { ExchangeConnectButton } from "@/components/exchanges/ExchangeConnectButton";
import { ExchangeConnectModal } from "@/components/exchanges/ExchangeConnectModal";

// ── Avatar colors (same as onboarding) ──────────────────────────────────────

const AVATAR_COLORS = [
  "#00C807", "#FF6B8A", "#4F46E5", "#F59E0B", "#10B981", "#8B5CF6",
];

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function getTextColor(bg: string): string {
  return ["#00C807", "#F59E0B", "#10B981"].includes(bg) ? "#000" : "#fff";
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "account", label: "Account", icon: User },
  { id: "exchanges", label: "Exchanges", icon: Building2 },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "safeguards", label: "Safeguards", icon: Shield },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "about", label: "About", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Number input row ────────────────────────────────────────────────────────

function NumberInputRow({ label, value, min, max, unit = "", onChange, hint, disabled }: {
  label: string; value: number; min: number; max: number; unit?: string;
  onChange: (v: number) => void; hint?: string; disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <div className={`border-b border-border last:border-b-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between py-3">
        <div className="min-w-0 mr-4">
          <span className="text-[13px] font-medium text-[#919fa6]">{label}</span>
          {hint && <p className="text-[11px] text-[#919fa6] mt-0.5">{hint}</p>}
        </div>
        <div className="relative shrink-0">
          {unit === "$" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">$</span>}
          <input
            type="number" min={min} max={max} value={local}
            disabled={disabled}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
              const v = Number(local);
              if (isNaN(v) || local === "") { setLocal(String(value)); }
              else { const c = Math.max(min, Math.min(max, v)); onChange(c); setLocal(String(c)); }
            }}
            className={`w-full sm:w-[80px] py-1.5 rounded-lg bg-white/[0.04] border border-border text-[13px] text-[#ffffff] tabular-nums text-right focus:outline-none focus:border-border hover:border-border transition-colors [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:cursor-not-allowed ${unit === "$" ? "pl-5 pr-2.5" : unit === "%" ? "pl-2.5 pr-6" : unit === "h" ? "pl-2.5 pr-5" : "px-2.5"}`}
          />
          {unit === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">%</span>}
          {unit === "h" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-[#919fa6] pointer-events-none">h</span>}
        </div>
      </div>
    </div>
  );
}

// ── Key field ───────────────────────────────────────────────────────────────

function KeyField({
  label, placeholder, note, provider, keyType, testLabel = "Test Connection",
  savedCredential, onCredentialChange,
}: {
  label: string; placeholder: string; note?: string;
  provider: string; keyType?: string; testLabel?: string;
  savedCredential?: Credential | null; onCredentialChange?: () => void;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const isSaveOnly = testLabel === "Save Key";

  const handleTest = async () => {
    if (!value) return;
    setStatus("loading");
    try {
      if (isSaveOnly) {
        // Save-only fields (e.g. wallet address) — no test step
        await credentialsApi.create({ provider, label, key_type: keyType || "api_key", value });
        setStatus("ok"); setMsg("Key saved successfully"); setValue(""); onCredentialChange?.(); return;
      }
      // Test first — only save if the test passes (or is unavailable).
      // Saving before testing would persist invalid credentials on test failure.
      let testPassed = true;
      try {
        const res = await credentialsApi.test({ provider, label, key_type: keyType || "api_key", value });
        if (!res.success) {
          setStatus("fail"); setMsg(res.message || "Connection test failed — key not saved");
          return;
        }
      } catch {
        // Test endpoint unavailable — proceed to save with a note
        testPassed = false;
      }
      await credentialsApi.create({ provider, label, key_type: keyType || "api_key", value });
      setStatus("ok");
      setMsg(testPassed ? "Saved & connected successfully" : "Key saved (connection test unavailable)");
      setValue(""); onCredentialChange?.();
    } catch (err) {
      setStatus("fail");
      const msg = err instanceof Error ? err.message : "Failed to save key";
      if (msg.toLowerCase().includes("two-factor") || msg.toLowerCase().includes("mfa")) {
        setMsg("Enable 2FA in Settings → Security before adding API keys");
      } else {
        setMsg(msg);
      }
    }
  };

  const handleDelete = async () => {
    if (!savedCredential) return;
    setStatus("loading");
    try { await credentialsApi.delete(savedCredential.id); setStatus("idle"); setMsg(""); setDeleteConfirm(false); onCredentialChange?.(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete key";
      if (msg.toLowerCase().includes("two-factor") || msg.toLowerCase().includes("mfa")) {
        setStatus("fail"); setMsg("Enable 2FA in Settings → Security to manage API keys"); setDeleteConfirm(false);
      } else {
        setStatus("fail"); setMsg(msg); setDeleteConfirm(false);
      }
    }
  };

  return (
    <div>
      <label className="block text-[12px] text-[#919fa6] uppercase tracking-wider mb-1.5">{label}</label>
      {savedCredential && (
        <div className="flex items-center gap-2 mb-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-border">
          <KeyRound className="w-3 h-3 text-gain shrink-0" />
          <span className="text-[12px] text-[#919fa6] flex-1">
            Saved — ends in <span className="font-mono text-[#919fa6]">{savedCredential.last_four}</span>
          </span>
          <span className="text-[12px] text-[#919fa6] hidden sm:inline">{new Date(savedCredential.created_at).toLocaleDateString()}</span>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} className="text-[#919fa6] hover:text-loss transition-colors p-0.5" title="Delete"><Trash2 className="w-3 h-3" /></button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={handleDelete} className="text-[12px] font-medium text-loss hover:text-loss/80 transition-colors">Delete</button>
              <span className="text-[#919fa6]">|</span>
              <button onClick={() => setDeleteConfirm(false)} className="text-[12px] text-[#919fa6] hover:text-[#919fa6] transition-colors">Cancel</button>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"} value={value}
            onChange={(e) => { setValue(e.target.value); setStatus("idle"); }}
            placeholder={savedCredential ? "Enter new key to replace…" : placeholder}
            className="w-full bg-[#0a0a0a] border border-border rounded-lg px-3 py-2 pr-10 text-[13px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-border font-mono"
          />
          <button onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#919fa6] hover:text-[#919fa6] transition-colors">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button onClick={handleTest} disabled={!value || status === "loading"}
          className="shrink-0 px-4 py-2 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] hover:border-border disabled:opacity-40 transition-colors flex items-center gap-1.5">
          {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
          {status === "ok" && <CheckCircle2 className="w-3 h-3 text-gain" />}
          {status === "fail" && <span className="w-3 h-3 text-loss">✕</span>}
          {savedCredential ? "Replace" : testLabel}
        </button>
      </div>
      {status !== "idle" && msg && <p className={`text-[12px] mt-1 ${status === "ok" ? "text-gain" : "text-loss"}`}>{msg}</p>}
      {note && <p className="text-[12px] text-[#919fa6] mt-1">{note}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={<div className="animate-fade-in"><h1 className="text-[22px] md:text-[28px] font-bold text-[#ffffff] tracking-tight">Settings</h1><p className="text-[13px] text-[#919fa6] mt-1">Loading...</p></div>}>
      <SettingsPage />
    </Suspense>
  );
}

function SettingsPage() {
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const { agents, refresh: refreshAgents } = useAgents();
  const { showTicker, setShowTicker } = useTickerPreferences();
  const supabase = useMemo(() => createClient(), []);

  // Active tab (read from URL ?tab= param, default to "account")
  const tabParam = searchParams.get("tab");
  const initialTab = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "account";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Exchange connect modal state
  const [connectExchange, setConnectExchange] = useState<ExchangeProvider | null>(null);

  // Profile editing
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(AVATAR_COLORS[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveMsg, setProfileSaveMsg] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [cfBackfilling, setCfBackfilling] = useState(false);
  const [cfBackfillResult, setCfBackfillResult] = useState<string | null>(null);

  // Initialize profile fields when profile loads
  useEffect(() => {
    if (profile) {
      setEditName(profile.display_name || "");
      setEditColor(profile.avatar_url && AVATAR_COLORS.includes(profile.avatar_url) ? profile.avatar_url : AVATAR_COLORS[0]);
    }
  }, [profile]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    if (showColorPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColorPicker]);

  const profileDirty = editName !== (profile?.display_name || "") || editColor !== (profile?.avatar_url || AVATAR_COLORS[0]);

  const handleProfileSave = async () => {
    if (!user || !editName.trim()) return;
    setProfileSaving(true);
    setProfileSaveMsg("");
    try {
      const { error } = await supabase.from("user_profiles").update({ display_name: editName.trim(), avatar_url: editColor }).eq("id", user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      setProfileSaveMsg("Saved");
      setTimeout(() => setProfileSaveMsg(""), 2000);
    } catch (err) {
      setProfileSaveMsg(err instanceof Error ? err.message : "Failed to save");
    }
    setProfileSaving(false);
  };

  // Trading mode
  const [tradingMode, setTradingMode] = useState<"training" | "live">("training");
  const [confirmLive, setConfirmLive] = useState(false);
  const [liveNotEnabledModal, setLiveNotEnabledModal] = useState(false);

  // Twitter posting toggle
  const [twitterPostingEnabled, setTwitterPostingEnabled] = useState(false);

  // Global safeguards
  const [globalDailyLossPct, setGlobalDailyLossPct] = useState(10);
  const [globalMaxPositions, setGlobalMaxPositions] = useState(20);
  const [globalMaxTradeSize, setGlobalMaxTradeSize] = useState(200);
  const [globalMaxTradesDay, setGlobalMaxTradesDay] = useState(50);
  const [cooldownHours, setCooldownHours] = useState(0);
  const [maxTradesPerMarket, setMaxTradesPerMarket] = useState(0);
  const [minConfidence, setMinConfidence] = useState(60);
  const [dailyApiBudget, setDailyApiBudget] = useState(50);
  const [tradingHoursStart, setTradingHoursStart] = useState("");
  const [tradingHoursEnd, setTradingHoursEnd] = useState("");
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Credentials
  const [savedCreds, setSavedCreds] = useState<Credential[]>([]);
  const loadCredentials = useCallback(() => { credentialsApi.list().then(setSavedCreds).catch(() => {}); }, []);
  const findCred = (provider: string, keyType: string) => savedCreds.find((c) => c.provider === provider && c.key_type === keyType && c.is_active) || null;

  // Emergency controls
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const runningAgents = agents.filter((a) => a.status === "running" || a.status === "active");

  // Load data
  useEffect(() => { loadCredentials(); }, [loadCredentials]);
  useEffect(() => {
    rulesApi.get().then((r: RulesConfig) => {
      setGlobalMaxTradeSize(r.max_trade_size);
      setGlobalMaxPositions(r.max_concurrent_positions);
      setGlobalDailyLossPct(r.daily_loss_limit);
      setCooldownHours(r.cooldown_hours);
      setMaxTradesPerMarket(r.max_trades_per_market ?? 0);
      setGlobalMaxTradesDay(r.max_trades_per_day);
      setMinConfidence(Math.round((r.min_confidence ?? 0.6) * 100));
      setDailyApiBudget(r.daily_api_budget ?? 50);
      if (r.schedule_active_hours) {
        setTradingHoursStart(r.schedule_active_hours.start || "");
        setTradingHoursEnd(r.schedule_active_hours.end || "");
      }
      setTradingMode(r.live_trading_enabled ? "live" : "training");
      setTwitterPostingEnabled(r.twitter_posting_enabled ?? false);
      setRulesLoaded(true);
    }).catch(() => { setRulesLoaded(true); });
  }, []);

  // Debounced auto-save safeguards
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!rulesLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await rulesApi.update({
          max_trade_size: globalMaxTradeSize, max_concurrent_positions: globalMaxPositions,
          daily_loss_limit: globalDailyLossPct, cooldown_hours: cooldownHours,
          max_trades_per_day: globalMaxTradesDay, max_trades_per_market: maxTradesPerMarket,
          min_confidence: minConfidence / 100, daily_api_budget: dailyApiBudget,
          schedule_interval_minutes: 5, live_trading_enabled: tradingMode === "live",
          twitter_posting_enabled: twitterPostingEnabled,
          schedule_active_hours: (tradingHoursStart && tradingHoursEnd) ? { start: tradingHoursStart, end: tradingHoursEnd } : undefined,
        });
        setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2000);
      } catch { setSaveStatus("idle"); }
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalMaxTradeSize, globalMaxPositions, globalDailyLossPct, cooldownHours, maxTradesPerMarket, globalMaxTradesDay, minConfidence, dailyApiBudget, tradingHoursStart, tradingHoursEnd, tradingMode, twitterPostingEnabled, rulesLoaded]);

  const handleStopAll = async () => { setActionLoading(true); setShowStopConfirm(false); try { await agentsApi.stopAll(); await refreshAgents(); } catch {} setActionLoading(false); };
  const handleKillAll = async () => { setActionLoading(true); setShowKillConfirm(false); try { await agentsApi.killAll(); await refreshAgents(); } catch {} setActionLoading(false); };

  const displayInitials = editName ? getInitials(editName) : (user?.email ? user.email.slice(0, 2).toUpperCase() : "AF");

  return (
    <div className="relative animate-fade-in">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <h1 className="text-[22px] md:text-[28px] font-bold text-[#ffffff] tracking-tight">Settings</h1>
          <PageHelpButton pageKey="settings" />
        </div>
        {saveStatus !== "idle" && (
          <div className="flex items-center gap-1.5 text-[13px] text-[#919fa6]">
            {saveStatus === "saving" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-gain" />}
            {saveStatus === "saving" ? "Saving…" : "Saved"}
          </div>
        )}
      </div>
      <p className="text-[13px] text-[#919fa6] mb-6 md:mb-8">Account-level configuration for all agents</p>

      {/* ── Tab Bar (horizontal) ── */}
      <div className="relative mb-8">
        <div className="flex gap-1 border-b border-border overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                {...(["exchanges", "api-keys", "safeguards"].includes(tab.id) ? { "data-settings-tab": tab.id } : {})}
                className={clsx(
                  "flex items-center gap-2 px-4 py-3 text-[13px] font-medium whitespace-nowrap transition-all border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "text-[#ffffff] border-gain"
                    : "text-[#919fa6] border-transparent hover:text-[#919fa6]"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Fade indicator for scrollable tabs on mobile */}
        <div className="absolute right-0 top-0 bottom-px w-8 bg-gradient-to-l from-[#0a0a0a] to-transparent pointer-events-none sm:hidden" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* ── MAIN: Tab Content ── */}
        <div className="min-w-0 pb-8">
          {/* ═══ ACCOUNT TAB ═══ */}
          {activeTab === "account" && (
            <div className="animate-fade-in">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">Account</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">Manage your profile and display settings</p>

              {/* Avatar + Name editor */}
              <div className="bg-white/[0.02] border border-border rounded-xl p-6 mb-5">
                <div className="flex items-center gap-4">
                  {/* Clickable avatar — opens color popover */}
                  <div className="relative shrink-0" ref={colorPickerRef}>
                    <button
                      onClick={() => setShowColorPicker((v) => !v)}
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold transition-colors ring-2 ring-transparent hover:ring-white/20"
                      style={{ backgroundColor: editColor, color: getTextColor(editColor) }}
                      title="Change color"
                    >
                      {displayInitials}
                    </button>
                    {showColorPicker && (
                      <div className="absolute right-0 left-auto sm:left-0 sm:right-auto top-14 z-50 bg-[#111] border border-border rounded-xl p-2.5 shadow-xl flex gap-2">
                        {AVATAR_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => { setEditColor(color); setShowColorPicker(false); }}
                            className={clsx(
                              "w-6 h-6 rounded-full border-2 transition-all",
                              editColor === color ? "border-border scale-110" : "border-transparent hover:border-border"
                            )}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your name"
                      className="w-full max-w-full sm:max-w-[240px] bg-[#0a0a0a] border border-border rounded-lg px-3 py-2 text-[14px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-border transition-colors"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {profileSaveMsg && (
                      <span className={`text-[12px] ${profileSaveMsg === "Saved" ? "text-gain" : "text-loss"}`}>
                        {profileSaveMsg}
                      </span>
                    )}
                    <button
                      onClick={handleProfileSave}
                      disabled={profileSaving || !profileDirty || !editName.trim()}
                      className="px-4 py-1.5 rounded-full border border-border text-[#ffffff] text-[12px] font-medium hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      {profileSaving ? "Saving\u2026" : "Save"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Account info rows */}
              <div className="bg-white/[0.02] border border-border rounded-xl divide-y divide-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[13px] text-[#919fa6]">Email</span>
                  <span className="text-[13px] text-[#919fa6] truncate ml-4">{user?.email || "\u2014"}</span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[13px] text-[#919fa6]">Live Trading</span>
                  <span className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full ${profile?.live_enabled ? "bg-gain/10 text-gain" : "bg-white/[0.04] text-[#919fa6]"}`}>
                    {profile?.live_enabled ? "Enabled" : "Not Enabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[13px] text-[#919fa6]">Active Agents</span>
                  <span className="text-[13px] text-[#ffffff] font-medium tabular-nums">
                    {runningAgents.length} of {agents.length}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <span className="text-[13px] text-[#919fa6]">Show Trade Ticker</span>
                    <p className="text-[11px] text-[#919fa6] mt-0.5">Scrolling banner showing live trade activity</p>
                  </div>
                  <button
                    onClick={() => setShowTicker(!showTicker)}
                    className={clsx(
                      "relative w-10 h-[22px] rounded-full transition-colors",
                      showTicker ? "bg-gain" : "bg-white/10"
                    )}
                  >
                    <div className={clsx(
                      "absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform",
                      showTicker ? "left-[22px]" : "left-[3px]"
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <span className="text-[13px] text-[#919fa6]">Public Trade Sharing</span>
                    <p className="text-[11px] text-[#919fa6] mt-0.5">Allow anyone with a link to view your trade details</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!user) return;
                      const newVal = !(profile?.trades_public ?? false);
                      await supabase.from("user_profiles").update({ trades_public: newVal }).eq("id", user.id);
                      await refreshProfile();
                    }}
                    className={clsx(
                      "relative w-10 h-[22px] rounded-full transition-colors",
                      profile?.trades_public ? "bg-gain" : "bg-white/10"
                    )}
                  >
                    <div className={clsx(
                      "absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform",
                      profile?.trades_public ? "left-[22px]" : "left-[3px]"
                    )} />
                  </button>
                </div>
              </div>

              {/* Data Maintenance */}
              <div className="bg-white/[0.02] border border-border rounded-xl p-5 mt-5">
                <h3 className="text-[14px] font-semibold text-[#ffffff] mb-1">Data Maintenance</h3>
                <p className="text-[12px] text-[#919fa6] mb-4">Reconcile your P&L with exchange data, fix partial fill discrepancies, and backfill &quot;What Would Have Happened&quot; outcomes for skipped trades</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={async () => {
                      setReconciling(true);
                      setReconcileResult(null);
                      try {
                        const res = await portfolioApi.reconcilePnl();
                        setReconcileResult(res.message);
                      } catch {
                        setReconcileResult("Failed to reconcile. Please try again.");
                      } finally {
                        setReconciling(false);
                      }
                    }}
                    disabled={reconciling}
                    className="px-4 py-2 rounded-lg bg-white/[0.04] border border-border text-[13px] text-[#ffffff] font-medium hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {reconciling ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Reconciling...
                      </span>
                    ) : "Reconcile P&L"}
                  </button>
                  <button
                    onClick={async () => {
                      setCfBackfilling(true);
                      setCfBackfillResult(null);
                      try {
                        const res = await portfolioApi.backfillCounterfactuals();
                        setCfBackfillResult(`Done: ${res.resolved} resolved, ${res.still_open} still open`);
                      } catch {
                        setCfBackfillResult("Failed to backfill. Please try again.");
                      } finally {
                        setCfBackfilling(false);
                      }
                    }}
                    disabled={cfBackfilling}
                    className="px-4 py-2 rounded-lg bg-white/[0.04] border border-border text-[13px] text-[#ffffff] font-medium hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {cfBackfilling ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Backfilling...
                      </span>
                    ) : "Backfill Counterfactuals"}
                  </button>
                  {reconcileResult && (
                    <span className="text-[12px] text-gain">{reconcileResult}</span>
                  )}
                  {cfBackfillResult && (
                    <span className="text-[12px] text-gain">{cfBackfillResult}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ EXCHANGES TAB ═══ */}
          {activeTab === "exchanges" && (
            <div className="animate-fade-in" data-tour="settings-exchanges">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">Exchanges</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">Connect your prediction market accounts</p>

              <div className="space-y-3">
                {EXCHANGE_CONFIGS.map((cfg) => (
                  <ExchangeConnectButton
                    key={cfg.provider}
                    config={cfg}
                    credentials={savedCreds}
                    onClick={() => setConnectExchange(cfg.provider)}
                  />
                ))}
              </div>

              <ExchangeConnectModal
                provider={connectExchange}
                open={connectExchange !== null}
                onClose={() => setConnectExchange(null)}
                onCredentialChange={loadCredentials}
                credentials={savedCreds}
              />
            </div>
          )}

          {/* ═══ API KEYS TAB ═══ */}
          {activeTab === "api-keys" && (
            <div className="animate-fade-in" data-tour="settings-api-keys">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">API Keys</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">AI model keys used by your trading agents</p>

              <div className="bg-white/[0.02] border border-border rounded-xl p-5 space-y-5">
                <KeyField label="Claude API Key" placeholder="sk-ant-..." note="Anthropic \u2014 used for AI reasoning." provider="anthropic" keyType="api_key" savedCredential={findCred("anthropic", "api_key")} onCredentialChange={loadCredentials} />
                <KeyField label="OpenAI API Key" placeholder="sk-..." note="OpenAI \u2014 used for AI reasoning." provider="openai" keyType="api_key" savedCredential={findCred("openai", "api_key")} onCredentialChange={loadCredentials} />
                <KeyField label="OpenRouter API Key" placeholder="sk-or-..." note="Routes to Claude, GPT-4o, Gemini, DeepSeek, Grok." provider="openrouter" keyType="api_key" savedCredential={findCred("openrouter", "api_key")} onCredentialChange={loadCredentials} />
              </div>

              {/* Twitter / X OAuth */}
              <div className="mt-8">
                <TwitterConnectCard />
              </div>
            </div>
          )}

          {/* ═══ SAFEGUARDS TAB ═══ */}
          {activeTab === "safeguards" && (
            <div className="animate-fade-in" data-tour="settings-safeguards">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">Global Safeguards</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">Account-wide limits checked after per-bot rules. The stricter value always wins.</p>

              {/* Lock banner when bots are running */}
              {runningAgents.length > 0 && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-amber-400/[0.06] border border-amber-400/20 mb-6">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-[12px] text-amber-400/80">Settings are locked while agents are running. Stop all agents to make changes.</p>
                </div>
              )}

              {/* Trading Mode */}
              <div className={clsx("bg-white/[0.02] border border-border rounded-xl p-5 mb-6", runningAgents.length > 0 && "opacity-50 pointer-events-none")}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-medium text-[#ffffff]">Trading Mode</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setTradingMode("training")}
                      disabled={runningAgents.length > 0}
                      className={clsx(
                        "px-4 py-1.5 rounded-full text-[12px] font-medium transition-all border",
                        tradingMode === "training"
                          ? "bg-white text-black border-white"
                          : "bg-transparent border-border text-[#919fa6] hover:text-[#919fa6]"
                      )}
                    >Training</button>
                    <button
                      onClick={() => {
                        if (tradingMode !== "live") {
                          if (profile?.live_enabled) setConfirmLive(true);
                          else setLiveNotEnabledModal(true);
                        }
                      }}
                      disabled={runningAgents.length > 0}
                      className={clsx(
                        "px-4 py-1.5 rounded-full text-[12px] font-medium transition-all border",
                        tradingMode === "live"
                          ? "bg-amber-400/10 border-amber-400/20 text-amber-400"
                          : "bg-transparent border-border text-[#919fa6] hover:text-[#919fa6]"
                      )}
                    >Live</button>
                  </div>
                </div>
                {tradingMode === "training" && (
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-border">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-[12px] text-[#919fa6]">Training — trades are simulated, not executed on any exchange.</p>
                  </div>
                )}
                {tradingMode === "live" && (
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-loss/[0.06] border border-loss/20">
                    <span className="w-2 h-2 rounded-full bg-loss shrink-0" />
                    <p className="text-[12px] text-loss/80">Live — approved trades are executed on exchanges with real money.</p>
                  </div>
                )}
              </div>

              {/* Per-bot rules (checked first) */}
              <h4 className="text-[13px] font-medium text-[#919fa6] mb-2">Per-Trade Checks</h4>
              <p className="text-[10px] text-[#919fa6] mb-3">Checked on every trade the bot proposes. 0 = no limit.</p>
              <div className="divide-y divide-white/[0.06] rounded-xl border border-border bg-white/[0.02] p-4">
                <NumberInputRow label="Max Trade Size" value={globalMaxTradeSize} min={0} max={5000} unit="$" onChange={setGlobalMaxTradeSize} hint={globalMaxTradeSize > 0 ? `Reject any single trade above $${globalMaxTradeSize}` : "No per-trade cap"} disabled={runningAgents.length > 0} />
                <NumberInputRow label="Max Open Positions" value={globalMaxPositions} min={0} max={200} onChange={setGlobalMaxPositions} hint={globalMaxPositions > 0 ? `Reject new buys once ${globalMaxPositions} positions are open` : "No position cap"} disabled={runningAgents.length > 0} />
                <NumberInputRow label="Min Confidence Score" value={minConfidence} min={0} max={100} unit="%" onChange={setMinConfidence} hint={minConfidence > 0 ? `Reject trades below ${minConfidence}% confidence` : "No confidence threshold"} disabled={runningAgents.length > 0} />
              </div>

              {/* Account-level checks (checked second) */}
              <h4 className="text-[13px] font-medium text-[#919fa6] mt-6 mb-2">Account-Level Limits</h4>
              <p className="text-[10px] text-[#919fa6] mb-3">Checked after per-trade rules pass. These look at daily totals and budgets.</p>
              <div className="divide-y divide-white/[0.06] rounded-xl border border-border bg-white/[0.02] p-4">
                <NumberInputRow label="Daily Loss Limit" value={globalDailyLossPct} min={0} max={100} unit="$" onChange={setGlobalDailyLossPct} hint={globalDailyLossPct > 0 ? `Kill switch — pause all agents if losses exceed $${globalDailyLossPct} today` : "No loss limit"} disabled={runningAgents.length > 0} />
                <NumberInputRow label="Max Trades / Day" value={globalMaxTradesDay} min={0} max={500} onChange={setGlobalMaxTradesDay} hint={globalMaxTradesDay > 0 ? `Reject after ${globalMaxTradesDay} total trades across all bots today` : "No daily trade limit"} disabled={runningAgents.length > 0} />
                <NumberInputRow label="Max Trades Per Market" value={maxTradesPerMarket} min={0} max={50} onChange={setMaxTradesPerMarket} hint={maxTradesPerMarket > 0 ? `Reject after ${maxTradesPerMarket} trades on any single market` : "No per-market limit"} disabled={runningAgents.length > 0} />
                <NumberInputRow label="Daily AI Budget" value={dailyApiBudget} min={0} max={500} unit="$" onChange={setDailyApiBudget} hint={dailyApiBudget > 0 ? `Stop trading when AI costs exceed $${dailyApiBudget}/day` : "No AI budget limit"} disabled={runningAgents.length > 0} />
              </div>

              {/* Trading Hours */}
              <div className="mt-6">
                <div className="mb-3">
                  <span className="text-[13px] text-[#919fa6] font-medium">Active Trading Hours (UTC)</span>
                  <p className="text-[11px] text-[#919fa6] mt-0.5">Bots will only place new trades within this window. Leave empty for 24/7 trading.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input type="time" value={tradingHoursStart} onChange={(e) => setTradingHoursStart(e.target.value)}
                    className="bg-[#0a0a0a] border border-border rounded-lg px-3 py-2 text-[13px] text-[#ffffff] w-full sm:w-32 focus:outline-none focus:border-border" placeholder="09:00" disabled={runningAgents.length > 0} />
                  <span className="text-[12px] text-[#919fa6]">to</span>
                  <input type="time" value={tradingHoursEnd} onChange={(e) => setTradingHoursEnd(e.target.value)}
                    className="bg-[#0a0a0a] border border-border rounded-lg px-3 py-2 text-[13px] text-[#ffffff] w-full sm:w-32 focus:outline-none focus:border-border" placeholder="17:00" disabled={runningAgents.length > 0} />
                  {tradingHoursStart && tradingHoursEnd && (
                    <button onClick={() => { setTradingHoursStart(""); setTradingHoursEnd(""); }} className="text-[11px] text-[#919fa6] hover:text-[#919fa6] transition-colors">Clear</button>
                  )}
                </div>
                {tradingHoursStart && tradingHoursEnd && (
                  <p className="text-[11px] text-[#919fa6] mt-2">Active: {tradingHoursStart} – {tradingHoursEnd} UTC</p>
                )}
              </div>

              {/* Integrations */}
              <h4 className="text-[13px] font-medium text-[#919fa6] mt-6 mb-2">Integrations</h4>
              <div className="rounded-xl border border-border bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 mr-4">
                    <span className="text-[13px] font-medium text-[#ffffff]">Enable Twitter Posting</span>
                    <p className="text-[11px] text-[#919fa6] mt-0.5">Automatically post trade updates to your connected Twitter/X account</p>
                  </div>
                  <button
                    onClick={() => setTwitterPostingEnabled(!twitterPostingEnabled)}
                    className={clsx(
                      "relative w-10 h-[22px] rounded-full transition-colors shrink-0",
                      twitterPostingEnabled ? "bg-gain" : "bg-white/10"
                    )}
                  >
                    <div className={clsx(
                      "absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform",
                      twitterPostingEnabled ? "left-[22px]" : "left-[3px]"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SECURITY TAB ═══ */}
          {activeTab === "security" && (
            <div className="animate-fade-in">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">Security</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">Manage two-factor authentication and account security</p>
              <MFASettings />
            </div>
          )}

          {/* ═══ ABOUT TAB ═══ */}
          {activeTab === "about" && (
            <div className="animate-fade-in">
              <h2 className="text-[20px] font-bold text-[#ffffff] mb-1">About Prediction Market Agents</h2>
              <p className="text-[13px] text-[#919fa6] mb-6">Platform documentation and resources.</p>
              <div className="space-y-2.5">
                {[
                  { label: "Platform Overview", desc: "How Prediction Market Agents works \u2014 architecture, agents, and trading pipeline", href: "/about/overview" },
                  { label: "The Council Strategy", desc: "Multi-agent debate system for prediction market trading", href: "/about/council" },
                  { label: "Safeguards & Rules", desc: "How the rules engine protects your capital", href: "/about/safeguards" },
                  { label: "Getting Started", desc: "Step-by-step guide to deploying your first agent", href: "/about" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between p-4 bg-white/[0.02] border border-border rounded-xl hover:border-border hover:bg-white/[0.03] transition-colors group"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-[#ffffff] group-hover:text-gain transition-colors">{item.label}</div>
                      <div className="text-[12px] text-[#919fa6] mt-0.5">{item.desc}</div>
                    </div>
                    <span className="text-[#919fa6] group-hover:text-gain transition-colors">{"\u2192"}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Agent Controls (desktop) ── */}
        <div className="hidden lg:block">
          <div className="sticky top-[120px]">
            <div className="bg-white/[0.02] border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-[#ffffff]">Agent Controls</h3>
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/[0.04] border border-border text-[#919fa6] tabular-nums">{runningAgents.length} running</span>
              </div>

              {runningAgents.length > 0 ? (
                <div className="mb-4 space-y-2">
                  {runningAgents.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5 text-[13px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse shrink-0" />
                      <span className="text-[#919fa6] truncate flex-1">{a.name}</span>
                      <span className="text-[#919fa6] text-[11px]">{a.trade_count} trade{a.trade_count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                  {runningAgents.length > 5 && <p className="text-[12px] text-[#919fa6] pl-4">+{runningAgents.length - 5} more</p>}
                </div>
              ) : (
                <div className="mb-4 py-3 text-center"><p className="text-[13px] text-[#919fa6]">No agents running</p></div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowStopConfirm(true)} disabled={actionLoading || runningAgents.length === 0}
                  className={clsx("flex-1 py-2.5 rounded-full border border-amber-400/30 text-amber-400 text-[13px] font-medium hover:bg-amber-400/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed", actionLoading && "opacity-50 cursor-wait")}>
                  <Square className="w-3.5 h-3.5" /> Stop All
                </button>
                <button onClick={() => setShowKillConfirm(true)} disabled={actionLoading}
                  className={clsx("flex-1 py-2.5 rounded-full border border-red-400/30 text-red-400 text-[13px] font-medium hover:bg-red-400/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed", actionLoading && "opacity-50 cursor-wait")}>
                  <Radiation className="w-3.5 h-3.5" /> Nuke All
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Agent Controls (below content on tablet/mobile) */}
      <div className="lg:hidden mt-8 pb-8">
        <div className="bg-white/[0.02] border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[#ffffff]">Agent Controls</h3>
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/[0.04] border border-border text-[#919fa6] tabular-nums">{runningAgents.length} running</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowStopConfirm(true)} disabled={actionLoading || runningAgents.length === 0}
              className="flex-1 py-2.5 rounded-full border border-amber-400/30 text-amber-400 text-[13px] font-semibold hover:bg-amber-400/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5">
              <Square className="w-3.5 h-3.5" /> Stop All
            </button>
            <button onClick={() => setShowKillConfirm(true)} disabled={actionLoading}
              className="flex-1 py-2.5 rounded-full border border-loss/30 text-loss text-[13px] font-semibold hover:bg-loss/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5">
              <Radiation className="w-3.5 h-3.5" /> Nuke All
            </button>
          </div>
        </div>
      </div>

      {/* ── Confirm dialogs ── */}
      <ConfirmDialog open={showStopConfirm} title="Stop All Agents" message="This will cancel all pending orders and stop every running agent. You can redeploy them from the Strategies page." confirmLabel="Stop All" danger onConfirm={handleStopAll} onCancel={() => setShowStopConfirm(false)} />
      <ConfirmDialog open={showKillConfirm} title="Nuke All Agents" message="This will force-stop all agents, cancel all pending orders, and cancel all open orders on all exchanges. Trade history is preserved." confirmLabel="Nuke Everything" danger onConfirm={handleKillAll} onCancel={() => setShowKillConfirm(false)} />

      {/* ── Live Not Enabled Modal ── */}
      {liveNotEnabledModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-[#919fa6]" />
              <h3 className="text-[15px] font-semibold text-[#ffffff]">Live Trading Not Enabled</h3>
            </div>
            <p className="text-[13px] text-[#919fa6] mb-1">Your account is not enabled for live trading.</p>
            <p className="text-[13px] text-[#919fa6] mb-6">Use <span className="text-[#ffffff] font-medium">Training mode</span> to see how agents would perform without risking capital.</p>
            <button onClick={() => setLiveNotEnabledModal(false)} className="w-full py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors">Got it</button>
          </div>
        </div>
      )}

      {/* ── Live mode confirmation modal ── */}
      {confirmLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-loss" />
              <h3 className="text-[15px] font-semibold text-[#ffffff]">Enable Live Trading?</h3>
            </div>
            <p className="text-[13px] text-[#919fa6] mb-1">This enables live trading for your account.</p>
            <p className="text-[13px] text-[#919fa6] mb-6">Agents set to Live mode will place real orders on exchanges. Trades are irreversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmLive(false)} className="flex-1 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors">Cancel</button>
              <button onClick={() => { setTradingMode("live"); setConfirmLive(false); }} className="flex-1 py-2.5 rounded-full bg-loss/10 border border-loss/30 text-[13px] font-semibold text-loss hover:bg-loss/15 transition-colors">Enable Live</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
