"use client";

import { useRouter } from "next/navigation";
import { useWalkthrough } from "@/context/walkthrough";

export function FinalVideoModal() {
  const router = useRouter();
  const { completeFinal } = useWalkthrough();

  const handleConnectExchange = () => {
    completeFinal();
    router.push("/settings");
  };

  const handleScheduleCall = () => {
    completeFinal();
    window.open("https://calendar.app.google/b6XPVbVYssutCHs6A", "_blank");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-black p-8">
        {/* Video embed */}
        <div className="relative w-full rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/5 mb-6" style={{ paddingBottom: "56.25%" }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src="https://www.youtube.com/embed/rehvNpq0XD4"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        <h2 className="text-[22px] font-display font-bold text-white mb-2 text-center">
          You&#39;re all set!
        </h2>
        <p className="text-[14px] text-[#919fa6] leading-relaxed mb-6 text-center">
          Your account is now approved. Connect your exchange to start live trading, or schedule a call to learn more.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleConnectExchange}
            className="block w-full py-3.5 rounded-full bg-[#00C807] text-black text-[14px] font-semibold hover:bg-[#00e008] transition-colors text-center"
          >
            Connect Exchange
          </button>
          <button
            onClick={handleScheduleCall}
            className="block w-full py-3.5 rounded-full border border-white/20 text-white text-[14px] font-semibold hover:border-white/40 transition-colors text-center"
          >
            Schedule a Call
          </button>
        </div>
      </div>
    </div>
  );
}
