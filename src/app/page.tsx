"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { Loader2 } from "lucide-react";

/* ─── Particle Globe Canvas ─── */
function ParticleGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Generate points on upper hemisphere of a sphere (half-dome)
    const NUM_POINTS = 2000;
    const points: { theta: number; phi: number }[] = [];
    for (let i = 0; i < NUM_POINTS; i++) {
      // Fibonacci sphere — only keep upper hemisphere (y >= 0)
      const y = 1 - (i / (NUM_POINTS - 1)) * 2;
      if (y < -0.05) continue; // keep top half + a tiny bit below equator
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const theta = goldenAngle * i;
      const phi = Math.acos(Math.max(-1, Math.min(1, y)));
      points.push({ theta, phi });
    }

    let rotation = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      rotation += 0.0015;

      const cx = width / 2;
      // Globe center sits at the very bottom of the canvas so only the top dome is visible
      const cy = height + width * 0.12;
      // Large radius — spans most of the viewport width
      const radius = width * 0.48;

      for (const p of points) {
        const x3d = Math.sin(p.phi) * Math.cos(p.theta + rotation);
        const y3d = Math.cos(p.phi);
        const z3d = Math.sin(p.phi) * Math.sin(p.theta + rotation);

        const screenX = cx + x3d * radius;
        const screenY = cy - y3d * radius;

        // Skip points below canvas
        if (screenY > height + 4) continue;

        // Depth-based opacity and size
        const depth = (z3d + 1) / 2; // 0 (back) to 1 (front)
        if (depth < 0.1) continue; // cull backside

        const alpha = 0.15 + depth * 0.7;
        const size = 1 + depth * 2;

        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}

/* ─── Animated Network Mesh (Permissionless card) ─── */
function AnimatedMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Generate mesh nodes in a roughly spherical cluster
    const NUM_NODES = 40;
    const nodes: { bx: number; by: number; bz: number }[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 0.5 + Math.random() * 0.5;
      nodes.push({
        bx: r * Math.sin(phi) * Math.cos(theta),
        by: r * Math.sin(phi) * Math.sin(theta),
        bz: r * Math.cos(phi),
      });
    }

    // Pre-compute edges (connect close nodes)
    const edges: [number, number][] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      for (let j = i + 1; j < NUM_NODES; j++) {
        const dx = nodes[i].bx - nodes[j].bx;
        const dy = nodes[i].by - nodes[j].by;
        const dz = nodes[i].bz - nodes[j].bz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 0.7) edges.push([i, j]);
      }
    }

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      t += 0.008;

      const cx = width * 0.5;
      const cy = height * 0.5;
      const scale = Math.min(width, height) * 0.42;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);

      // Project nodes
      const projected = nodes.map((n) => {
        const rx = n.bx * cosT - n.bz * sinT;
        const rz = n.bx * sinT + n.bz * cosT;
        const ry = n.by;
        const depth = (rz + 1.5) / 3;
        return {
          x: cx + rx * scale,
          y: cy + ry * scale,
          depth,
        };
      });

      // Draw edges — bolder white lines
      for (const [i, j] of edges) {
        const a = projected[i];
        const b = projected[j];
        const alpha = Math.min(a.depth, b.depth) * 0.5;
        if (alpha < 0.05) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw nodes — larger, bolder
      for (const p of projected) {
        if (p.depth < 0.1) continue;
        const r = 3 + p.depth * 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.depth * 0.85})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Animated Isometric Blocks (Developer card) ─── */
