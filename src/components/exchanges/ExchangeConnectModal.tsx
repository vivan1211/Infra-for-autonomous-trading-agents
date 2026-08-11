"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import type { ExchangeProvider, ExchangeConfig } from "./types";
import { EXCHANGE_CONFIGS } from "./types";
import { MfaStep } from "./MfaStep";
import { CredentialStep } from "./CredentialStep";
import type { Credential } from "@/lib/api";

interface ExchangeConnectModalProps {
  provider: ExchangeProvider | null;
  open: boolean;
  onClose: () => void;
  onCredentialChange: () => void;
  credentials: Credential[];
}

export function ExchangeConnectModal({
  provider,
  open,
  onClose,
  onCredentialChange,
  credentials,
}: ExchangeConnectModalProps) {
  const [step, setStep] = useState<"mfa" | "credentials">("mfa");

  const config: ExchangeConfig | undefined = provider
    ? EXCHANGE_CONFIGS.find((c) => c.provider === provider)
    : undefined;

  useEffect(() => {
    if (open) {
      setStep("mfa");
    }
  }, [open, provider]);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener("keydown", handleEsc);
      return () => window.removeEventListener("keydown", handleEsc);
    }
  }, [open, handleEsc]);

  if (!open || !config) return null;

  const stepIndex = step === "mfa" ? 0 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-w-lg w-full mx-4 animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === stepIndex ? "bg-gain" : i < stepIndex ? "bg-gain/40" : "bg-white/10"
                  }`}
                />
              ))}
            </div>
            <span className="text-[12px] text-[#919fa6]">
              Step {stepIndex + 1} of 2
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#919fa6] hover:text-[#ffffff] transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === "mfa" && (
            <MfaStep
              onComplete={() => setStep("credentials")}
              onCancel={onClose}
            />
          )}
          {step === "credentials" && (
            <CredentialStep
              config={config}
              existingCredentials={credentials}
              onSaved={() => {
                onCredentialChange();
              }}
              onCancel={onClose}
              onDisconnect={() => {
                onCredentialChange();
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
