"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** @deprecated Patterns replaced by weekly Analysis (Phase G). */
export default function PatternRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/memory/analysis");
  }, [router]);
  return null;
}
