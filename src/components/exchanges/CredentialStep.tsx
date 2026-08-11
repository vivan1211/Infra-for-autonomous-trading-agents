"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import { credentials as credentialsApi, type Credential } from "@/lib/api";
import type { ExchangeConfig } from "./types";

interface CredentialStepProps {
  config: ExchangeConfig;
  existingCredentials: Credential[];
  onSaved: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
}

interface FieldState {
  value: string;
  show: boolean;
}

export function CredentialStep({
  config,
  existingCredentials,
  onSaved,
  onCancel,
  onDisconnect,
}: CredentialStepProps) {
  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const initial: Record<string, FieldState> = {};
    config.fields.forEach((f) => {
      initial[f.keyType] = { value: "", show: false };
    });
    return initial;
  });
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const findExisting = (keyType: string) =>
    existingCredentials.find(
      (c) => c.provider === config.provider && c.key_type === keyType && c.is_active
    ) || null;

  const hasAnyExisting = config.fields.some((f) => findExisting(f.keyType));

  const updateField = (keyType: string, patch: Partial<FieldState>) => {
    setFields((prev) => ({ ...prev, [keyType]: { ...prev[keyType], ...patch } }));
  };

  const canSave = config.fields.every(
    (f) => fields[f.keyType]?.value.trim() || findExisting(f.keyType)
  );

  async function handleSave() {
    setStatus("saving");
    setMessage("");
    setBalance(null);

    try {
      if (config.provider === "kalshi") {
        const pkField = fields["private_key"];
        if (pkField?.value.trim()) {
          await credentialsApi.create({
            provider: "kalshi",
            label: "Private Key",
            key_type: "private_key",
            value: pkField.value.trim(),
          });
        }

        const akField = fields["api_key"];
        if (akField?.value.trim()) {
          await credentialsApi.create({
            provider: "kalshi",
            label: "API Key",
            key_type: "api_key",
            value: akField.value.trim(),
          });
        }

        const testValue = akField?.value.trim() || "existing";
        const testResult = await credentialsApi.test({
          provider: "kalshi",
          label: "API Key",
          key_type: "api_key",
          value: testValue,
        });

        if (!testResult.success) {
          setStatus("error");
          setMessage(testResult.message || "Connection test failed");
          return;
        }

        if (testResult.balance !== undefined) {
          setBalance(testResult.balance);
        }
      } else if (config.provider === "polymarket") {
        for (const field of config.fields) {
          const val = fields[field.keyType]?.value.trim();
          if (val) {
            if (field.keyType !== "funder_address" && !val.startsWith("0x") && field.keyType === "private_key") {
              setStatus("error");
              setMessage("Private key must start with 0x");
              return;
            }
            await credentialsApi.create({
              provider: "polymarket",
              label: field.label,
              key_type: field.keyType,
              value: val,
            });
          }
        }
      }

      setStatus("success");
      setMessage("Connected successfully");
      setFields((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = { ...next[k], value: "" };
        });
        return next;
      });
      onSaved();
    } catch (err) {
      setStatus("error");
      const errMsg = err instanceof Error ? err.message : "Failed to save credentials";
      if (errMsg.toLowerCase().includes("two-factor") || errMsg.toLowerCase().includes("mfa")) {
        setMessage("Enable 2FA in Settings \u2192 Security before adding exchange keys");
      } else {
        setMessage(errMsg);
      }
    }
  }

  async function handleDisconnect() {
    setStatus("saving");
    try {
      for (const field of config.fields) {
        const existing = findExisting(field.keyType);
        if (existing) {
          await credentialsApi.delete(existing.id);
        }
      }
      setShowDisconnectConfirm(false);
      setStatus("idle");
      setMessage("");
      onDisconnect();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to disconnect");
      setShowDisconnectConfirm(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h3 className="text-[18px] font-bold text-[#ffffff] mb-1">
          Connect {config.name}
        </h3>
        <p className="text-[13px] text-[#919fa6]">{config.description}</p>
      </div>

      {status === "error" && message && (
        <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] mb-4">
          {message}
        </div>
      )}
      {status === "success" && message && (
        <div className="px-4 py-3 rounded-xl border border-gain/20 bg-gain/5 text-gain text-[13px] mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
          {balance !== null && (
            <span className="ml-auto font-mono font-medium">${balance.toFixed(2)}</span>
          )}
        </div>
      )}

      <div className="space-y-4 mb-6">
        {config.fields.map((field) => {
          const existing = findExisting(field.keyType);
          const fieldState = fields[field.keyType];
          return (
            <div key={field.keyType}>
              <label className="block text-[12px] text-[#919fa6] uppercase tracking-wider mb-1.5">
                {field.label}
              </label>

              {existing && (
                <div className="flex items-center gap-2 mb-1.5 px-3 py-1.5 rounded-lg bg-gain/[0.04] border border-gain/20">
                  <CheckCircle2 className="w-3 h-3 text-gain shrink-0" />
                  <span className="text-[12px] text-[#919fa6] flex-1">
                    Saved (ends in <span className="font-mono">{existing.last_four}</span>)
                  </span>
                </div>
              )}

              <div className="relative">
                <input
                  type={fieldState?.show ? "text" : "password"}
                  value={fieldState?.value || ""}
                  onChange={(e) => {
                    updateField(field.keyType, { value: e.target.value });
                    if (status !== "idle") { setStatus("idle"); setMessage(""); }
                  }}
                  placeholder={existing ? "Enter new key to replace\u2026" : field.placeholder}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 pr-10 text-[13px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-gain/30 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={() => updateField(field.keyType, { show: !fieldState?.show })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#919fa6] hover:text-[#ffffff] transition-colors"
                >
                  {fieldState?.show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="mt-1.5 flex items-start gap-1">
                <p className="text-[11px] text-[#919fa6] flex-1">{field.helpText}</p>
                <a
                  href={field.helpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#919fa6] hover:text-gain transition-colors flex items-center gap-0.5 shrink-0"
                >
                  Docs <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <p className="text-[11px] text-[#919fa6] mt-0.5 italic">{field.permissionsNote}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || status === "saving"}
          className="flex-1 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {status === "success" ? "Saved" : "Test & Save"}
        </button>
      </div>

      {hasAnyExisting && (
        <div className="mt-6 pt-6 border-t border-border">
          {!showDisconnectConfirm ? (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="text-[13px] text-loss hover:text-loss/80 transition-colors"
            >
              Disconnect {config.name}
            </button>
          ) : (
            <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-loss shrink-0 mt-0.5" />
                <p className="text-[13px] text-loss">
                  This will remove all {config.name} credentials and stop any running bots using this exchange.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="px-4 py-1.5 rounded-full border border-border text-[12px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors"
                >
                  Keep Connected
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={status === "saving"}
                  className="px-4 py-1.5 rounded-full bg-loss text-white text-[12px] font-semibold hover:bg-loss/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {status === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
