"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Database, Compass } from "lucide-react";
import { credentials as credentialsApi, type Credential } from "@/lib/api";
import { useWalkthrough } from "@/context/walkthrough";

const EXCHANGE_PROVIDERS = ["kalshi", "polymarket"];

export function ConnectBanner() {
  const router = useRouter();
  const { start: startTour, isActive: tourActive } = useWalkthrough();
  const [hasExchange, setHasExchange] = useState<boolean | null>(null); // null = loading

  const lastCheckRef = useRef(0);

  const checkCredentials = useCallback(() => {
    const now = Date.now();
    if (now - lastCheckRef.current < 30000) return; // skip if checked <30s ago
    lastCheckRef.current = now;
    credentialsApi
      .list()
      .then((creds: Credential[]) => {
        const connected = creds.some(
          (c) => EXCHANGE_PROVIDERS.includes(c.provider) && c.is_active
        );
        setHasExchange(connected);
      })
      .catch(() => {
        // If API fails, assume not connected so banner shows
        setHasExchange(false);
      });
  }, []);

  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  // Listen for credential changes (re-check when user comes back to this tab)
  useEffect(() => {
    const onFocus = () => checkCredentials();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkCredentials]);

  // Don't render while loading, if exchange is connected, or during walkthrough
  if (hasExchange === null || hasExchange || tourActive) return null;

  return (
    <div className="bg-[#00C807] text-black">
      <div className="max-w-[1600px] mx-auto flex items-center justify-center gap-2 px-4 py-2 text-[12px] md:text-[13px] font-medium">
        <Database className="w-3.5 h-3.5 shrink-0 opacity-60" />
        <span className="opacity-80">No exchange connected.</span>
        <button
          onClick={() => router.push("/settings?tab=exchanges")}
          className="inline-flex items-center gap-1 underline underline-offset-2 font-semibold hover:opacity-70 transition-opacity"
        >
          Connect account
          <ArrowRight className="w-3 h-3" />
        </button>
        <span className="opacity-40">or</span>
        <button
          onClick={() => startTour()}
          className="inline-flex items-center gap-1 underline underline-offset-2 font-semibold hover:opacity-70 transition-opacity"
        >
          <Compass className="w-3 h-3" />
          Take a tour
        </button>
      </div>
    </div>
  );
}
