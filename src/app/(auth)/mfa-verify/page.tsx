"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { createClient } from "@/lib/supabase";
import { Shield, Loader2 } from "lucide-react";

function getSafeReturnUrl(): string {
  if (typeof window === 'undefined') return "/portfolio";
  const url = sessionStorage.getItem('mfa_return_url');
  sessionStorage.removeItem('mfa_return_url');
  if (url && url.startsWith('/') && !url.startsWith('//')) return url;
  return "/portfolio";
}

export default function MFAVerifyPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { verifyMFA, session, signOut } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function findFactor() {
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aalData || aalData.currentLevel === "aal2") {
        router.replace(getSafeReturnUrl());
        return;
      }

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactors = (factorsData?.totp || []).filter(
        (f: { status: string }) => f.status === "verified"
      );

      if (totpFactors.length === 0) {
        router.replace("/portfolio");
        return;
      }

      setFactorId(totpFactors[0].id);
      setPageLoading(false);
    }
    findFactor();
  }, [session, supabase, router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;

    setError("");
    setLoading(true);
    const result = await verifyMFA(factorId, code);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      setCode("");
    } else {
      router.replace(getSafeReturnUrl());
    }
  }

  async function handleCancel() {
    await signOut();
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: image background (matches login page) */}
      <div className="hidden md:block w-[45%] relative overflow-hidden">
        <Image
          src="/auth-bg.jpg"
          alt="Prediction Market Agents"
          fill
          className="object-cover object-center"
        />
      </div>

      {/* Right: MFA form */}
      <div className="flex-1 bg-black flex items-center justify-center px-6 py-12 min-h-screen">
        {pageLoading ? (
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#919fa6]" />
          </div>
        ) : (
          <div className="w-full max-w-[420px] space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 rounded-full bg-gain/[0.08] border border-gain/20 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-gain" />
                </div>
              </div>
              <h1 className="text-[28px] font-display font-bold text-[#ffffff] tracking-tight">
                Two-factor verification
              </h1>
              <p className="text-[14px] text-[#919fa6] mt-2 leading-relaxed max-w-[320px] mx-auto">
                Enter the 6-digit code from your authenticator app to continue.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleVerify} className="space-y-5">
              {error && (
                <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px] text-center">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-[#919fa6] mb-2 uppercase tracking-wider">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                  className="w-full px-4 py-4 rounded-xl bg-white/[0.03] border border-border text-[24px] text-[#ffffff] text-center font-mono tracking-[0.6em] placeholder:text-white/20 placeholder:tracking-[0.6em] focus:outline-none focus:border-gain/50 focus:ring-1 focus:ring-gain/20 transition-all"
                  placeholder="000000"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3.5 rounded-full bg-gain text-black text-[14px] font-semibold hover:bg-gain/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "Verifying\u2026" : "Verify & Continue"}
              </button>
            </form>

            <div className="pt-2 text-center">
              <button
                onClick={handleCancel}
                className="text-[13px] text-[#919fa6] hover:text-white transition-colors"
              >
                Sign in with a different account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
