"use client";

import { useState, useRef, useEffect } from "react";

export default function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show]);

  return (
    <span ref={ref} className="relative inline-flex ml-1 align-middle">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow(!show); }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        className="w-4 h-4 rounded-full border border-white/[0.25] text-white text-[9px] font-medium flex items-center justify-center hover:border-white/[0.4] transition-colors"
      >
        ?
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 shadow-lg text-[12px] text-white/70 leading-relaxed w-[220px] font-normal normal-case tracking-normal">
          {text}
        </span>
      )}
    </span>
  );
}
