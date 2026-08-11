"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { createClient } from "@/lib/supabase";
import { AGREEMENT_PARAGRAPHS } from "@/lib/agreement-data";

/* ─── Geometric wireframe illustrations for each step ─── */

// Step 1: 3D isometric concentric arches (like Robinhood signup — bright, bold)
function ArchesIllustration() {
  return (
    <svg viewBox="0 0 420 480" fill="none" className="w-full h-full max-w-[380px]">
      {/* Outer arch — largest, with 3D depth lines */}
      <path d="M 10 480 A 200 200 0 0 1 410 480" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
      <path d="M 10 480 L 10 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 410 480 L 410 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 10 465 A 200 200 0 0 1 410 465" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />

      {/* Second arch */}
      <path d="M 60 480 A 155 155 0 0 1 360 480" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
      <path d="M 60 480 L 60 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 360 480 L 360 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 60 465 A 155 155 0 0 1 360 465" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />

      {/* Third arch */}
      <path d="M 105 480 A 115 115 0 0 1 315 480" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
      <path d="M 105 480 L 105 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 315 480 L 315 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 105 465 A 115 115 0 0 1 315 465" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />

      {/* Fourth arch — innermost */}
      <path d="M 145 480 A 80 80 0 0 1 275 480" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
      <path d="M 145 480 L 145 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 275 480 L 275 465" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <path d="M 145 465 A 80 80 0 0 1 275 465" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />

      {/* Center concentric circles */}
      <ellipse cx="210" cy="480" rx="50" ry="50" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8" fill="none" />
      <ellipse cx="210" cy="480" rx="35" ry="35" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" fill="none" />
      <ellipse cx="210" cy="480" rx="22" ry="22" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" fill="none" />
      <ellipse cx="210" cy="480" rx="10" ry="10" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" fill="none" />
      <circle cx="210" cy="480" r="3" fill="rgba(255,255,255,0.15)" />
    </svg>
  );
}

// Step 2: Envelope/mail
function EnvelopeIllustration() {
  return (
    <svg viewBox="0 0 400 400" fill="none" className="w-full h-full max-w-[280px]">
      <rect x="60" y="120" width="280" height="180" rx="12" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <path d="M60 132 L200 230 L340 132" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" fill="none" />
      <path d="M60 300 L160 220" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <path d="M340 300 L240 220" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      {/* Decorative circles */}
      <circle cx="200" cy="100" r="25" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
      <circle cx="200" cy="100" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="1" fill="none" />
    </svg>
  );
}

// Step 3: User/person
function UserIllustration() {
  return (
    <svg viewBox="0 0 400 400" fill="none" className="w-full h-full max-w-[280px]">
      {/* Head */}
      <circle cx="200" cy="140" r="55" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
      <circle cx="200" cy="140" r="40" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
      {/* Body */}
      <path d="M110 340 C110 270 150 230 200 230 C250 230 290 270 290 340" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
      <path d="M130 340 C130 285 160 250 200 250 C240 250 270 285 270 340" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
      {/* Decorative lines */}
      <line x1="80" y1="350" x2="320" y2="350" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
    </svg>
  );
}