function AnimatedBlocks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Isometric block positions (grid x, grid y, stack height, phase)
    const blocks: { gx: number; gy: number; gz: number; phase: number }[] = [
      // Base layer (platform)
      { gx: 0, gy: 0, gz: 0, phase: 0 },
      { gx: 1, gy: 0, gz: 0, phase: 0.3 },
      { gx: 2, gy: 0, gz: 0, phase: 0.6 },
      { gx: 0, gy: 1, gz: 0, phase: 0.2 },
      { gx: 1, gy: 1, gz: 0, phase: 0.5 },
      { gx: 2, gy: 1, gz: 0, phase: 0.8 },
      { gx: 0, gy: 2, gz: 0, phase: 0.4 },
      { gx: 1, gy: 2, gz: 0, phase: 0.7 },
      { gx: 2, gy: 2, gz: 0, phase: 1.0 },
      // Stacked blocks
      { gx: 1, gy: 1, gz: 1, phase: 1.5 },
      { gx: 2, gy: 1, gz: 1, phase: 1.8 },
      { gx: 1, gy: 2, gz: 1, phase: 2.0 },
      { gx: 2, gy: 2, gz: 1, phase: 2.3 },
      // Top
      { gx: 2, gy: 2, gz: 2, phase: 3.0 },
      { gx: 1, gy: 2, gz: 2, phase: 3.3 },
    ];

    let t = 0;

    const toIso = (gx: number, gy: number, gz: number, cx: number, cy: number, s: number) => {
      const ix = (gx - gy) * s * 0.866;
      const iy = (gx + gy) * s * 0.5 - gz * s;
      return { x: cx + ix, y: cy + iy };
    };

    const drawBlock = (cx: number, cy: number, s: number, alpha: number) => {
      const h = s * 0.85;
      const sw = s * 0.866;
      const strokeAlpha = Math.min(1, alpha * 0.8);
      ctx.strokeStyle = `rgba(255,255,255,${strokeAlpha})`;
      ctx.lineWidth = 1.8;

      // Top face (no fill — wireframe only)
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.5);
      ctx.lineTo(cx + sw, cy);
      ctx.lineTo(cx, cy + h * 0.5);
      ctx.lineTo(cx - sw, cy);
      ctx.closePath();
      ctx.stroke();

      // Right face
      ctx.beginPath();
      ctx.moveTo(cx + sw, cy);
      ctx.lineTo(cx + sw, cy + h);
      ctx.lineTo(cx, cy + h * 0.5 + h);
      ctx.lineTo(cx, cy + h * 0.5);
      ctx.closePath();
      ctx.stroke();

      // Left face
      ctx.beginPath();
      ctx.moveTo(cx - sw, cy);
      ctx.lineTo(cx - sw, cy + h);
      ctx.lineTo(cx, cy + h * 0.5 + h);
      ctx.lineTo(cx, cy + h * 0.5);
      ctx.closePath();
      ctx.stroke();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      t += 0.016;

      const centerX = width * 0.5;
      const centerY = height * 0.42;
      const blockSize = Math.min(width, height) * 0.14;

      // Sort blocks back-to-front for proper overlap
      const sorted = [...blocks].sort((a, b) => (a.gx + a.gy + a.gz) - (b.gx + b.gy + b.gz));

      for (const block of sorted) {
        const floatZ = Math.sin(t * 1.5 + block.phase) * 3;
        const pos = toIso(block.gx, block.gy, block.gz, centerX, centerY, blockSize);
        const alpha = 0.6 + Math.sin(t * 1.2 + block.phase) * 0.4;
        drawBlock(pos.x, pos.y + floatZ, blockSize, alpha);
      }

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Animated Spiral / Concentric Circles (Speed card) ─── */
function AnimatedSpiral() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      t += 0.003;

      const cx = width * 0.48;
      const cy = height * 0.52;
      const maxR = Math.min(width, height) * 0.44;

      // Concentric circles — bold white wireframe
      const numRings = 7;
      for (let i = 1; i <= numRings; i++) {
        const r = (i / numRings) * maxR;
        const alpha = 0.12 + (i / numRings) * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Spiral arms (logarithmic spiral lines radiating out)
      const numArms = 8;
      for (let arm = 0; arm < numArms; arm++) {
        const baseAngle = (arm / numArms) * Math.PI * 2 + t * 2;
        ctx.beginPath();
        let first = true;
        for (let s = 0; s < 200; s++) {
          const frac = s / 200;
          const r = frac * maxR;
          // Spiral: angle increases with radius
          const angle = baseAngle + frac * Math.PI * 1.8;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (first) { ctx.moveTo(px, py); first = false; }
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.18 + Math.sin(t + arm) * 0.06})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Floating Particles Background (Section 5 CTA) ─── */
function FloatingParticlesBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0002,
        vy: (Math.random() - 0.5) * 0.0002,
        size: Math.random() * 2.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.fill();
      }
      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

