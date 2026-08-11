"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TickerBanner, TopNav } from "@/components/nav";
import { BottomNav } from "@/components/bottom-nav";
import { ConnectBanner } from "@/components/connect-banner";
import { ToastProvider } from "@/components/toast";

import { EnvironmentFilterProvider } from "@/context/environment-filter";
import { TickerPreferencesProvider } from "@/context/ticker-preferences";
import { WalkthroughProvider, useWalkthrough } from "@/context/walkthrough";
import { useAuth } from "@/context/auth";
import { createClient } from "@/lib/supabase";
import { SWRConfig } from "swr";
import { FloatingTerminal } from "@/components/FloatingTerminal";
import { WalkthroughBanner } from "@/components/walkthrough/WalkthroughBanner";
import { WalkthroughWelcome } from "@/components/walkthrough/WalkthroughWelcome";
import { LockedOnboardingModal } from "@/components/walkthrough/LockedOnboardingModal";
import { FinalVideoModal } from "@/components/walkthrough/FinalVideoModal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, profile, profileLoading } = useAuth();
  const router = useRouter();
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(96);

  // Measure actual header height (accounts for ConnectBanner presence)
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = Math.round(entry.contentRect.height);
      setHeaderH((prev) => {
        if (prev === h) return prev;
        document.documentElement.style.setProperty("--header-h", `${h}px`);
        return h;
      });
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  const [mfaChecked, setMfaChecked] = useState(false);

  useEffect(() => {
    if (!loading && !profileLoading) {
      if (!user) {
        router.replace("/login");
      } else if (profile && !profile.onboarding_completed) {
        router.replace("/onboarding");
      }
    }
  }, [user, loading, profile, profileLoading, router]);

  // Block dashboard access for users with MFA enrolled but not verified (aal1)
  useEffect(() => {
    if (!user || mfaChecked) return;
    const supabase = createClient();
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.currentLevel === "aal1" && data?.nextLevel === "aal2") {
        router.replace("/mfa-verify");
      } else {
        setMfaChecked(true);
      }
    }).catch(() => {
      // Fail open — backend will still enforce MFA via 403 if needed
      setMfaChecked(true);
    });
  }, [user, mfaChecked, router]);

  // Show nothing while checking auth, profile, or MFA status
  if (loading || profileLoading || (user && !mfaChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (profile && !profile.onboarding_completed)) {
    return null;
  }

  return (
    <SWRConfig value={{
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }}>
    <WalkthroughProvider>
    <TickerPreferencesProvider>
    <EnvironmentFilterProvider>
      <DashboardContent headerRef={headerRef} headerH={headerH} profile={profile}>
        {children}
      </DashboardContent>
    </EnvironmentFilterProvider>
    </TickerPreferencesProvider>
    </WalkthroughProvider>
    </SWRConfig>
  );
}

/* ── Inner component: has access to WalkthroughProvider context ── */

function DashboardContent({
  children,
  headerRef,
  headerH,
  profile,
}: {
  children: React.ReactNode;
  headerRef: React.RefObject<HTMLDivElement>;
  headerH: number;
  profile: ReturnType<typeof useAuth>["profile"];
}) {
  const {
    isActive: tourActive,
    currentStep,
    showFinalModal,
    hasCompleted,
    start: startTour,
  } = useWalkthrough();

  const walkthroughDone = hasCompleted || profile?.completed_walkthrough;
  const showLockedModal = profile && !walkthroughDone && !tourActive && !showFinalModal;
  const showVideoModal = !showFinalModal && profile && !profile.is_approved && walkthroughDone && !hasCompleted;

  // Gate: don't render dashboard content if user must complete walkthrough or isn't approved
  // But DO render full UI when walkthrough tour is active (so pages are visible behind banner)
  const isGated = showLockedModal || showVideoModal;

  if (isGated && !tourActive) {
    return (
      <ToastProvider>
        {/* Show nav bar even when gated — user needs to be able to sign out */}
        <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50">
          <TopNav />
        </div>
        {/* Render children behind the modal (portfolio page visible as background) */}
        <main style={{ paddingTop: headerH }}>
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-10 pt-6 md:pt-16 pb-16 md:pb-8 pointer-events-none select-none opacity-30">
            {children}
          </div>
        </main>
        {showLockedModal && (
          <LockedOnboardingModal onStartWalkthrough={() => startTour(true)} />
        )}
        {showVideoModal && (
          <FinalVideoModal />
        )}
      </ToastProvider>
    );
  }

  // During banner steps: block page clicks but keep full visibility
  const isBannerStep = tourActive && currentStep?.type === "banner";

  return (
    <ToastProvider>
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50">
        <ConnectBanner />
        <TickerBanner />
        <TopNav />
      </div>
      <main
        style={{
          paddingTop: headerH,
          paddingBottom: isBannerStep ? "var(--walkthrough-banner-h, 0px)" : undefined,
        }}
      >
        <div
          className={`max-w-[1600px] mx-auto px-4 md:px-6 lg:px-10 pt-6 md:pt-16 pb-16 md:pb-8 ${
            isBannerStep ? "pointer-events-none select-none" : ""
          }`}
        >
          {children}
        </div>
      </main>
      {!tourActive && <BottomNav />}
      {!tourActive && <FloatingTerminal />}
      <WalkthroughBanner />
      {tourActive && currentStep?.type === "welcome" && <WalkthroughWelcome />}
      {showFinalModal && <FinalVideoModal />}
    </ToastProvider>
  );
}