// Step 4: Shield/document
function ShieldIllustration() {
  return (
    <svg viewBox="0 0 400 450" fill="none" className="w-full h-full max-w-[280px]">
      {/* Shield shape */}
      <path
        d="M200 60 L310 110 L310 250 C310 320 260 380 200 410 C140 380 90 320 90 250 L90 110 Z"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M200 90 L290 130 L290 245 C290 305 250 355 200 380 C150 355 110 305 110 245 L110 130 Z"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
        fill="none"
      />
      {/* Checkmark */}
      <path d="M165 230 L190 255 L240 195" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ─── Step indicator dots (unused, kept for reference) ─── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 bg-[#00C807]"
              : i < current
              ? "w-4 bg-[#00C807]/40"
              : "w-4 bg-[#1a1a1a]"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Avatar colors ─── */
const AVATAR_COLORS = [
  "#00C807", "#FF6B8A", "#4F46E5", "#F59E0B", "#10B981", "#8B5CF6",
];


/* ─── Left panel content per step ─── */
const STEP_CONTENT = [
  {
    title: "Create your\naccount",
    subtitle: "Start deploying AI trading agents.",
    illustration: <ArchesIllustration />,
  },
  {
    title: "Check your\nemail",
    subtitle: "We sent a confirmation link to verify your address.",
    illustration: <EnvelopeIllustration />,
  },
  {
    title: "Tell us\nabout you",
    subtitle: "Set up your profile to get started.",
    illustration: <UserIllustration />,
  },
  {
    title: "Almost\nthere",
    subtitle: "Review and accept our terms to start trading.",
    illustration: <ShieldIllustration />,
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   Main Signup Page — 4-step flow
   ═══════════════════════════════════════════════════════════════════════ */
export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Profile fields (step 2)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Agreement (step 3)
  const [agreed, setAgreed] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const { signUp, signInWithProvider, user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const displayName = `${firstName} ${lastName}`.trim();

  // Auto-detect: if user is logged in but onboarding not done, jump to profile step
  useEffect(() => {
    if (user && profile && !profile.onboarding_completed && step < 2) {
      setStep(2);
    } else if (user && profile?.onboarding_completed) {
      router.replace("/portfolio");
    }
  }, [user, profile, step, router]);

  // Check URL param for direct step jump (from email callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "profile") {
      setStep(2);
    }
  }, []);

  // ── Step 1: Sign Up ──
  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const result = await signUp(email, password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setStep(1); // Go to email confirmation
    }
  }

  // ── Step 3: Save Profile ──
  async function handleProfileSave() {
    if (!firstName.trim()) {
      setError("Please enter your first name");
      return;
    }
    setError("");
    setLoading(true);
    // Auto-assign random avatar color
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    try {
      const { error: dbError } = await supabase
        .from("user_profiles")
        .update({
          display_name: displayName,
          avatar_url: randomColor,
          linkedin_url: linkedinUrl.trim() || null,
        })
        .eq("id", user!.id);

      if (dbError) throw new Error(dbError.message);
      setStep(3); // Go to agreement
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Accept Agreement ──
  async function handleAccept() {
    setFinishing(true);
    try {
      await supabase
        .from("user_profiles")
        .update({
          onboarding_completed: true,
          agreement_accepted_at: new Date().toISOString(),
        })
        .eq("id", user!.id);
      await refreshProfile();
      router.replace("/portfolio");
    } catch {
      setFinishing(false);
    }
  }

  // ── Render right panel content based on step ──
  function renderRightPanel() {
    switch (step) {
      case 0:
        return (
          <div className="w-full max-w-[460px] space-y-8">
            {/* X OAuth — primary CTA */}
            <button
              type="button"
              onClick={() => signInWithProvider("x")}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full border border-border text-[#ffffff] text-[14px] font-semibold hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              Continue with X
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-[12px] text-[#919fa6]">or</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            <form onSubmit={handleEmailSignup} className="space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-[#FF6B8A] text-[13px] flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                  {error}
                </div>
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-[#ffffff] placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="Email address"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-[#ffffff] placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="Password (at least 6 characters)"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-[#ffffff] placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="Confirm password"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-full bg-white text-black text-[14px] font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Creating account…" : "Continue"}
              </button>
            </form>


          </div>
        );

      case 1:
        return (
          <div className="w-full max-w-[460px] space-y-6 text-center">
            <h2 className="text-[22px] font-display font-bold text-white">Please confirm your email</h2>
            <p className="text-[14px] text-[#919fa6] leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-white font-medium">{email || "your email"}</span>.
              <br />Click the link in your email to activate your account.
            </p>
            <p className="text-[13px] text-[#666]">
              Didn&apos;t receive it?{" "}
              <button
                onClick={async () => {
                  setLoading(true);
                  await signUp(email, password);
                  setLoading(false);
                }}
                className="text-gain hover:underline"
              >
                {loading ? "Sending…" : "Resend email"}
              </button>
            </p>
            <p className="text-[12px] text-[#555] mt-4">
              Already confirmed? Click continue below to proceed.
            </p>

          </div>
        );

      case 2:
        return (
          <div className="w-full max-w-[520px] space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03] text-[#FF6B8A] text-[13px] flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-white mb-1.5">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-white placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="First name"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-white mb-1.5">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-white placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="Last name"
              />
            </div>

            {/* LinkedIn */}
            <div>
              <label className="block text-[12px] font-medium text-white mb-1.5">
                LinkedIn URL <span className="text-[#919fa6] font-normal">(optional — helps with faster approval)</span>
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/20 text-[14px] text-white placeholder:text-[#666] focus:outline-none focus:border-gain/50 transition-colors"
                placeholder="https://linkedin.com/in/your-profile"
              />
            </div>

          </div>
        );

      case 3:
        return (
          <div className="w-full max-w-[640px] space-y-5 flex flex-col" style={{ maxHeight: "calc(100vh - 180px)" }}>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 flex-1 overflow-y-auto text-[12px] text-white/60 leading-[1.8] space-y-2 min-h-0">
              {AGREEMENT_PARAGRAPHS.map((para, i) => (
                <p
                  key={i}
                  className={
                    para.isBold && para.isHeading
                      ? "text-white/90 font-bold text-[12px] uppercase tracking-wider mt-5"
                      : para.isBold
                      ? "text-white/80 font-medium text-[12px]"
                      : para.isHeading
                      ? "text-white/70 font-medium text-[12px] mt-3"
                      : para.text.startsWith("- ")
                      ? "pl-4 text-[12px]"
                      : ""
                  }
                >
                  {para.text}
                </p>
              ))}
            </div>

            <label className="flex items-start gap-3 cursor-pointer shrink-0 pt-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/[0.03] accent-[#00C807]"
              />
              <span className="text-[13px] text-[#919fa6]">
                I have read and agree to the Prediction Market Agents User Agreement,{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">Terms &amp; Conditions</a>
                {" "}and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">Privacy Policy</a>.
              </span>
            </label>

          </div>
        );

      default:
        return null;
    }
  }

  const content = STEP_CONTENT[step];

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: logo top, title + subtitle mid-left, illustration bottom-left ── */}
      <div className="hidden md:flex w-[45%] bg-black flex-col p-10 lg:p-14 relative overflow-hidden min-h-screen">
        {/* Logo — top left, large like Robinhood */}
        <div className="flex items-center gap-2.5 mb-auto">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M25.7 11.2c.5-.1.9-.1 1.3 0 .1-1.1-.3-2.1-1.1-2.8-.8-.7-1.9-.9-2.9-.6l-6.1 1.8c-.5.1-.9.1-1.3 0L9.5 7.8c-1-.3-2.1-.1-2.9.6-.8.7-1.2 1.7-1.1 2.8.4-.1.9-.1 1.3 0l6.1 1.8c.5.1 1 .5 1.2 1l2 5.8c.3 1 1.3 1.6 2.3 1.6s2-.6 2.3-1.6l2-5.8c.2-.5.6-.9 1.2-1l1.8-.8z" fill="white"/>
          </svg>
          <span className="font-sans font-bold text-lg text-white tracking-tight">Prediction Market Agents</span>
        </div>

        {/* Title + subtitle — positioned in the middle-left area */}
        <div className="z-10 mb-auto">
          <h1 className="font-serif text-[clamp(2.2rem,4.5vw,3.8rem)] leading-[1.05] tracking-[-0.02em] text-white whitespace-pre-line mb-4">
            {content.title}
          </h1>
          <p className="text-white/40 text-[15px] leading-relaxed max-w-[340px]">
            {content.subtitle}
          </p>
        </div>

        {/* Illustration — bottom, centered-left */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center" style={{ height: "45%" }}>
          {content.illustration}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 bg-black flex flex-col min-h-screen border-l border-white/20">
        {/* Progress bar — thin line at top */}
        <div className="h-[2px] bg-white/[0.08] w-full">
          <div
            className="h-full bg-white transition-all duration-500"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>

        {/* Form area — vertically + horizontally centered */}
        <div className="flex-1 px-8 md:px-12 lg:px-16 flex flex-col justify-center items-center">
          {/* Mobile-only logo */}
          <div className="md:hidden flex items-center gap-2 mb-8">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M25.7 11.2c.5-.1.9-.1 1.3 0 .1-1.1-.3-2.1-1.1-2.8-.8-.7-1.9-.9-2.9-.6l-6.1 1.8c-.5.1-.9.1-1.3 0L9.5 7.8c-1-.3-2.1-.1-2.9.6-.8.7-1.2 1.7-1.1 2.8.4-.1.9-.1 1.3 0l6.1 1.8c.5.1 1 .5 1.2 1l2 5.8c.3 1 1.3 1.6 2.3 1.6s2-.6 2.3-1.6l2-5.8c.2-.5.6-.9 1.2-1l1.8-.8z" fill="white"/>
            </svg>
            <span className="font-sans font-bold text-sm text-white tracking-tight">Prediction Market Agents</span>
          </div>

          {renderRightPanel()}
        </div>

        {/* "By continuing" text — bottom left, above the divider */}
        {step === 0 && (
          <div className="px-8 md:px-12 lg:px-16 pb-4">
            <p className="text-[13px] text-[#919fa6]">
              By continuing, you agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">Terms &amp; Conditions</a>
              {" "}and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition">Privacy Policy</a>.
            </p>
          </div>
        )}

        {/* Bottom bar — white divider + buttons pinned to bottom */}
        <div className="px-8 md:px-12 lg:px-16 py-5 border-t border-white/20 flex items-center justify-end gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-[13px] text-[#919fa6] hover:text-white transition mr-auto"
            >
              ← Back
            </button>
          )}
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-full border border-white/20 text-[13px] font-medium text-white hover:bg-white/[0.04] transition"
          >
            I already have a login
          </Link>
          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition"
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={loading || !firstName.trim()}
              className="px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 disabled:opacity-50 transition"
            >
              {loading ? "Saving…" : "Continue"}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              onClick={handleAccept}
              disabled={!agreed || finishing}
              className="px-6 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 disabled:opacity-50 transition"
            >
              {finishing ? "Setting up…" : "Accept & Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
