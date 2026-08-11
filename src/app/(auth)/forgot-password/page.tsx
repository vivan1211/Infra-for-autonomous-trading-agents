"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/auth/callback?type=recovery",
    });

    setLoading(false);

    // Always show success to prevent user enumeration
    // (don't reveal whether the email exists in the system)
    if (error && error.message?.toLowerCase().includes("rate limit")) {
      setError("Too many requests. Please try again later.");
    } else {
      setSuccess(true);
    }
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
        {success ? (
          <div className="w-full max-w-[420px] space-y-6 text-center">
            <div className="w-14 h-14 rounded-full bg-gain/10 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-gain" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="text-[24px] font-display font-bold text-[#ffffff]">Check your email</h1>
            <p className="text-[14px] text-[#919fa6]">
              We sent a password reset link to{" "}
              <span className="text-[#ffffff]">{email}</span>.
              <br />
              Click it to set a new password.
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-2.5 rounded-full border border-border text-[14px] font-semibold text-[#919fa6] hover:bg-white/[0.04] transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-[420px] space-y-8">
            {/* Header */}
            <div className="text-center">
              <h1 className="text-[28px] font-display font-bold text-[#ffffff] tracking-tight">
                Reset your password
              </h1>
              <p className="text-[14px] text-[#919fa6] mt-2 leading-relaxed">
                Enter your email and we&apos;ll send you a reset link.
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
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border text-[14px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-gain/50 transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-full border border-border text-[#ffffff] text-[14px] font-semibold hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Sending\u2026" : "Send Reset Link"}
              </button>
            </form>

            <p className="text-center text-[13px] text-[#919fa6]">
              Remember your password?{" "}
              <Link href="/login" className="text-gain hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
