"use client";

import { ReactNode } from "react";

/**
 * Bot Avatar — Geometric animal silhouettes, dark tones, sharp lines.
 * Fintech-inspired minimal design. Each bot gets a unique animal identity.
 * Animals: bull, hawk, wolf, shark, fox, bear, whale, eagle
 */

interface AnimalDef {
  name: string;
  accent: string;
  gradient: string;
  render: (size: number) => ReactNode;
}

const ANIMALS: AnimalDef[] = [
  {
    name: "bull",
    accent: "#4ade80",
    gradient: "linear-gradient(135deg, #1a3a1a 0%, #0d2818 50%, #0a1f0a 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Horns — angular, sharp */}
        <path d="M8 4L16 20L12 22L8 4Z" fill="#4ade80" fillOpacity={0.6} />
        <path d="M56 4L48 20L52 22L56 4Z" fill="#4ade80" fillOpacity={0.6} />
        <path d="M10 6L16 20L14 21L10 6Z" fill="#4ade80" fillOpacity={0.35} />
        <path d="M54 6L48 20L50 21L54 6Z" fill="#4ade80" fillOpacity={0.35} />
        {/* Head — angular shield shape */}
        <path d="M16 20L32 16L48 20L50 36L42 50L32 54L22 50L14 36Z" fill="#2a5a2a" />
        <path d="M18 22L32 18L46 22L48 35L41 48L32 52L23 48L16 35Z" fill="#3a6a3a" fillOpacity={0.8} />
        {/* Forehead ridge */}
        <path d="M28 20L32 18L36 20L34 28L32 30L30 28Z" fill="#4ade80" fillOpacity={0.12} />
        {/* Eyes — sharp angular */}
        <path d="M22 30L27 28L28 32L24 34Z" fill="#0a1f0a" />
        <path d="M42 30L37 28L36 32L40 34Z" fill="#0a1f0a" />
        <path d="M24 31L26 29.5L27 31.5L25 33Z" fill="#4ade80" fillOpacity={0.9} />
        <path d="M40 31L38 29.5L37 31.5L39 33Z" fill="#4ade80" fillOpacity={0.9} />
        {/* Snout — geometric */}
        <path d="M26 38L32 36L38 38L36 44L32 46L28 44Z" fill="#0f2a0f" />
        {/* Nostrils */}
        <circle cx="29" cy="41" r="1.5" fill="#0a1f0a" />
        <circle cx="35" cy="41" r="1.5" fill="#0a1f0a" />
        {/* Nose ring — subtle */}
        <path d="M29 44C30 46 34 46 35 44" stroke="#4ade80" strokeWidth="0.8" strokeOpacity={0.4} fill="none" />
        {/* Jaw line accents */}
        <path d="M22 44L32 54L42 44" stroke="#4ade80" strokeWidth="0.5" strokeOpacity={0.2} fill="none" />
      </svg>
    ),
  },
  {
    name: "hawk",
    accent: "#f59e0b",
    gradient: "linear-gradient(135deg, #2d1b00 0%, #1a1000 50%, #0f0a00 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Head crest — sharp angular feathers */}
        <path d="M32 4L28 12L32 10L36 12Z" fill="#f59e0b" fillOpacity={0.5} />
        <path d="M32 6L29 12L32 11L35 12Z" fill="#f59e0b" fillOpacity={0.3} />
        {/* Head — angular diamond */}
        <path d="M18 22L32 12L46 22L44 40L32 50L20 40Z" fill="#4d3500" />
        <path d="M20 23L32 14L44 23L42 38L32 48L22 38Z" fill="#5d4200" fillOpacity={0.8} />
        {/* Brow ridge */}
        <path d="M22 24L32 18L42 24L40 26L32 22L24 26Z" fill="#f59e0b" fillOpacity={0.15} />
        {/* Eyes — fierce angular slits */}
        <path d="M22 28L28 26L27 31L22 30Z" fill="#1a1000" />
        <path d="M42 28L36 26L37 31L42 30Z" fill="#1a1000" />
        <path d="M24 28.5L27 27L26.5 30L24 29.5Z" fill="#f59e0b" fillOpacity={0.9} />
        <path d="M40 28.5L37 27L37.5 30L40 29.5Z" fill="#f59e0b" fillOpacity={0.9} />
        {/* Beak — sharp angular */}
        <path d="M29 34L32 32L35 34L32 46Z" fill="#c47a08" />
        <path d="M30 34.5L32 33L34 34.5L32 44Z" fill="#d4920a" fillOpacity={0.7} />
        {/* Beak hook */}
        <path d="M31 44L32 46L33 44L32 48Z" fill="#a06508" />
        {/* Wing silhouettes — angular */}
        <path d="M14 30L20 26L18 38L10 42Z" fill="#2d1b00" fillOpacity={0.6} />
        <path d="M50 30L44 26L46 38L54 42Z" fill="#2d1b00" fillOpacity={0.6} />
        {/* Feather lines */}
        <path d="M20 32L18 36" stroke="#f59e0b" strokeWidth="0.4" strokeOpacity={0.2} />
        <path d="M44 32L46 36" stroke="#f59e0b" strokeWidth="0.4" strokeOpacity={0.2} />
        {/* Chin accent */}
        <path d="M26 42L32 50L38 42" stroke="#f59e0b" strokeWidth="0.5" strokeOpacity={0.2} fill="none" />
      </svg>
    ),
  },
  {
    name: "wolf",
    accent: "#818cf8",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f1626 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Ears — tall, angular */}
        <path d="M14 4L20 22L12 24Z" fill="#4D4B85" />
        <path d="M50 4L44 22L52 24Z" fill="#4D4B85" />
        <path d="M15 8L19 21L14 23Z" fill="#818cf8" fillOpacity={0.12} />
        <path d="M49 8L45 21L50 23Z" fill="#818cf8" fillOpacity={0.12} />
        {/* Head — angular hexagonal */}
        <path d="M12 24L32 14L52 24L48 42L38 52L26 52L16 42Z" fill="#3a3a5e" />
        <path d="M14 25L32 16L50 25L46 40L37 50L27 50L18 40Z" fill="#454380" fillOpacity={0.8} />
        {/* Forehead stripe */}
        <path d="M30 18L32 16L34 18L33 30L32 32L31 30Z" fill="#818cf8" fillOpacity={0.1} />
        {/* Eyes — sharp, intelligent */}
        <path d="M20 30L27 27L26 34L20 33Z" fill="#0f0e20" />
        <path d="M44 30L37 27L38 34L44 33Z" fill="#0f0e20" />
        <circle cx="24" cy="30.5" r="2" fill="#818cf8" fillOpacity={0.85} />
        <circle cx="40" cy="30.5" r="2" fill="#818cf8" fillOpacity={0.85} />
        <circle cx="24.5" cy="30" r="0.6" fill="#fff" fillOpacity={0.6} />
        <circle cx="40.5" cy="30" r="0.6" fill="#fff" fillOpacity={0.6} />
        {/* Snout — angular */}
        <path d="M26 38L32 36L38 38L35 46L32 48L29 46Z" fill="#151330" />
        {/* Nose */}
        <path d="M30 39L32 37L34 39L33 41L31 41Z" fill="#0f0e20" />
        {/* Mouth lines */}
        <path d="M29 43L32 48L35 43" stroke="#818cf8" strokeWidth="0.5" strokeOpacity={0.2} fill="none" />
        {/* Cheek fur lines — angular */}
        <path d="M14 34L10 38" stroke="#818cf8" strokeWidth="0.6" strokeOpacity={0.15} />
        <path d="M14 38L8 42" stroke="#818cf8" strokeWidth="0.6" strokeOpacity={0.15} />
        <path d="M50 34L54 38" stroke="#818cf8" strokeWidth="0.6" strokeOpacity={0.15} />
        <path d="M50 38L56 42" stroke="#818cf8" strokeWidth="0.6" strokeOpacity={0.15} />
        {/* Jaw accent */}
        <path d="M18 42L26 52L38 52L46 42" stroke="#818cf8" strokeWidth="0.4" strokeOpacity={0.15} fill="none" />
      </svg>
    ),
  },
  {
    name: "shark",
    accent: "#38bdf8",
    gradient: "linear-gradient(135deg, #0d1f2d 0%, #0a1929 50%, #061118 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Dorsal fin — sharp */}
        <path d="M30 4L32 2L34 4L33 18L31 18Z" fill="#38bdf8" fillOpacity={0.4} />
        <path d="M31 6L32 4L33 6L32.5 16L31.5 16Z" fill="#38bdf8" fillOpacity={0.2} />
        {/* Body — sleek angular */}
        <path d="M8 30L32 16L56 30L52 42L42 50L22 50L12 42Z" fill="#1d3f5d" />
        <path d="M10 31L32 18L54 31L50 41L41 48L23 48L14 41Z" fill="#2a5070" fillOpacity={0.7} />
        {/* Belly highlight */}
        <path d="M22 40L32 38L42 40L40 46L32 48L24 46Z" fill="#38bdf8" fillOpacity={0.06} />
        {/* Gill slits */}
        <path d="M18 30L16 36" stroke="#0a1929" strokeWidth="1.2" />
        <path d="M15 31L13 36" stroke="#0a1929" strokeWidth="1" />
        <path d="M12 32L10 36" stroke="#0a1929" strokeWidth="0.8" />
        {/* Eyes — cold, angular */}
        <path d="M20 28L26 26L25 32L20 31Z" fill="#061118" />
        <path d="M44 28L38 26L39 32L44 31Z" fill="#061118" />
        <circle cx="23" cy="29" r="1.5" fill="#38bdf8" fillOpacity={0.85} />
        <circle cx="41" cy="29" r="1.5" fill="#38bdf8" fillOpacity={0.85} />
        {/* Mouth — menacing line */}
        <path d="M20 38L32 42L44 38" stroke="#061118" strokeWidth="1.2" fill="none" />
        {/* Teeth hints */}
        <path d="M22 38L23 40L25 38L26 40L28 38L29 40L31 38L32 40L33 38L35 40L36 38L38 40L39 38L41 40L42 38" stroke="#38bdf8" strokeWidth="0.4" strokeOpacity={0.3} fill="none" />
        {/* Side fins */}
        <path d="M8 36L4 44L14 40Z" fill="#0d1f2d" fillOpacity={0.7} />
        <path d="M56 36L60 44L50 40Z" fill="#0d1f2d" fillOpacity={0.7} />
        {/* Tail */}
        <path d="M28 50L24 58L32 52L40 58L36 50" fill="#0d1f2d" fillOpacity={0.5} />
      </svg>
    ),
  },
  {
    name: "fox",
    accent: "#fb923c",
    gradient: "linear-gradient(135deg, #2d1500 0%, #1a0e00 50%, #0f0800 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Ears — tall, angular, pointed */}
        <path d="M12 4L18 20L10 24Z" fill="#4d2000" />
        <path d="M52 4L46 20L54 24Z" fill="#4d2000" />
        <path d="M13 8L17 19L12 22Z" fill="#fb923c" fillOpacity={0.15} />
        <path d="M51 8L47 19L52 22Z" fill="#fb923c" fillOpacity={0.15} />
        {/* Head — sleek angular */}
        <path d="M10 24L32 14L54 24L50 40L40 52L32 56L24 52L14 40Z" fill="#4d3000" />
        <path d="M12 25L32 16L52 25L48 39L39 50L32 54L25 50L16 39Z" fill="#5d3a00" fillOpacity={0.8} />
        {/* Forehead marking */}
        <path d="M28 18L32 16L36 18L34 28L32 30L30 28Z" fill="#fb923c" fillOpacity={0.1} />
        {/* Eyes — cunning, narrow */}
        <path d="M20 30L27 27L26 33L20 32Z" fill="#0f0800" />
        <path d="M44 30L37 27L38 33L44 32Z" fill="#0f0800" />
        <circle cx="24" cy="30" r="1.8" fill="#fb923c" fillOpacity={0.9} />
        <circle cx="40" cy="30" r="1.8" fill="#fb923c" fillOpacity={0.9} />
        <circle cx="24.5" cy="29.5" r="0.5" fill="#fff" fillOpacity={0.6} />
        <circle cx="40.5" cy="29.5" r="0.5" fill="#fff" fillOpacity={0.6} />
        {/* Snout — pointed, sharp */}
        <path d="M26 36L32 34L38 36L34 46L32 50L30 46Z" fill="#1a0e00" />
        {/* Nose */}
        <path d="M30 38L32 36L34 38L33 40L31 40Z" fill="#0f0800" />
        {/* Mouth */}
        <path d="M30 42L32 50L34 42" stroke="#fb923c" strokeWidth="0.4" strokeOpacity={0.2} fill="none" />
        {/* Whisker lines */}
        <path d="M14 36L8 34" stroke="#fb923c" strokeWidth="0.5" strokeOpacity={0.15} />
        <path d="M14 38L6 38" stroke="#fb923c" strokeWidth="0.5" strokeOpacity={0.12} />
        <path d="M50 36L56 34" stroke="#fb923c" strokeWidth="0.5" strokeOpacity={0.15} />
        <path d="M50 38L58 38" stroke="#fb923c" strokeWidth="0.5" strokeOpacity={0.12} />
        {/* Jaw accent */}
        <path d="M24 48L32 56L40 48" stroke="#fb923c" strokeWidth="0.4" strokeOpacity={0.15} fill="none" />
      </svg>
    ),
  },
  {
    name: "bear",
    accent: "#f87171",
    gradient: "linear-gradient(135deg, #2d0d0d 0%, #1a0808 50%, #0f0505 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Ears — rounded but geometric */}
        <path d="M12 14L18 8L22 14L20 20L14 20Z" fill="#3d1010" />
        <path d="M52 14L46 8L42 14L44 20L50 20Z" fill="#3d1010" />
        <path d="M14 14L18 10L20 14L19 18L15 18Z" fill="#f87171" fillOpacity={0.1} />
        <path d="M50 14L46 10L44 14L45 18L49 18Z" fill="#f87171" fillOpacity={0.1} />
        {/* Head — broad, angular */}
        <path d="M14 20L24 14L40 14L50 20L52 36L44 50L32 54L20 50L12 36Z" fill="#4d1d1d" />
        <path d="M16 21L25 16L39 16L48 21L50 35L43 48L32 52L21 48L14 35Z" fill="#5d2525" fillOpacity={0.7} />
        {/* Eye patches — angular */}
        <path d="M20 28L28 26L27 34L20 33Z" fill="#1a0808" fillOpacity={0.6} />
        <path d="M44 28L36 26L37 34L44 33Z" fill="#1a0808" fillOpacity={0.6} />
        {/* Eyes */}
        <circle cx="24" cy="30" r="2.5" fill="#0f0505" />
        <circle cx="40" cy="30" r="2.5" fill="#0f0505" />
        <circle cx="24.5" cy="29.5" r="1.3" fill="#f87171" fillOpacity={0.85} />
        <circle cx="40.5" cy="29.5" r="1.3" fill="#f87171" fillOpacity={0.85} />
        <circle cx="25" cy="29" r="0.4" fill="#fff" fillOpacity={0.5} />
        <circle cx="41" cy="29" r="0.4" fill="#fff" fillOpacity={0.5} />
        {/* Snout — broad */}
        <path d="M26 36L32 34L38 36L37 42L32 44L27 42Z" fill="#1a0808" fillOpacity={0.7} />
        {/* Nose */}
        <path d="M29 37L32 35L35 37L34 39L30 39Z" fill="#0f0505" />
        {/* Mouth */}
        <path d="M32 39V42" stroke="#0f0505" strokeWidth="1" />
        <path d="M29 43C30 44 34 44 35 43" stroke="#1a0808" strokeWidth="0.8" fill="none" />
        {/* Jaw accent */}
        <path d="M20 46L32 54L44 46" stroke="#f87171" strokeWidth="0.4" strokeOpacity={0.15} fill="none" />
      </svg>
    ),
  },
  {
    name: "whale",
    accent: "#2dd4bf",
    gradient: "linear-gradient(135deg, #0a2d2d 0%, #061f1f 50%, #041515 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Spout — geometric */}
        <path d="M31 6L32 2L33 6L32.5 12L31.5 12Z" fill="#2dd4bf" fillOpacity={0.3} />
        <path d="M30 4L31 6L32 4" stroke="#2dd4bf" strokeWidth="0.6" strokeOpacity={0.2} fill="none" />
        <path d="M33 4L32 6L34 4" stroke="#2dd4bf" strokeWidth="0.6" strokeOpacity={0.2} fill="none" />
        {/* Body — massive, angular */}
        <path d="M6 32L18 16L46 16L58 32L54 44L42 52L22 52L10 44Z" fill="#1a4d4d" />
        <path d="M8 32L19 18L45 18L56 32L52 43L41 50L23 50L12 43Z" fill="#2a5d5d" fillOpacity={0.7} />
        {/* Belly highlight */}
        <path d="M20 42L32 40L44 42L42 48L32 50L22 48Z" fill="#2dd4bf" fillOpacity={0.06} />
        {/* Eyes — small, wise */}
        <circle cx="20" cy="30" r="3" fill="#041515" />
        <circle cx="44" cy="30" r="3" fill="#041515" />
        <circle cx="20.5" cy="29.5" r="1.5" fill="#2dd4bf" fillOpacity={0.8} />
        <circle cx="44.5" cy="29.5" r="1.5" fill="#2dd4bf" fillOpacity={0.8} />
        <circle cx="21" cy="29" r="0.5" fill="#fff" fillOpacity={0.4} />
        <circle cx="45" cy="29" r="0.5" fill="#fff" fillOpacity={0.4} />
        {/* Mouth — gentle curve */}
        <path d="M16 38C22 42 30 44 32 44C34 44 42 42 48 38" stroke="#041515" strokeWidth="1" fill="none" />
        {/* Belly ridges — geometric lines */}
        <path d="M24 42L32 41L40 42" stroke="#0a2d2d" strokeWidth="0.6" />
        <path d="M26 44L32 43L38 44" stroke="#0a2d2d" strokeWidth="0.5" />
        <path d="M28 46L32 45L36 46" stroke="#0a2d2d" strokeWidth="0.4" />
        {/* Flippers — angular */}
        <path d="M10 36L4 44L14 42Z" fill="#1a4d4d" fillOpacity={0.7} />
        <path d="M54 36L60 44L50 42Z" fill="#1a4d4d" fillOpacity={0.7} />
        {/* Tail — angular fork */}
        <path d="M26 52L20 60L32 54L44 60L38 52" fill="#1a4d4d" fillOpacity={0.6} />
        <path d="M28 52L22 58L32 54L42 58L36 52" fill="#2dd4bf" fillOpacity={0.05} />
      </svg>
    ),
  },
  {
    name: "eagle",
    accent: "#a3e635",
    gradient: "linear-gradient(135deg, #1e2d0a 0%, #121d06 50%, #0a1204 100%)",
    render: (size) => (
      <svg viewBox="0 0 64 64" fill="none" style={{ width: size, height: size }}>
        {/* Head crest — sharp, regal */}
        <path d="M28 6L32 2L36 6L34 14L32 16L30 14Z" fill="#a3e635" fillOpacity={0.4} />
        <path d="M29 8L32 4L35 8L34 13L32 15L30 13Z" fill="#a3e635" fillOpacity={0.2} />
        {/* Head — angular, powerful */}
        <path d="M16 22L32 12L48 22L46 40L38 50L26 50L18 40Z" fill="#3a5a18" />
        <path d="M18 23L32 14L46 23L44 38L37 48L27 48L20 38Z" fill="#4a6a22" fillOpacity={0.7} />
        {/* Brow ridge — fierce */}
        <path d="M20 24L32 18L44 24L42 26L32 22L22 26Z" fill="#a3e635" fillOpacity={0.12} />
        {/* Eyes — piercing, angular */}
        <path d="M20 28L28 25L27 32L20 31Z" fill="#0a1204" />
        <path d="M44 28L36 25L37 32L44 31Z" fill="#0a1204" />
        <circle cx="24" cy="29" r="2" fill="#a3e635" fillOpacity={0.9} />
        <circle cx="40" cy="29" r="2" fill="#a3e635" fillOpacity={0.9} />
        <circle cx="24.5" cy="28.5" r="0.6" fill="#fff" fillOpacity={0.6} />
        <circle cx="40.5" cy="28.5" r="0.6" fill="#fff" fillOpacity={0.6} />
        {/* Beak — sharp, hooked, angular */}
        <path d="M28 34L32 32L36 34L32 48Z" fill="#5a7a20" />
        <path d="M29 35L32 33L35 35L32 46Z" fill="#6a8a28" fillOpacity={0.7} />
        {/* Beak hook */}
        <path d="M31 46L32 48L33 46L32 52Z" fill="#4a6a18" />
        {/* Wings — spread, angular */}
        <path d="M12 28L18 24L16 38L6 44Z" fill="#3a5a18" fillOpacity={0.7} />
        <path d="M52 28L46 24L48 38L58 44Z" fill="#3a5a18" fillOpacity={0.7} />
        <path d="M6 44L10 40L8 48L2 50Z" fill="#3a5a18" fillOpacity={0.4} />
        <path d="M58 44L54 40L56 48L62 50Z" fill="#3a5a18" fillOpacity={0.4} />
        {/* Feather lines */}
        <path d="M14 32L10 38" stroke="#a3e635" strokeWidth="0.4" strokeOpacity={0.15} />
        <path d="M50 32L54 38" stroke="#a3e635" strokeWidth="0.4" strokeOpacity={0.15} />
        {/* Chin accent */}
        <path d="M26 44L32 50L38 44" stroke="#a3e635" strokeWidth="0.4" strokeOpacity={0.2} fill="none" />
      </svg>
    ),
  },
];

