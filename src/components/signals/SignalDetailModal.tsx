'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { type SignalCard } from '@/hooks/use-signal-cards';
import { STAGE_ORDER, STAGE_META, shortTickerName } from '@/lib/signal-utils';

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function SignalDetailModal({ card, onClose }: { card: SignalCard; onClose: () => void }) {
  const meta = STAGE_META[card.stage];
  const isKilled = card.status === 'killed';
  const isPassed = card.status === 'passed';

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[420px] mx-4 bg-black border border-white/[0.12] rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h3 className="text-[15px] font-bold text-white">{card.marketTitle || shortTickerName(card.ticker)}</h3>
            <p className="text-[11px] text-white/40 font-mono mt-0.5">{card.ticker}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: meta.bgTint, color: meta.color }}
            >
              {isKilled ? 'KILLED' : isPassed ? 'EXECUTED' : meta.label}
            </span>
            {card.side && (
              <span
                className="text-[11px] font-bold px-2 py-1 rounded"
                style={{
                  background: card.side === 'YES' ? 'rgba(193,255,0,0.12)' : 'rgba(255,107,138,0.12)',
                  color: card.side === 'YES' ? '#00C807' : '#FF6B8A',
                }}
              >
                {card.side}
              </span>
            )}
          </div>

          {/* Amount & Environment */}
          {(card.amount || card.environment) && (
            <div className="flex items-center gap-3">
              {card.amount && (
                <span className="text-[12px] text-white/60">
                  <span className="text-white/30">Size</span> ${card.amount.toFixed(2)}
                </span>
              )}
              {card.environment && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  card.environment === 'actual'
                    ? 'bg-gain/10 text-gain'
                    : 'bg-blue-500/10 text-blue-400'
                }`}>
                  {card.environment === 'actual' ? 'LIVE' : 'TRAINING'}
                </span>
              )}
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {card.confidence != null && (
              <div className="border border-border rounded-lg px-3 py-2 bg-black">
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Confidence</div>
                <div className="text-[16px] font-semibold text-white tabular-nums">{card.confidence}%</div>
              </div>
            )}
            {card.edge != null && (
              <div className="border border-border rounded-lg px-3 py-2 bg-black">
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Edge</div>
                <div className="text-[16px] font-semibold text-white tabular-nums">{card.edge.toFixed(1)}%</div>
              </div>
            )}
          </div>

          {/* Kill reason */}
          {isKilled && card.killReason && (
            <div className="border border-[#FF6B8A]/20 rounded-lg px-3 py-2 bg-[#FF6B8A]/5">
              <div className="text-[10px] text-[#FF6B8A]/60 uppercase tracking-wider mb-1">Reason</div>
              <div className="text-[12px] text-[#FF6B8A]">{card.killReason}</div>
            </div>
          )}

          {/* Snippet */}
          {card.snippet && (
            <div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Latest Activity</div>
              <div className="text-[12px] text-white/60 leading-relaxed">{card.snippet}</div>
            </div>
          )}

          {/* Pipeline timeline */}
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Pipeline Progress</div>
            <div className="flex gap-1">
              {STAGE_ORDER.map((s) => {
                const sMeta = STAGE_META[s];
                const reached = !!card.timestamps[s];
                return (
                  <div key={s} className="flex-1 text-center">
                    <div
                      className="h-[4px] rounded-full mb-1"
                      style={{ background: reached ? sMeta.color : '#222' }}
                    />
                    <div className="text-[9px] uppercase" style={{ color: reached ? sMeta.color : '#333' }}>
                      {sMeta.label}
                    </div>
                    {card.timestamps[s] && (
                      <div className="text-[9px] text-[#555]">{timeAgo(card.timestamps[s]!)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
