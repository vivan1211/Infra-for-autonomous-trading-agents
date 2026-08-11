"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Unlink } from "lucide-react";
import { twitterOauth, type TwitterConnectionStatus } from "@/lib/api";

export function TwitterConnectCard() {
  const [status, setStatus] = useState<TwitterConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const s = await twitterOauth.status();
      setStatus(s);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load X status";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Handle redirect back from OAuth callback
    const url = new URL(window.location.href);
    if (url.searchParams.get("twitter_connected") === "1") {
      url.searchParams.delete("twitter_connected");
      window.history.replaceState({}, "", url.toString());
    }
    const errParam = url.searchParams.get("twitter_error");
    if (errParam) {
      setError(`X connect failed: ${errParam}`);
      url.searchParams.delete("twitter_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authorize_url } = await twitterOauth.authorize();
      window.location.href = authorize_url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start X authorization";
      setError(msg);
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect your X account? Trade posts will stop until you reconnect.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await twitterOauth.disconnect();
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to disconnect";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white/[0.02] border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-[15px] font-semibold text-[#ffffff]">X (Twitter)</h3>
      </div>
      <p className="text-[13px] text-[#919fa6] mb-4">
        Connect your X account to auto-post a thread for every executed trade. One-click sign-in — we never see your password.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[#919fa6]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : status?.connected ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-gain shrink-0" />
            <span className="text-[13px] text-[#ffffff] truncate">
              Connected as <span className="font-medium">@{status.username ?? "unknown"}</span>
            </span>
          </div>
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-[#919fa6] hover:text-[#ffffff] hover:bg-white/[0.04] transition-colors disabled:opacity-50 shrink-0"
          >
            <Unlink className="w-3 h-3" /> Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Opening X…" : "Connect X"}
        </button>
      )}

      {error && (
        <p className="mt-3 text-[12px] text-loss">{error}</p>
      )}
    </div>
  );
}
