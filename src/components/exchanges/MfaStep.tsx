"use client";

import { useState, useEffect, useMemo } from "react";
import { Shield, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

interface MfaStepProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function MfaStep({ onComplete, onCancel }: MfaStepProps) {
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<"loading" | "enroll" | "verify">("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkMfa() {
      try {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData?.currentLevel === "aal2") {
          onComplete();
          return;
        }

        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const verified = (factorsData?.totp || []).filter(
          (f: { status: string }) => f.status === "verified"
        );

        if (verified.length > 0) {
          setFactorId(verified[0].id);
          setStatus("verify");
        } else {
          await startEnroll();
        }
      } catch {
        setError("Failed to check MFA status");
        setStatus("enroll");
      }
    }
    checkMfa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError("");
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    if (data) {
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStatus("enroll");
    }
  }

  async function handleVerify() {
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
      setVerifyCode("");
      return;
    }

    await supabase.auth.refreshSession();
    onComplete();
  }

  function handleCancelEnroll() {
    if (factorId && status === "enroll") {
      supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    onCancel();
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#919fa6] mb-3" />
        <p className="text-[13px] text-[#919fa6]">Checking security status...</p>
      </div>
    );
  }

  // Full enrollment: QR + secret + verify
  if (status === "enroll" && qrCode) {
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-border flex items-center justify-center">
              <Shield className="w-6 h-6 text-gain" />
            </div>
          </div>
          <h3 className="text-[18px] font-bold text-[#ffffff] mb-1">Set up two-factor authentication</h3>
          <p className="text-[13px] text-[#919fa6]">
            Required before connecting an exchange. Scan the QR code with your authenticator app.
          </p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-center mb-5">
          <div className="bg-white rounded-xl p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="MFA QR Code" className="w-44 h-44" />
          </div>
        </div>

        {secret && (
          <div className="mb-5">
            <p className="text-[11px] text-[#919fa6] mb-1.5 text-center">Or enter this code manually:</p>
            <div className="flex justify-center">
              <code className="px-4 py-2 rounded-lg bg-[#0a0a0a] border border-border text-[13px] text-[#ffffff] font-mono tracking-wider select-all">
                {secret}
              </code>
            </div>
          </div>
        )}

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
              onClick={handleCancelEnroll}
              className="flex-1 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={verifyCode.length !== 6}
              className="flex-1 py-2.5 rounded-full border border-gain/30 bg-gain/10 text-[13px] font-medium text-gain hover:bg-gain/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Verify & Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Verify-only: already enrolled, just need TOTP
  if (status === "verify") {
    return (
      <div className="animate-fade-in">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-border flex items-center justify-center">
              <Shield className="w-6 h-6 text-gain" />
            </div>
          </div>
          <h3 className="text-[18px] font-bold text-[#ffffff] mb-1">Verify your identity</h3>
          <p className="text-[13px] text-[#919fa6]">
            Enter the 6-digit code from your authenticator app to continue.
          </p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] mb-4">
            {error}
          </div>
        )}

        <div className="max-w-[280px] mx-auto">
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
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-full border border-border text-[13px] font-medium text-[#919fa6] hover:text-[#ffffff] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleVerify}
              disabled={verifyCode.length !== 6}
              className="flex-1 py-2.5 rounded-full border border-gain/30 bg-gain/10 text-[13px] font-medium text-gain hover:bg-gain/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Verify & Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: enrollment without QR (error state)
  return (
    <div className="animate-fade-in text-center py-8">
      {error && (
        <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] mb-4">
          {error}
        </div>
      )}
      <button
        onClick={startEnroll}
        className="px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition-colors"
      >
        Set up two-factor authentication
      </button>
    </div>
  );
}