// ── Custom mascot images/videos for known bot types ─────────────────────────
const BOT_TYPE_MASCOTS: Record<string, { src?: string; video?: string; poster?: string; accent: string; gradient: string; facesRight: boolean }> = {
  "polymarket-v2":       { video: "/bots/council-poly-sm.mp4", poster: "/bots/council-poly-poster.jpg", accent: "#22d3ee", gradient: "linear-gradient(135deg, #0a2a3a 0%, #0d1828 50%, #0a1520 100%)", facesRight: false },
  "kalshi-v2":           { video: "/bots/council-sm.mp4",      poster: "/bots/council-poster.jpg",      accent: "#60a5fa", gradient: "linear-gradient(135deg, #0a1a3a 0%, #0d1428 50%, #0a1020 100%)", facesRight: false },
  "polymarket-superforecaster": { video: "/bots/superforecaster-poly-sm.mp4", poster: "/bots/superforecaster-poly-poster.jpg", accent: "#f59e0b", gradient: "linear-gradient(135deg, #2d1b00 0%, #1a1000 50%, #0f0a00 100%)", facesRight: false },
  "kalshi-superforecaster":     { video: "/bots/superforecaster-kalshi-sm.mp4", poster: "/bots/superforecaster-kalshi-poster.jpg", accent: "#a78bfa", gradient: "linear-gradient(135deg, #1a0a3a 0%, #0d0828 50%, #0a0520 100%)", facesRight: false },
  // Aliases for bot_type_ids from bot-descriptions.ts
  "superforecaster":            { video: "/bots/superforecaster-kalshi-sm.mp4", poster: "/bots/superforecaster-kalshi-poster.jpg", accent: "#a78bfa", gradient: "linear-gradient(135deg, #1a0a3a 0%, #0d0828 50%, #0a0520 100%)", facesRight: false },
  "superforecaster-polymarket": { video: "/bots/superforecaster-poly-sm.mp4", poster: "/bots/superforecaster-poly-poster.jpg", accent: "#f59e0b", gradient: "linear-gradient(135deg, #2d1b00 0%, #1a1000 50%, #0f0a00 100%)", facesRight: false },
  // Demo bot type aliases
  "ensemble-5":                 { video: "/bots/council-sm.mp4",      poster: "/bots/council-poster.jpg",      accent: "#60a5fa", gradient: "linear-gradient(135deg, #0a1a3a 0%, #0d1428 50%, #0a1020 100%)", facesRight: false },
  "ensemble-5-polymarket":      { video: "/bots/council-poly-sm.mp4", poster: "/bots/council-poly-poster.jpg", accent: "#22d3ee", gradient: "linear-gradient(135deg, #0a2a3a 0%, #0d1828 50%, #0a1520 100%)", facesRight: false },
  "polymarket-tail-buyer":      { video: "/bots/tail-buyer-sm.mp4", poster: "/bots/tail-buyer-poster.jpg", accent: "#f59e0b", gradient: "linear-gradient(135deg, #2d1b00 0%, #1a1000 50%, #0f0a00 100%)", facesRight: false },
  "kalshi-tail-buyer":          { video: "/bots/tail-buyer-sm.mp4", poster: "/bots/tail-buyer-poster.jpg", accent: "#f59e0b", gradient: "linear-gradient(135deg, #2d1b00 0%, #1a1000 50%, #0f0a00 100%)", facesRight: false },
};

