"use client";

import { useState } from "react";
import Link from "next/link";
import { Square, Radiation } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { agents as agentsApi } from "@/lib/api";

interface ActionBarProps {
  anyBotRunning: boolean;
  refreshAgents: () => void;
  addToast: (type: "success" | "error", message: string) => void;
}

export function ActionBar({ anyBotRunning, refreshAgents, addToast }: ActionBarProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);

  const handleStopAll = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setShowStopConfirm(false);
    try {
      await agentsApi.stopAll();
      addToast("success", "All agents stopped");
      refreshAgents();
    } catch (err) {
      addToast("error", `Failed to stop: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleNukeAll = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setShowNukeConfirm(false);
    try {
      await agentsApi.killAll();
      addToast("success", "Kill switch activated — all agents stopped, keys deleted");
      refreshAgents();
    } catch (err) {
      addToast("error", `Failed to nuke: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {anyBotRunning ? (
          <>
            <button
              data-tour="stop-all-btn"
              onClick={() => setShowStopConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/30 text-[12px] font-medium text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-30"
            >
              <Square className="w-3 h-3" />
              Stop All
            </button>
            <button
              data-tour="nuke-btn"
              onClick={() => setShowNukeConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400/30 text-[12px] font-medium text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30"
            >
              <Radiation className="w-3 h-3" />
              Nuke
            </button>
          </>
        ) : (
          <Link
            href="/strategy"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gain/30 text-[12px] font-medium text-gain hover:bg-gain/10 transition-colors"
          >
            Start Trading
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={showStopConfirm}
        title="Stop All Agents?"
        message="Stop all running agents? Pending orders will be cancelled and agent processes will end. You can redeploy from the Strategies page."
        confirmLabel="Stop All"
        onConfirm={handleStopAll}
        onCancel={() => setShowStopConfirm(false)}
      />
      <ConfirmDialog
        open={showNukeConfirm}
        title="Nuke All Agents?"
        message="Kill everything? This force-stops all agents, cancels pending orders, and deletes all API keys. You will need to re-enter credentials to deploy again."
        confirmLabel="Nuke"
        danger
        onConfirm={handleNukeAll}
        onCancel={() => setShowNukeConfirm(false)}
      />
    </>
  );
}
