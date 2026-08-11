'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSignalCards, type SignalCard } from '@/hooks/use-signal-cards';
import { type SignalStage, STAGE_ORDER, STAGE_META, shortTickerName } from '@/lib/signal-utils';
import { getAvatarAccent } from '@/components/BotAvatar';

/* ── Constants ── */
const MAX_LANES = 10;
const HEADER_H = 28;
const LANE_H = 28;
const PAD_X = 16;
const DOT_R = 4;
const FADE_DURATION = 2000; // ms
const DEFAULT_COLOR = '#60a5fa';

/* Stage positions (0..1 normalised) */
const STAGE_X: Record<SignalStage, number> = {
  scan: 0.0,
  filter: 0.17,
  debate: 0.33,
  rules: 0.50,
  queue: 0.67,
  exec: 1.0,
};

/* ── Track line state (mutable, lives in ref) ── */
interface TrackLine {
  cardId: string;
  ticker: string;
  lane: number;
  color: string;
  currentX: number;   // 0..1
  targetX: number;    // 0..1
  speed: number;      // normalised units / sec
  status: 'active' | 'killed' | 'passed';
  killStage?: SignalStage;
  fadeAlpha: number;   // 1 → 0
  fading: boolean;
  label?: string;
}

/**
 * Signal Race Track — canvas-based real-time pipeline visualisation.
 * Each signal animates left→right across stage markers.
 */