// Deterministic animal assignment based on agent ID hash
function getAnimalIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % ANIMALS.length;
}

export function BotAvatar({
  agentId,
  botTypeId,
  size = 32,
  className = "",
  faceRight,
  noClip,
}: {
  agentId: string;
  botTypeId?: string;
  size?: number;
  className?: string;
  /** Force the mascot to face right (true) or left (false). Omit to use natural orientation. */
  faceRight?: boolean;
  /** Skip rounded-full clipping — show full image with natural shape */
  noClip?: boolean;
}) {
  // Use custom mascot image if bot type is known
  const mascot = botTypeId ? BOT_TYPE_MASCOTS[botTypeId] : undefined;

  if (mascot) {
    // Video mascot — always circular, centered crop with dark overlay
    if (mascot.video) {
      return (
        <div
          className={`relative shrink-0 overflow-hidden ${noClip ? "" : "rounded-full"} ${className}`}
          style={{ width: size, height: size }}
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={mascot.poster}
            className={`absolute inset-0 w-full h-full ${noClip ? "object-contain" : "object-cover object-center"}`}
          >
            <source src={mascot.video} type="video/mp4" />
          </video>
          {/* Subtle edge vignette only — skip for unclipped (large comparison) avatars */}
          {!noClip && (
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, transparent 55%, rgba(0,0,0,0.35) 100%)" }}
            />
          )}
        </div>
      );
    }

    // Image mascot (only if src exists)
    if (mascot.src) {
      // Determine if we need to flip: if faceRight is specified and doesn't match natural orientation
      const needsFlip = faceRight !== undefined && faceRight !== mascot.facesRight;

      return (
        <div
          className={`flex items-center justify-center shrink-0 overflow-hidden ${noClip ? "" : "rounded-full"} ${className}`}
          style={{ width: size, height: size }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mascot.src}
            alt={botTypeId || "Bot"}
            width={size}
            height={size}
            className={noClip ? "object-contain" : "object-cover"}
            style={needsFlip ? { transform: "scaleX(-1)" } : undefined}
          />
        </div>
      );
    }
    // No src — fall through to SVG animal
  }

  // Fallback to SVG animal
  const animal = ANIMALS[getAnimalIndex(agentId)];
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {animal.render(size)}
    </div>
  );
}

// Export for use in ComparisonChart and other places that need raw avatar data
export function getAvatarGradient(agentId: string, botTypeId?: string): string {
  if (botTypeId && BOT_TYPE_MASCOTS[botTypeId]) return BOT_TYPE_MASCOTS[botTypeId].gradient;
  return ANIMALS[getAnimalIndex(agentId)].gradient;
}

export function getAvatarAccent(agentId: string, botTypeId?: string): string {
  if (botTypeId && BOT_TYPE_MASCOTS[botTypeId]) return BOT_TYPE_MASCOTS[botTypeId].accent;
  return ANIMALS[getAnimalIndex(agentId)].accent;
}

export function getBotMascotSrc(botTypeId: string): string | undefined {
  return BOT_TYPE_MASCOTS[botTypeId]?.src;
}

export { ANIMALS, getAnimalIndex };
