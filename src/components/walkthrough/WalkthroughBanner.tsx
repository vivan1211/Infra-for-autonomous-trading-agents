"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWalkthrough } from "@/context/walkthrough";

export function WalkthroughBanner() {
  const { isActive, currentStep, currentStepIndex, totalSteps, next, back } =
    useWalkthrough();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Set CSS variable for bottom padding in layout
  useEffect(() => {
    if (!isActive || currentStep?.type !== "banner") {
      document.documentElement.style.setProperty("--walkthrough-banner-h", "0px");
      return;
    }

    const measure = () => {
      if (bannerRef.current) {
        const h = bannerRef.current.offsetHeight;
        document.documentElement.style.setProperty("--walkthrough-banner-h", `${h}px`);
      }
    };

    // Measure after render
    measure();
    const ro = new ResizeObserver(measure);
    if (bannerRef.current) ro.observe(bannerRef.current);

    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--walkthrough-banner-h", "0px");
    };
  }, [isActive, currentStep]);

  if (!isActive || !currentStep || currentStep.type !== "banner") return null;

  const isFirstBanner = currentStepIndex === 0;
  const isLast = currentStepIndex === totalSteps - 1;

  return (
    <div
      ref={bannerRef}
      className="fixed bottom-0 left-0 right-0 z-[100] border-t border-white/10 bg-[#0a0a0a]/95 backdrop-blur-md animate-fade-in"
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-10 py-4 md:py-5">
        <div className="flex items-center gap-4 md:gap-6">
          {/* Back button */}
          <div className="w-[80px] flex-shrink-0">
            {!isFirstBanner && (
              <button
                onClick={back}
                className="flex items-center gap-1 px-3 py-2 text-[13px] text-white/60 hover:text-white border border-white/[0.15] rounded-lg hover:border-white/[0.25] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
          </div>

          {/* Center: title + description + step counter */}
          <div className="flex-1 min-w-0 text-center">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-white mb-0.5">
              {currentStep.title}
            </h3>
            <p className="text-[13px] md:text-[14px] text-white/50 leading-relaxed line-clamp-2">
              {currentStep.description}
            </p>
            <span className="text-[11px] text-white/25 tabular-nums mt-1 inline-block">
              {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>

          {/* Next button */}
          <div className="w-[80px] flex-shrink-0 flex justify-end">
            <button
              onClick={next}
              className="flex items-center gap-1 px-3 py-2 text-[13px] text-black bg-white rounded-lg hover:bg-white/90 font-medium transition-colors"
            >
              {isLast ? "Finish" : "Next"}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
