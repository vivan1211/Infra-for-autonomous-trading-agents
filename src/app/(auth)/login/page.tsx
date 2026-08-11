"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithProvider, user, profile, loading: authLoading, profileLoading } = useAuth();
  const router = useRouter();

  // Navigate based on auth + onboarding status
  useEffect(() => {
    if (!authLoading && !profileLoading && user) {
      if (profile && !profile.onboarding_completed) {
        router.replace("/onboarding");
      } else {
        router.replace("/portfolio");
      }
    }
  }, [user, authLoading, profileLoading, profile, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.mfaRequired) {
      router.push("/mfa-verify");
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
        <div className="w-full max-w-[420px] space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-[28px] font-display font-bold text-[#ffffff] tracking-tight">
              Welcome back
            </h1>
            <p className="text-[14px] text-[#919fa6] mt-2 leading-relaxed">
              Sign in to manage your trading agents.
            </p>
          </div>

          {/* OAuth */}
          <button
            type="button"
            onClick={() => signInWithProvider("x")}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-full border border-border text-[#ffffff] text-[14px] font-semibold hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            Continue with X
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[12px] text-[#919fa6]">or</span>
            <div className="flex-1 h-px bg-border" />
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

            <div>
              <label className="block text-[12px] font-medium text-[#919fa6] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border text-[14px] text-[#ffffff] placeholder:text-[#919fa6] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full border border-border text-[#ffffff] text-[14px] font-semibold hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Signing in\u2026" : "Sign In"}
            </button>

            <p className="text-right">
              <Link href="/forgot-password" className="text-[13px] text-[#919fa6] hover:text-gain transition-colors">
                Forgot password?
              </Link>
            </p>
          </form>

          <p className="text-center text-[13px] text-[#919fa6]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-gain hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