export function SignalRaceTrack({ agentId }: { agentId?: string }) {
  const { cards } = useSignalCards(agentId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    lines: Map<string, TrackLine>;
    lanes: (string | null)[];
    lastFrame: number;
    animId: number;
  }>({
    lines: new Map(),
    lanes: Array(MAX_LANES).fill(null),
    lastFrame: 0,
    animId: 0,
  });

  /* ── Helpers ── */
  const assignLane = useCallback((cardId: string): number => {
    const { lanes, lines } = stateRef.current;
    // Already assigned?
    const existing = Array.from(lines.values()).find((l) => l.cardId === cardId);
    if (existing !== undefined) return existing.lane;
    // Find free lane
    for (let i = 0; i < lanes.length; i++) {
      if (!lanes[i]) { lanes[i] = cardId; return i; }
      const occupant = lines.get(lanes[i]!);
      if (!occupant || occupant.fadeAlpha <= 0) { lanes[i] = cardId; return i; }
    }
    // All full — reuse most-faded
    let bestIdx = 0;
    let bestAlpha = 2;
    for (let i = 0; i < lanes.length; i++) {
      const occupant = lanes[i] ? lines.get(lanes[i]!) : null;
      const a = occupant ? occupant.fadeAlpha : 0;
      if (a < bestAlpha) { bestAlpha = a; bestIdx = i; }
    }
    lanes[bestIdx] = cardId;
    return bestIdx;
  }, []);

  const colorForCard = useCallback((card: SignalCard): string => {
    if (card.agentId) return getAvatarAccent(card.agentId);
    return DEFAULT_COLOR;
  }, []);

  /* ── Sync hook data → track lines ── */
  const syncCards = useCallback((cards: SignalCard[]) => {
    const { lines } = stateRef.current;
    const seen = new Set<string>();

    for (const card of cards) {
      seen.add(card.ticker);
      const existing = lines.get(card.ticker);
      const target = STAGE_X[card.stage] ?? 0;

      if (existing) {
        // Update target
        existing.targetX = target;
        if (card.status === 'killed' && existing.status !== 'killed') {
          existing.status = 'killed';
          existing.killStage = card.stage;
          existing.label = card.marketTitle ? (card.marketTitle.length > 20 ? card.marketTitle.slice(0, 18) + '...' : card.marketTitle) : shortTickerName(card.ticker);
          existing.fading = true;
        } else if (card.status === 'passed' && existing.status !== 'passed') {
          existing.status = 'passed';
          existing.targetX = 1;
          existing.label = card.marketTitle ? (card.marketTitle.length > 20 ? card.marketTitle.slice(0, 18) + '...' : card.marketTitle) : shortTickerName(card.ticker);
          existing.fading = true;
        }
      } else {
        // New line
        const lane = assignLane(card.ticker);
        const line: TrackLine = {
          cardId: card.ticker,
          ticker: card.ticker,
          lane,
          color: colorForCard(card),
          currentX: 0,
          targetX: target,
          speed: 0.3 + Math.random() * 0.5, // 0.3–0.8 normalised/sec
          status: card.status === 'killed' ? 'killed' : card.status === 'passed' ? 'passed' : 'active',
          fadeAlpha: 1,
          fading: card.status !== 'active',
          label: card.status !== 'active' ? (card.marketTitle ? (card.marketTitle.length > 20 ? card.marketTitle.slice(0, 18) + '...' : card.marketTitle) : shortTickerName(card.ticker)) : undefined,
          killStage: card.status === 'killed' ? card.stage : undefined,
        };
        lines.set(card.ticker, line);
      }
    }
  }, [assignLane, colorForCard]);

  /* ── Draw ── */
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => {
    const { lines, lanes } = stateRef.current;
    const trackLeft = PAD_X;
    const trackRight = w - PAD_X;
    const trackW = trackRight - trackLeft;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // --- Stage markers ---
    for (const stage of STAGE_ORDER) {
      const meta = STAGE_META[stage];
      const x = trackLeft + STAGE_X[stage] * trackW;

      // Vertical line
      ctx.beginPath();
      if (stage === 'exec') {
        ctx.strokeStyle = '#00C807';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = meta.color + '4D'; // 30% alpha
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
      }
      ctx.moveTo(x, HEADER_H);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = stage === 'exec' ? '#00C807' : meta.color;
      ctx.textAlign = stage === 'scan' ? 'left' : stage === 'exec' ? 'right' : 'center';
      ctx.fillText(meta.label, x, 14);
    }

    // --- Lines ---
    const toRemove: string[] = [];

    lines.forEach((line) => {
      // Animate position
      if (line.currentX < line.targetX) {
        line.currentX = Math.min(line.currentX + line.speed * dt, line.targetX);
      }

      // Fade
      if (line.fading) {
        // Wait until line reaches target before fading
        if (line.currentX >= line.targetX - 0.01) {
          line.fadeAlpha -= dt / (FADE_DURATION / 1000);
        }
      }

      if (line.fadeAlpha <= 0) {
        toRemove.push(line.cardId);
        return;
      }

      const y = HEADER_H + 8 + line.lane * LANE_H + LANE_H / 2;
      const headX = trackLeft + line.currentX * trackW;
      const tailX = trackLeft; // tail always at start

      // Gradient line
      const grad = ctx.createLinearGradient(tailX, 0, headX, 0);
      grad.addColorStop(0, hexToRgba(line.color, 0));
      grad.addColorStop(0.7, hexToRgba(line.color, 0.4 * line.fadeAlpha));
      grad.addColorStop(1, hexToRgba(line.color, 0.8 * line.fadeAlpha));
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.moveTo(tailX, y);
      ctx.lineTo(headX, y);
      ctx.stroke();

      // Leading dot
      ctx.beginPath();
      let dotColor = line.color;
      if (line.status === 'killed') dotColor = '#FF6B8A';
      if (line.status === 'passed') dotColor = '#00C807';
      ctx.fillStyle = hexToRgba(dotColor, line.fadeAlpha);
      ctx.arc(headX, y, DOT_R, 0, Math.PI * 2);
      ctx.fill();

      // Kill × or exec ✓
      if (line.status === 'killed') {
        const kx = line.killStage ? trackLeft + STAGE_X[line.killStage] * trackW : headX;
        ctx.strokeStyle = hexToRgba('#FF6B8A', line.fadeAlpha);
        ctx.lineWidth = 1.5;
        const s = 4;
        ctx.beginPath();
        ctx.moveTo(kx - s, y - s); ctx.lineTo(kx + s, y + s);
        ctx.moveTo(kx + s, y - s); ctx.lineTo(kx - s, y + s);
        ctx.stroke();

        // Label
        if (line.label) {
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = hexToRgba('#FF6B8A', line.fadeAlpha * 0.9);
          ctx.textAlign = 'left';
          ctx.fillText(line.label + '?', kx + 10, y + 4);
        }
      } else if (line.status === 'passed') {
        const ex = trackLeft + trackW; // finish line
        ctx.strokeStyle = hexToRgba('#00C807', line.fadeAlpha);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - 5, y); ctx.lineTo(ex - 2, y + 4); ctx.lineTo(ex + 5, y - 4);
        ctx.stroke();

        if (line.label) {
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = hexToRgba('#00C807', line.fadeAlpha * 0.9);
          ctx.textAlign = 'right';
          ctx.fillText(line.label, ex - 12, y + 4);
        }
      }
    });

    // Cleanup
    for (const id of toRemove) {
      lines.delete(id);
      const laneIdx = lanes.indexOf(id);
      if (laneIdx >= 0) lanes[laneIdx] = null;
    }
  }, []);

  /* ── Animation loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d')!;
    let running = true;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    };

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);
    resizeCanvas();

    const loop = (ts: number) => {
      if (!running) return;
      const st = stateRef.current;
      const dt = st.lastFrame ? (ts - st.lastFrame) / 1000 : 0.016;
      st.lastFrame = ts;

      const rect = container.getBoundingClientRect();
      draw(ctx, rect.width, rect.height, dt);

      st.animId = requestAnimationFrame(loop);
    };
    stateRef.current.animId = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(stateRef.current.animId);
      ro.disconnect();
    };
  }, [draw]);

  /* ── Sync cards on change ── */
  useEffect(() => {
    syncCards(cards);
  }, [cards, syncCards]);

  const canvasH = HEADER_H + 8 + MAX_LANES * LANE_H + 8;

  return (
    <div
      ref={containerRef}
      className="w-full bg-black rounded-lg"
      style={{ height: canvasH }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

/* ── Utility ── */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
