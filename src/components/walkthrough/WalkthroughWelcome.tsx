"use client";

import { ChevronRight } from "lucide-react";
import { useWalkthrough } from "@/context/walkthrough";

/**
 * Full-screen centered card for the welcome step (step 0).
 * Includes its own dark backdrop since the overlay was removed.
 */
export function WalkthroughWelcome() {
  const { currentStep, currentStepIndex, totalSteps, next } = useWalkthrough();

  if (!currentStep || currentStep.type !== "welcome") return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-[420px] bg-[#0a0a0a] border border-white/[0.15] rounded-2xl shadow-2xl animate-fade-in overflow-hidden">
        {/* Header accent bar */}
        <div className="h-1 bg-gradient-to-r from-accent via-gain to-accent" />

        <div className="p-6">
          <h2 className="text-[20px] font-bold text-white tracking-tight mb-3">
            {currentStep.title}
          </h2>

          <p className="text-[14px] text-white/80 leading-relaxed mb-6">
            {currentStep.description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/50 tabular-nums">
              {currentStepIndex + 1} of {totalSteps}
            </span>
            <button
              onClick={next}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-black bg-white rounded-lg hover:bg-white/90 font-medium transition-colors"
            >
              Start Tour
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
