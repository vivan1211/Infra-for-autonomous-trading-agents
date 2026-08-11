"use client";

import { useState, useEffect, useMemo } from "react";
import { Shield, ShieldCheck, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

export function MFASettings() {
  const supabase = useMemo(() => createClient(), []);
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string; status: string; created_at: string }[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  // Fetch existing MFA factors
  useEffect(() => {
    async function loadFactors() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (data) {
        // Only show verified factors
        setFactors((data.totp || []).filter((f: { status: string }) => f.status === "verified"));
      }
      if (error) console.error("MFA list error:", error.message);
      setLoading(false);
    }
    loadFactors();
  }, [supabase]);

  // Start enrollment
  async function startEnroll() {
    setError("");
    setSuccess("");
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });
    if (error) {
      setError(error.message);
      setEnrolling(false);
      return;
    }
    if (data) {
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    }
  }

  // Cancel enrollment
  function cancelEnroll() {
    // Unenroll the pending factor if we have one
    if (factorId) {
      supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    setError("");
  }

  // Verify the TOTP code to complete enrollment
  async function verifyEnrollment() {
    if (!factorId || verifyCode.length !== 6) return;
    setError("");

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    // Success — refresh factors list
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    setSuccess("Two-factor authentication enabled successfully.");
    setTimeout(() => setSuccess(""), 4000);
    const { data } = await supabase.auth.mfa.listFactors();
    if (data) setFactors((data.totp || []).filter((f: { status: string }) => f.status === "verified"));
  }

  // Unenroll a factor (with confirmation)
  async function removeFactor(id: string) {
    if (!window.confirm("Are you sure you want to disable two-factor authentication? This will reduce the security of your account.")) {
      return;
    }
    setRemoving(id);
    setError("");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      setError(error.message);
      setRemoving(null);
      return;
    }
    setFactors(factors.filter((f) => f.id !== id));
    setRemoving(null);
    setSuccess("Two-factor authentication has been disabled.");
    setTimeout(() => setSuccess(""), 4000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-[#919fa6]" />
        <span className="text-[13px] text-[#919fa6]">Loading MFA settings...</span>
      </div>
    );
  }

  const hasVerifiedFactor = factors.length > 0;

  return (
    <div>
      {/* Status banner */}
      <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border mb-5 ${
        hasVerifiedFactor
          ? "bg-gain/[0.06] border-gain/20"
          : "bg-white/[0.02] border-border"
      }`}>
        {hasVerifiedFactor ? (
          <ShieldCheck className="w-5 h-5 text-gain shrink-0" />
        ) : (
          <Shield className="w-5 h-5 text-[#919fa6] shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-medium ${hasVerifiedFactor ? "text-gain" : "text-[#ffffff]"}`}>
            {hasVerifiedFactor ? "Two-factor authentication is enabled" : "Two-factor authentication is not enabled"}
          </p>
          <p className="text-[11px] text-[#919fa6] mt-0.5">
            {hasVerifiedFactor
              ? "Your account is secured with an authenticator app."
              : "Add an extra layer of security by requiring a code from your authenticator app at sign-in."}
          </p>
        </div>
      </div>

      {/* Error / success messages */}
      {error && (
        <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gain/20 bg-gain/5 text-gain text-[13px] mb-4">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Existing factors list */}
      {hasVerifiedFactor && !enrolling && (
        <div className="bg-white/[0.02] border border-border rounded-xl divide-y divide-white/[0.06] overflow-hidden mb-5">
          {factors.map((factor) => (
            <div key={factor.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <ShieldCheck className="w-4 h-4 text-gain shrink-0" />
                <div className="min-w-0">
                  <span className="text-[13px] text-[#ffffff] font-medium">
                    {factor.friendly_name || "Authenticator App"}
                  </span>
                  <p className="text-[11px] text-[#919fa6] mt-0.5">
                    Added {new Date(factor.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFactor(factor.id)}
                disabled={removing === factor.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-[12px] font-medium text-[#919fa6] hover:text-loss hover:border-loss/30 disabled:opacity-40 transition-colors"
              >
                {removing === factor.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Enrollment flow */}
      {enrolling && qrCode ? (
        <div className="bg-white/[0.02] border border-border rounded-xl p-6">
          <h4 className="text-[14px] font-semibold text-[#ffffff] mb-1">
            Set up authenticator app
          </h4>
          <p className="text-[12px] text-[#919fa6] mb-5">
            Scan the QR code below with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code to verify.
          </p>

          {/* QR Code */}
          <div className="flex justify-center mb-5">
            <div className="bg-white rounded-xl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
            </div>
          </div>

          {/* Manual secret */}
          {secret && (
            <div className="mb-5">
              <p className="text-[11px] text-[#919fa6] mb-1.5 text-center">
                Or enter this code manually:
              </p>
              <div className="flex justify-center">
                <code className="px-4 py-2 rounded-lg bg-[#0a0a0a] border border-border text-[13px] text-[#ffffff] font-mono tracking-wider select-all">
                  {secret}
                </code>
              </div>
            </div>
          )}

          {/* Verify code input */}
          <div className="max-w-[280px] mx-auto">
            <label className="block text-[12px] font-medium text-[#919fa6] mb-1.5 text-center">
              Enter verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-border text-[18px] text-[#ffffff] text-center font-mono tracking-[0.5em] placeholder:text-[#919fa6] placeholder:tracking-[0.5em] focus:outline-none focus:border-gain/50 transition-colors"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={cancelEnroll}
                className="flex-1 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={verifyEnrollment}
                disabled={verifyCode.length !== 6}
                className="flex-1 py-2.5 rounded-full border border-gain/30 bg-gain/10 text-[13px] font-medium text-gain hover:bg-gain/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Verify & Enable
              </button>
            </div>
          </div>
        </div>
      ) : !enrolling ? (
        <button
          onClick={startEnroll}
          className="px-5 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#ffffff] hover:bg-white/[0.04] transition-colors flex items-center gap-2"
        >
          <Shield className="w-4 h-4" />
          {hasVerifiedFactor ? "Add Another Device" : "Enable Two-Factor Authentication"}
        </button>
      ) : (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[#919fa6]" />
          <span className="text-[13px] text-[#919fa6]">Setting up...</span>
        </div>
      )}
    </div>
  );
}
