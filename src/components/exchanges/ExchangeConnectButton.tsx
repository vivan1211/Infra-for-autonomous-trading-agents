"use client";

import { CheckCircle2 } from "lucide-react";
import type { ExchangeConfig } from "./types";
import type { Credential } from "@/lib/api";

interface ExchangeConnectButtonProps {
  config: ExchangeConfig;
  credentials: Credential[];
  onClick: () => void;
}

export function ExchangeConnectButton({ config, credentials, onClick }: ExchangeConnectButtonProps) {
  const connected = config.fields.some((f) =>
    credentials.some(
      (c) => c.provider === config.provider && c.key_type === f.keyType && c.is_active
    )
  );

  const primaryField = config.fields[0];
  const primaryCred = credentials.find(
    (c) => c.provider === config.provider && c.key_type === primaryField.keyType && c.is_active
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-xl border transition-all ${
        connected
          ? "bg-gain/[0.04] border-gain/20 hover:border-gain/40"
          : "bg-white/[0.02] border-border hover:border-white/[0.2]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[15px] font-semibold text-[#ffffff]">{config.name}</span>
            {connected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-gain">
                <span className="w-1.5 h-1.5 rounded-full bg-gain" />
                Connected
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#919fa6]">{config.description}</p>
          {connected && primaryCred && (
            <p className="text-[11px] text-[#919fa6] mt-1 font-mono">
              ****{primaryCred.last_four}
            </p>
          )}
        </div>
        <div>
          {connected ? (
            <CheckCircle2 className="w-5 h-5 text-gain" />
          ) : (
            <span className="px-4 py-1.5 rounded-full bg-gain text-black text-[12px] font-semibold">
              Connect
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
