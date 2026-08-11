"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();

  // Check if user arrived via a valid recovery link
  // Listen for PASSWORD_RECOVERY event (fires when Supabase processes the recovery token from URL)
  useEffect(() => {
    const supabase = createClient();

    // First check if session already exists (e.g., token already processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
    });

    // Listen for the PASSWORD_RECOVERY event from the URL hash token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasSession(true);
      }
    });

    // If neither fires within 3 seconds, the link is invalid/expired
    const timeout = setTimeout(() => {
      setHasSession((prev) => prev === null ? false : prev);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    }
  }

  function renderContent() {
    // Loading state while checking session
    if (hasSession === null) {
      return (
        <div className="w-full max-w-[420px] text-center">
          <p className="text-[14px] text-[#919fa6]">Verifying reset link...</p>
        </div>
      );
    }

    // No valid recovery session
    if (!hasSession) {
      return (
        <div className="w-full max-w-[420px] space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-loss/10 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-loss" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-[24px] font-display font-bold text-[#ffffff]">Invalid or expired link</h1>
          <p className="text-[14px] text-[#919fa6]">
            This password reset link is invalid or has expired.
            <br />
            Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block px-6 py-2.5 rounded-full border border-border text-[14px] font-semibold text-[#919fa6] hover:bg-white/[0.04] transition-colors"
          >
            Request New Link
          </Link>
        </div>
      );
    }

    if (success) {
      return (
        <div className="w-full max-w-[420px] space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-gain/10 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-gain" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[24px] font-display font-bold text-[#ffffff]">Password updated</h1>
          <p className="text-[14px] text-[#919fa6]">
            Your password has been reset successfully.
            <br />
            Redirecting you to sign in...
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2.5 rounded-full border border-border text-[14px] font-semibold text-[#919fa6] hover:bg-white/[0.04] transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[420px] space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-[28px] font-display font-bold text-[#ffffff] tracking-tight">
            Set new password
          </h1>
          <p className="text-[14px] text-[#919fa6] mt-2 leading-relaxed">
            Choose a new password for your account.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl border border-loss/20 bg-loss/5 text-loss text-[13px]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#919fa6] mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border text-[14px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-gain/50 transition-colors"
              placeholder="Minimum 6 characters"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#919fa6] mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border text-[14px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-gain/50 transition-colors"
              placeholder="Re-enter your new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full border border-border text-[#ffffff] text-[14px] font-semibold hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Updating\u2026" : "Reset Password"}
          </button>
        </form>

        <p className="text-center text-[13px] text-[#919fa6]">
          Remember your password?{" "}
          <Link href="/login" className="text-gain hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: image background */}
      <div className="hidden md:block w-[45%] relative overflow-hidden">
        <Image
          src="/auth-bg.jpg"
          alt="Prediction Market Agents"
          fill
          className="object-cover object-center"
          priority
        />
      </div>

      {/* Right: form */}
      <div className="flex-1 bg-black flex items-center justify-center px-6 py-12 min-h-screen">
        {renderContent()}
      </div>
    </div>
  );
}
