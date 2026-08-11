"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";

/**
 * Onboarding now happens during signup (steps 3-4).
 * This page just redirects based on auth state.
 */
export default function OnboardingPage() {
  const { user, profile, loading, profileLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !profileLoading) {
      if (!user) {
        router.replace("/login");
      } else if (profile?.onboarding_completed) {
        router.replace("/portfolio");
      } else {
        // Profile not completed — send to signup to finish
        router.replace("/signup");
      }
    }
  }, [user, profile, loading, profileLoading, router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#00C807] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
