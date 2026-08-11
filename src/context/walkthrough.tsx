"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { WALKTHROUGH_STEPS, type WalkthroughStep } from "@/components/walkthrough/steps";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/context/auth";

/* ── Types ─────────────────────────────────────────────────────── */

interface WalkthroughContextType {
  /** Whether the walkthrough is currently active */
  isActive: boolean;
  /** Whether hooks should return demo data */
  demoMode: boolean;
  /** Current step index */
  currentStepIndex: number;
  /** Current step definition */
  currentStep: WalkthroughStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Whether the user has completed the tour at least once */
  hasCompleted: boolean;
  /** Whether the walkthrough is forced (cannot be exited) */
  isForced: boolean;
  /** Whether the user's account is approved */
  isApproved: boolean;
  /** Whether the final modal should be shown */
  showFinalModal: boolean;
  /** Start the walkthrough from step 0 */
  start: (forced?: boolean) => void;
  /** Go to the next step */
  next: () => void;
  /** Go to the previous step */
  back: () => void;
  /** Exit the walkthrough */
  exit: () => void;
  /** Jump to a specific step index */
  goToStep: (index: number) => void;
  /** Dismiss the final modal */
  completeFinal: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextType>({
  isActive: false,
  demoMode: false,
  currentStepIndex: 0,
  currentStep: null,
  totalSteps: WALKTHROUGH_STEPS.length,
  hasCompleted: false,
  isForced: false,
  isApproved: false,
  showFinalModal: false,
  start: () => {},
  next: () => {},
  back: () => {},
  exit: () => {},
  goToStep: () => {},
  completeFinal: () => {},
});

/* ── Storage keys ──────────────────────────────────────────────── */

const STEP_KEY = "af_walkthrough_step";
const ACTIVE_KEY = "af_walkthrough_active";
const COMPLETED_KEY = "af_walkthrough_completed";

/* ── Provider ──────────────────────────────────────────────────── */

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, refreshProfile } = useAuth();

  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [isForced, setIsForced] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);

  const isForcedRef = useRef(isForced);
  isForcedRef.current = isForced;

  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;

  const isApproved = profile?.is_approved ?? false;

  // Hydrate from localStorage
  useEffect(() => {
    const wasActive = localStorage.getItem(ACTIVE_KEY) === "true";
    const savedStep = parseInt(localStorage.getItem(STEP_KEY) || "0", 10);
    const completed = localStorage.getItem(COMPLETED_KEY) === "true";

    setHasCompleted(completed);
    if (wasActive && savedStep >= 0 && savedStep < WALKTHROUGH_STEPS.length) {
      setIsActive(true);
      setStepIndex(savedStep);
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, String(isActive));
    localStorage.setItem(STEP_KEY, String(stepIndex));
  }, [isActive, stepIndex]);

  const currentStep = isActive ? WALKTHROUGH_STEPS[stepIndex] ?? null : null;

  // Navigate to the correct page when step changes
  useEffect(() => {
    if (!isActive || !currentStep) return;

    const targetPage = currentStep.page;
    const targetPathname = targetPage.split("?")[0];

    if (pathname !== targetPathname) {
      setNavigating(true);
      router.push(targetPage);
    } else {
      if (targetPage.includes("?") && targetPage !== targetPathname) {
        router.push(targetPage);
      }
      setNavigating(false);
    }
  }, [isActive, currentStep, pathname, router]);

  // When pathname changes during navigation, clear navigating flag
  useEffect(() => {
    if (navigating && currentStep) {
      const targetPathname = currentStep.page.split("?")[0];
      if (pathname === targetPathname) {
        const timer = setTimeout(() => setNavigating(false), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, navigating, currentStep]);

  const start = useCallback((forced?: boolean) => {
    setStepIndex(0);
    setIsActive(true);
    setIsForced(forced ?? false);
    setShowFinalModal(false);
  }, []);

  const next = useCallback(async () => {
    const nextIdx = stepIndexRef.current + 1;
    if (nextIdx >= WALKTHROUGH_STEPS.length) {
      // Tour steps complete — mark done, auto-approve, then show final modal
      setIsActive(false);
      setStepIndex(0);
      setIsForced(false);
      setHasCompleted(true);
      setShowFinalModal(true);
      localStorage.setItem(COMPLETED_KEY, "true");
      localStorage.removeItem(ACTIVE_KEY);
      localStorage.removeItem(STEP_KEY);

      if (user?.id) {
        try {
          const supabase = createClient();
          await supabase
            .from("user_profiles")
            .update({ completed_walkthrough: true, is_approved: true })
            .eq("id", user.id);
          await refreshProfile();
        } catch {
          // localStorage already tracks completion
        }
      }
    } else {
      setStepIndex(nextIdx);
    }
  }, [user?.id, refreshProfile]);

  const back = useCallback(() => {
    const prevIdx = stepIndexRef.current - 1;
    if (prevIdx >= 0) {
      setStepIndex(prevIdx);
    }
  }, []);

  const exit = useCallback(() => {
    if (isForcedRef.current) return;

    setIsActive(false);
    setStepIndex(0);
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
  }, []);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < WALKTHROUGH_STEPS.length) {
      setStepIndex(index);
    }
  }, []);

  const completeFinal = useCallback(() => {
    setShowFinalModal(false);
  }, []);

  return (
    <WalkthroughContext.Provider
      value={{
        isActive,
        demoMode: isActive || showFinalModal,
        currentStepIndex: stepIndex,
        currentStep: navigating ? null : currentStep,
        totalSteps: WALKTHROUGH_STEPS.length,
        hasCompleted,
        isForced,
        isApproved,
        showFinalModal,
        start,
        next,
        back,
        exit,
        goToStep,
        completeFinal,
      }}
    >
      {children}
    </WalkthroughContext.Provider>
  );
}

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}