/* ─── Horizontal Scroll Carousel ─── */
function FeatureCarousel({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    return () => el.removeEventListener("scroll", checkScroll);
  }, []);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 500, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-white/90 transition"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-white/90 transition"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

/* ─── Auto-cycling Wireframe UI Screens (Section 2) ─── */
function WireframeScreens() {
  const [activeScreen, setActiveScreen] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveScreen((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const tl = "text-white/30";
  const td = "text-white/12";

  const screens = [
    // Screen 1: Deploy Bot — with real labels
    <div key="deploy" className="space-y-3.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] uppercase tracking-widest ${tl}`}>Deploy Agent</span>
        <span className={`text-[10px] ${td}`}>Step 1 of 3</span>
      </div>
      {/* Bot selector */}
      <div className="rounded-lg border border-white/[0.06] p-3.5">
        <span className={`text-[10px] uppercase tracking-wider ${td}`}>Select Strategy</span>
        <div className="flex items-center gap-3 mt-2.5">
          <div className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center">
            <span className={`text-[10px] ${tl}`}>🤖</span>
          </div>
          <div className="flex-1">
            <span className={`text-[12px] ${tl}`}>The Council</span>
            <p className={`text-[9px] ${td} mt-0.5`}>6-agent ensemble • Kalshi</p>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-white/15"><path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        </div>
      </div>
      {/* Exchange */}
      <div className="rounded-lg border border-white/[0.06] p-3.5">
        <span className={`text-[10px] uppercase tracking-wider ${td}`}>Exchange</span>
        <div className="flex gap-2.5 mt-2.5">
          <div className="flex-1 rounded-md border border-white/10 py-2 px-3 text-center">
            <span className={`text-[11px] ${tl}`}>Kalshi</span>
          </div>
          <div className="flex-1 rounded-md border border-white/[0.05] py-2 px-3 text-center">
            <span className={`text-[11px] ${td}`}>Polymarket</span>
          </div>
        </div>
      </div>
      {/* Mode */}
      <div className="rounded-lg border border-white/[0.06] p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-[10px] uppercase tracking-wider ${td}`}>Mode</span>
            <p className={`text-[11px] ${tl} mt-1`}>Paper Trading</p>
          </div>
          <div className="w-8 h-4 rounded-full border border-white/10 relative">
            <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
      {/* Deploy CTA */}
      <div className="h-10 rounded-full border border-white/10 flex items-center justify-center mt-1">
        <span className={`text-[11px] ${tl}`}>Deploy Agent →</span>
      </div>
    </div>,

    // Screen 2: Trades — with readable data
    <div key="trades" className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[11px] uppercase tracking-widest ${tl}`}>Recent Trades</span>
        <span className={`text-[10px] ${td}`}>Last 24h</span>
      </div>
      {/* Column headers */}
      <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.05]">
        <span className={`text-[9px] uppercase tracking-wider ${td} w-[38%]`}>Market</span>
        <span className={`text-[9px] uppercase tracking-wider ${td} w-[18%] text-center`}>Side</span>
        <span className={`text-[9px] uppercase tracking-wider ${td} w-[22%] text-right`}>Price</span>
        <span className={`text-[9px] uppercase tracking-wider ${td} w-[22%] text-right`}>P&L</span>
      </div>
      {/* Trade rows with real-looking data */}
      {[
        { market: "Fed rate cut Jun", side: "YES", price: "$0.58", pnl: "+$24", pos: true },
        { market: "BTC > $100k Q3", side: "YES", price: "$0.72", pnl: "+$18", pos: true },
        { market: "Recession 2026", side: "NO", price: "$0.35", pnl: "−$12", pos: false },
        { market: "ETH merge delay", side: "NO", price: "$0.82", pnl: "+$31", pos: true },
        { market: "S&P new ATH Jul", side: "YES", price: "$0.44", pnl: "−$8", pos: false },
      ].map((row, i) => (
        <div key={i} className="flex items-center gap-2 py-2 border-b border-white/[0.03]">
          <span className={`text-[10px] ${tl} w-[38%] truncate`}>{row.market}</span>
          <span className={`text-[9px] w-[18%] text-center ${row.side === "YES" ? "text-white/25" : "text-white/15"}`}>{row.side}</span>
          <span className={`text-[10px] ${td} w-[22%] text-right tabular-nums`}>{row.price}</span>
          <span className={`text-[10px] w-[22%] text-right tabular-nums ${row.pos ? "text-white/25" : "text-white/12"}`}>{row.pnl}</span>
        </div>
      ))}
      {/* Summary */}
      <div className="flex items-center justify-between pt-3 mt-1">
        <div>
          <span className={`text-[9px] ${td} block`}>Total Trades</span>
          <span className={`text-[13px] ${tl}`}>47</span>
        </div>
        <div className="text-right">
          <span className={`text-[9px] ${td} block`}>Win Rate</span>
          <span className={`text-[13px] ${tl}`}>68%</span>
        </div>
        <div className="text-right">
          <span className={`text-[9px] ${td} block`}>Net P&L</span>
          <span className={`text-[13px] text-white/25`}>+$284</span>
        </div>
      </div>
    </div>,

    // Screen 3: Portfolio — with chart and positions
    <div key="portfolio" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] uppercase tracking-widest ${tl}`}>Portfolio</span>
        <div className="flex gap-1.5">
          {["1D", "1W", "1M", "All"].map((p, i) => (
            <span key={p} className={`text-[9px] px-2 py-0.5 rounded ${i === 2 ? "border border-white/10 text-white/25" : `${td}`}`}>{p}</span>
          ))}
        </div>
      </div>
      {/* Portfolio value */}
      <div>
        <span className={`text-[18px] ${tl} tabular-nums`}>$12,847</span>
        <span className="text-[10px] text-white/20 ml-2">+$284 (2.3%)</span>
      </div>
      {/* Chart */}
      <div className="h-20 rounded-lg border border-white/[0.04] relative overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 400 80" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wf-grad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <polygon points="0,60 30,55 70,50 110,52 150,42 190,45 230,35 270,38 310,28 350,32 400,22 400,80 0,80" fill="url(#wf-grad2)" />
          <polyline points="0,60 30,55 70,50 110,52 150,42 190,45 230,35 270,38 310,28 350,32 400,22" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        </svg>
      </div>
      {/* Open positions */}
      <span className={`text-[10px] uppercase tracking-wider ${td}`}>Open Positions</span>
      {[
        { name: "Fed rate cut Jun", exchange: "Kalshi", side: "YES", val: "$340" },
        { name: "BTC > $100k Q3", exchange: "Polymarket", side: "YES", val: "$520" },
        { name: "ETH merge delay", exchange: "Kalshi", side: "NO", val: "$180" },
      ].map((pos, i) => (
        <div key={i} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.03]">
          <div className="w-5 h-5 rounded border border-white/8 flex items-center justify-center">
            <span className={`text-[8px] ${td}`}>{pos.exchange[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className={`text-[10px] ${tl} block truncate`}>{pos.name}</span>
            <span className={`text-[8px] ${td}`}>{pos.exchange} • {pos.side}</span>
          </div>
          <span className={`text-[10px] ${tl} tabular-nums`}>{pos.val}</span>
        </div>
      ))}
    </div>,
  ];

  return (
    <div className="relative w-full max-w-[380px]">
      {/* Phone/app frame wireframe */}
      <div className="rounded-2xl border border-white/[0.07] p-5 min-h-[420px]" style={{ background: "rgba(255,255,255,0.015)" }}>
        {/* Screen content with fade transition */}
        <div className="relative">
          {screens.map((screen, i) => (
            <div
              key={i}
              className="transition-all duration-700 ease-in-out"
              style={{
                opacity: activeScreen === i ? 1 : 0,
                position: activeScreen === i ? "relative" : "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: activeScreen === i ? "translateY(0)" : "translateY(8px)",
              }}
            >
              {screen}
            </div>
          ))}
        </div>
      </div>
      {/* Step indicators */}
      <div className="flex justify-center gap-2 mt-5">
        {["Deploy", "Trades", "Portfolio"].map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveScreen(i)}
            className={`text-[10px] tracking-wider uppercase transition-all duration-300 px-2.5 py-1 rounded-full border ${
              activeScreen === i
                ? "text-white/50 border-white/15"
                : "text-white/15 border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/portfolio");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (showVideoModal) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [showVideoModal]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Video Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVideoModal(false)}>
          <div className="relative w-full max-w-3xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-sans font-medium text-lg">Prediction Market Agents Explained</h3>
              <button onClick={() => setShowVideoModal(false)} className="text-white/50 hover:text-white transition">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="relative w-full rounded-xl overflow-hidden bg-black border border-white/10" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/rehvNpq0XD4?autoplay=1"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 bg-black/80 backdrop-blur-md border-b border-white/5">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M25.7 11.2c.5-.1.9-.1 1.3 0 .1-1.1-.3-2.1-1.1-2.8-.8-.7-1.9-.9-2.9-.6l-6.1 1.8c-.5.1-.9.1-1.3 0L9.5 7.8c-1-.3-2.1-.1-2.9.6-.8.7-1.2 1.7-1.1 2.8.4-.1.9-.1 1.3 0l6.1 1.8c.5.1 1 .5 1.2 1l2 5.8c.3 1 1.3 1.6 2.3 1.6s2-.6 2.3-1.6l2-5.8c.2-.5.6-.9 1.2-1l1.8-.8z" fill="white"/>
          </svg>
          <span className="font-sans font-bold text-lg tracking-tight">Prediction Market Agents</span>
        </div>
        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <a href="/login" className="px-5 py-2 text-sm font-medium text-white hover:text-white/80 transition">
            Log in
          </a>
        </div>
      </nav>

      {/* ── Section 1: Hero ── */}
      <section className="relative overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
        <div className="relative z-10 flex flex-col items-center justify-center text-center pt-16 md:pt-20 px-6">
          {/* Logo lockup */}
          <div className="flex items-center gap-3 mb-8">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M25.7 11.2c.5-.1.9-.1 1.3 0 .1-1.1-.3-2.1-1.1-2.8-.8-.7-1.9-.9-2.9-.6l-6.1 1.8c-.5.1-.9.1-1.3 0L9.5 7.8c-1-.3-2.1-.1-2.9.6-.8.7-1.2 1.7-1.1 2.8.4-.1.9-.1 1.3 0l6.1 1.8c.5.1 1 .5 1.2 1l2 5.8c.3 1 1.3 1.6 2.3 1.6s2-.6 2.3-1.6l2-5.8c.2-.5.6-.9 1.2-1l1.8-.8z" fill="white"/>
            </svg>
            <span className="text-xl md:text-2xl font-sans font-bold tracking-tight">Prediction Market Agents</span>
          </div>

          {/* Main headline */}
          <h1
            className="font-serif text-[clamp(2.2rem,5.5vw,4.5rem)] leading-[1] tracking-[-0.02em] mb-8"
          >
            Deploy Trading Agents
          </h1>

          {/* Subtitle */}
          <p className="text-white/60 text-base md:text-lg max-w-xl leading-relaxed mb-10">
            Prediction Market Agents is the infrastructure to deploy, test, and
            benchmark trading agents.
          </p>

          {/* CTAs */}
          <div className="relative z-10 flex items-center gap-4">
            <a href="/signup" className="px-8 py-3.5 rounded-full bg-[#00C807] text-black font-medium text-sm hover:bg-[#00e008] transition-colors inline-block">
              Get Started
            </a>
            <button
              onClick={() => setShowVideoModal(true)}
              className="px-6 py-3.5 rounded-full border border-white/20 text-white text-sm font-medium hover:border-white/40 transition flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l6 4-6 4V4z" fill="white"/></svg>
              Watch Video
            </button>
          </div>
        </div>

        {/* Particle Globe — positioned to start just below the CTA area */}
        <div className="absolute bottom-0 left-0 w-full" style={{ height: "60%" }}>
          <ParticleGlobe />
        </div>
      </section>

      {/* ── Section 2: Feature Showcase (split layout) ── */}
      <section className="relative overflow-hidden bg-black py-32 md:py-40">
        {/* Background: smooth radial glow centered on right side */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 70% at 65% 50%, rgba(15,30,60,0.6) 0%, rgba(6,10,22,0.3) 50%, transparent 100%)",
          }}
        />

        <div className="relative max-w-[1400px] mx-auto px-8 md:px-12 lg:px-24 flex flex-col md:flex-row items-center justify-between gap-16">
          {/* Left: Text content */}
          <div className="md:w-[42%] z-10">
            <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.1] tracking-[-0.02em] mb-7">
              Autonomous trading
              <br />for everyone
            </h2>
            <p className="text-white/50 text-[15px] md:text-[17px] leading-[1.8] max-w-[420px]">
              In less than three clicks, you can deploy your own AI trading agents.
              They execute trades, explain their reasoning, and improve over time.
            </p>
          </div>

          {/* Right: Auto-cycling wireframe UI screens */}
          <div className="relative w-full md:w-[52%] h-[420px] md:h-[520px] flex items-center justify-center">
            <WireframeScreens />
          </div>
        </div>

      </section>

      {/* ── Section 3: Modern Infrastructure ── */}
      <section className="py-28 md:py-36">
        {/* Headline */}
        <div className="text-center px-6 mb-20">
          <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.05] tracking-[-0.02em]">
            Using AI to Trade<br />Live Markets
          </h2>
        </div>

        {/* Feature Cards Carousel */}
        <div className="px-6 md:px-10 lg:px-20 max-w-[1400px] mx-auto">
          <FeatureCarousel>
            {/* Card: Permissionless by design */}
            <div className="relative flex-shrink-0 w-[85vw] md:w-[42vw] lg:w-[38vw] rounded-2xl overflow-hidden border border-white/[0.08] snap-start" style={{ height: "720px" }}>
              {/* Transparent — black inherits from page bg */}
              <div className="relative z-10 px-8 md:px-10 pt-8">
                <h3 className="font-sans font-medium text-xl md:text-2xl text-white mb-2">
                  Explore Agents
                </h3>
                <p className="text-white/50 text-sm md:text-[15px] leading-relaxed max-w-sm">
                  Discover a range of trading agents, each built around a distinct strategy,
                  from arbitrage to whale tracking.
                </p>
              </div>
              {/* Animated mesh network */}
              <div className="absolute bottom-0 left-0 w-full h-[68%]">
                <AnimatedMesh />
              </div>
            </div>

            {/* Card: Made for developers */}
            <div className="relative flex-shrink-0 w-[85vw] md:w-[42vw] lg:w-[38vw] rounded-2xl overflow-hidden border border-white/[0.08] snap-start" style={{ height: "720px" }}>
              {/* Transparent — black inherits from page bg */}
              <div className="relative z-10 px-8 md:px-10 pt-8">
                <h3 className="font-sans font-medium text-xl md:text-2xl text-white mb-2">
                  Deploy Agents
                </h3>
                <p className="text-white/50 text-sm md:text-[15px] leading-relaxed max-w-sm">
                  Set rules, allocate capital, and deploy agents to trade live
                  on Kalshi and Polymarket.
                </p>
              </div>
              {/* Animated isometric blocks */}
              <div className="absolute bottom-0 left-0 w-full h-[68%]">
                <AnimatedBlocks />
              </div>
            </div>

            {/* Card: Speed you can rely on */}
            <div className="relative flex-shrink-0 w-[85vw] md:w-[42vw] lg:w-[38vw] rounded-2xl overflow-hidden border border-white/[0.08] snap-start" style={{ height: "720px" }}>
              {/* Transparent — black inherits from page bg */}
              <div className="relative z-10 px-8 md:px-10 pt-8">
                <h3 className="font-sans font-medium text-xl md:text-2xl text-white mb-2">
                  Review Reasoning
                </h3>
                <p className="text-white/50 text-sm md:text-[15px] leading-relaxed max-w-sm">
                  Inspect full trade reasoning, benchmark performance,
                  and improve agents over time.
                </p>
              </div>
              {/* Animated spiral / concentric circles */}
              <div className="absolute bottom-0 left-0 w-full h-[68%]">
                <AnimatedSpiral />
              </div>
            </div>
          </FeatureCarousel>
        </div>
      </section>

      {/* ── Section 4: Build with trusted partners ── */}
      <section className="py-28 md:py-36 px-6">
        <div className="max-w-[1100px] mx-auto text-center">
          <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.05] tracking-[-0.02em] mb-8">
            Live on Prediction Markets
          </h2>
          <p className="text-white/50 text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-20">
            Today, Prediction Market Agents lets you deploy trading agents on prediction markets,
            with crypto and fantasy sports coming next.
          </p>

          {/* Exchange logos — Kalshi and Polymarket */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-16 md:gap-24 max-w-[600px] mx-auto">
            {/* Kalshi */}
            <div className="text-white">
              <span className="text-3xl md:text-4xl font-sans font-bold tracking-tight">Kalshi</span>
            </div>
            {/* Polymarket */}
            <div className="text-white">
              <span className="text-3xl md:text-4xl font-sans font-bold tracking-tight">Polymarket</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Join the next generation CTA ── */}
      <section className="relative py-28 md:py-36 overflow-hidden">
        {/* Floating particles background */}
        <div className="absolute inset-0">
          <FloatingParticlesBg />
        </div>
        <div className="relative z-10 text-center px-6">
          <h2 className="font-serif text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.05] tracking-[-0.02em] mb-10">
            Join the next generation<br />of AI native trading.
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/signup" className="px-8 py-3.5 rounded-full bg-[#00C807] text-black font-medium text-sm hover:bg-[#00e008] transition-colors inline-block">
              Get Started
            </a>
            <button
              onClick={() => setShowVideoModal(true)}
              className="px-6 py-3.5 rounded-full border border-white/20 text-white text-sm font-medium hover:border-white/40 transition flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l6 4-6 4V4z" fill="white"/></svg>
              Watch Video
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#00C807] text-black">
        <div className="px-8 md:px-12 lg:px-24 pt-16 pb-12 max-w-[1400px] mx-auto">
          {/* Footer columns */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-24 mb-16">
            {/* About */}
            <div>
              <h4 className="font-sans font-bold text-[15px] mb-6 tracking-tight">About</h4>
              <ul className="space-y-3.5">
                {[
                  { label: "What is Prediction Market Agents?", href: "/about/overview" },
                  { label: "How It Works", href: "/about/how-it-works" },
                  { label: "Strategies", href: "/about/strategies" },
                  { label: "System Architecture", href: "/about/architecture" },
                  { label: "Safeguards & Rules", href: "/about/safeguards" },
                ].map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-[14px] text-black/60 hover:text-black transition">{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            {/* Account */}
            <div>
              <h4 className="font-sans font-bold text-[15px] mb-6 tracking-tight">Account</h4>
              <ul className="space-y-3.5">
                {[
                  { label: "Sign In", href: "/login" },
                  { label: "Sign Up", href: "/signup" },
                  { label: "Connecting Your Account", href: "/about/connecting-account" },
                  { label: "Training vs Live Mode", href: "/about/training-vs-live" },
                ].map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-[14px] text-black/60 hover:text-black transition">{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            {/* Legal */}
            <div>
              <h4 className="font-sans font-bold text-[15px] mb-6 tracking-tight">Legal</h4>
              <ul className="space-y-3.5">
                {[
                  { label: "Terms of Service", href: "/terms" },
                  { label: "Privacy Policy", href: "/privacy" },
                ].map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-[14px] text-black/60 hover:text-black transition">{item.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Legal disclaimer */}
          <div className="border-t border-black/10 pt-8">
            <p className="text-[11px] text-black/45 leading-[1.7] max-w-4xl">
              Prediction Market Agents is an experimental AI-powered trading platform provided for informational and educational purposes only.
              It does not constitute financial advice, investment advice, or any other form of professional advice.
              Trading in prediction markets involves substantial risk of loss and is not suitable for all individuals.
              Past performance of AI agents is not indicative of future results. You are solely responsible for your
              trading decisions and any losses incurred. Prediction Market Agents makes no guarantees regarding the accuracy, completeness,
              or reliability of any AI-generated analysis or trade execution. By using this platform, you acknowledge and accept
              all associated risks.
            </p>
            <p className="text-[11px] text-black/35 mt-4">
              &copy; 2026 Prediction Market Agents. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* ── Giant Brand Wordmark ── */}
      <div className="bg-[#00C807]">
        <div className="relative pb-2" style={{ height: "clamp(110px, 18vw, 280px)" }}>
          <span
            className="absolute bottom-0 left-0 right-0 font-sans font-bold text-black whitespace-nowrap"
            style={{ fontSize: "clamp(80px, 16vw, 320px)", lineHeight: "0.85" }}
          >
            Prediction Market Agents
          </span>
        </div>
      </div>
    </div>
  );
}
