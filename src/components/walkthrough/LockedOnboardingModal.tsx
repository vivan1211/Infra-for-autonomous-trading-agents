"use client";

interface LockedOnboardingModalProps {
  onStartWalkthrough: () => void;
}

export function LockedOnboardingModal({ onStartWalkthrough }: LockedOnboardingModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-black p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto mb-6">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M25.7 11.2c.5-.1.9-.1 1.3 0 .1-1.1-.3-2.1-1.1-2.8-.8-.7-1.9-.9-2.9-.6l-6.1 1.8c-.5.1-.9.1-1.3 0L9.5 7.8c-1-.3-2.1-.1-2.9.6-.8.7-1.2 1.7-1.1 2.8.4-.1.9-.1 1.3 0l6.1 1.8c.5.1 1 .5 1.2 1l2 5.8c.3 1 1.3 1.6 2.3 1.6s2-.6 2.3-1.6l2-5.8c.2-.5.6-.9 1.2-1l1.8-.8z" fill="white"/>
          </svg>
        </div>
        <h2 className="text-[24px] font-display font-bold text-white mb-3">
          Welcome to Prediction Market Agents
        </h2>
        <p className="text-[14px] text-[#919fa6] leading-relaxed mb-2">
          Deploy AI trading agents on prediction markets.
        </p>
        <p className="text-[14px] text-[#919fa6] leading-relaxed mb-8">
          Let us show you how everything works in a quick guided tour.
        </p>
        <button
          onClick={onStartWalkthrough}
          className="w-full py-3.5 rounded-full bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-colors"
        >
          Complete Walkthrough
        </button>
      </div>
    </div>
  );
}
