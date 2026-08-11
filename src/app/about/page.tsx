"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DOC_SECTIONS } from "./docs-data";
import { AboutNav } from "./about-nav";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Fixed Nav ── */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <AboutNav />
      </div>

      {/* ── Banner — full-bleed image ── */}
      <div className="relative h-[306px] overflow-hidden">
        <Image
          src="/about-banner.jpg"
          alt="Prediction Market Agents"
          fill
          className="object-cover object-center"
          priority
        />
        {/* Gradient fade to black at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
      </div>

      <div className="px-4 md:px-6 lg:px-10">
        {/* ── Sticky title bar ── */}
        <div className="sticky z-30 bg-black/80 backdrop-blur-xl -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-10 lg:px-10 py-4 md:py-6 mb-6 md:mb-8 border-b border-white/[0.04]" style={{ top: 64 }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] md:text-[28px] font-bold text-white tracking-tight font-display">Documentation</h2>
              <p className="text-[13px] text-text-tertiary mt-1">Guides and reference for the platform</p>
            </div>
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <Link
                href="/login"
                className="border border-white/[0.12] text-white/60 rounded-full px-3 md:px-5 py-1.5 md:py-2 text-[11px] md:text-[13px] font-medium hover:text-white hover:border-white/[0.24] transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="bg-gain text-black rounded-full px-3 md:px-5 py-1.5 md:py-2 text-[11px] md:text-[13px] font-semibold hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>

        {/* ── Two-column layout (like strategies page) ── */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* Left: Table */}
          <div>
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_100px] md:grid-cols-[1fr_120px_40px] items-center px-4 pb-3 border-b border-white/[0.08]">
              <span className="text-[11px] font-medium text-white/25 uppercase tracking-wider">Topic</span>
              <span className="text-[11px] font-medium text-white/25 uppercase tracking-wider hidden md:block">Section</span>
              <span />
            </div>

            {/* Rows */}
            {DOC_SECTIONS.map((doc) => (
              <Link
                key={doc.slug}
                href={`/about/${doc.slug}`}
                className="grid grid-cols-[1fr_100px] md:grid-cols-[1fr_120px_40px] items-center px-4 py-4 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer group"
              >
                {/* Name + subtitle */}
                <div className="min-w-0">
                  <p className="text-[13px] md:text-[14px] font-semibold text-white truncate group-hover:text-gain transition-colors">
                    {doc.title}
                  </p>
                  <p className="text-[11px] md:text-[12px] text-white/35 truncate mt-0.5">{doc.subtitle}</p>
                </div>

                {/* Category — hidden on mobile */}
                <span className="text-[13px] text-white/50 hidden md:block">{doc.category}</span>

                {/* Arrow */}
                <div className="flex justify-end">
                  <ChevronRight size={16} className="text-white/20 group-hover:text-gain transition-colors" />
                </div>
              </Link>
            ))}
          </div>

          {/* Right: Video sidebar — sticky */}
          <div className="hidden lg:block">
            <div className="sticky top-[200px] space-y-6">
              {/* Video */}
              <div className="bg-white/[0.02] border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Overview</h3>
                </div>
                <div className="aspect-video rounded-lg overflow-hidden border border-border bg-[#0a0a0a]">
                  <video
                    src="/banner-video.mp4"
                    controls
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-[12px] text-white/30 mt-3">
                  Watch a quick walkthrough of the Prediction Market Agents platform.
                </p>
              </div>

              {/* Quick links */}
              <div className="bg-white/[0.02] border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Quick Links</h3>
                </div>
                <div className="space-y-1">
                  <Link
                    href="/about/overview"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors text-[13px] text-white/60 hover:text-white"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gain" />
                    Getting Started
                  </Link>
                  <Link
                    href="/about/council"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors text-[13px] text-white/60 hover:text-white"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gain" />
                    The Council Strategy
                  </Link>
                  <Link
                    href="/about/safeguards"
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors text-[13px] text-white/60 hover:text-white"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gain" />
                    Safeguards & Rules
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-border py-8 mt-16 -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-10 lg:px-10">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-white/20">© 2026 Prediction Market Agents.</span>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="text-[12px] text-white/30 hover:text-white transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="text-[12px] text-white/30 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/login" className="text-[12px] text-white/30 hover:text-white transition-colors">
                Login
              </Link>
              <Link href="/signup" className="text-[12px] text-white/30 hover:text-white transition-colors">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
