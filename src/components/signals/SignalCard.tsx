'use client';

import { type SignalCard as SignalCardType } from '@/hooks/use-signal-cards';
import { STAGE_META, shortTickerName } from '@/lib/signal-utils';

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

export function SignalCard({ card, onClick }: { card: SignalCardType; onClick?: (card: SignalCardType) => void }) {
  const meta = STAGE_META[card.stage];
  const isKilled = card.status === 'killed';
  const isPassed = card.status === 'passed';

  const borderColor = isKilled ? '#FF6B8A' : isPassed ? '#00C807' : meta.color;

  return (
    <div
      className="group relative rounded-lg border px-3 py-2.5 transition-all duration-200 hover:translate-y-[-1px] cursor-pointer"
      onClick={() => onClick?.(card)}
      style={{
        borderColor: `${borderColor}30`,
        background: isKilled
          ? 'rgba(255,107,138,0.04)'
          : isPassed
          ? 'rgba(193,255,0,0.04)'
          : `${meta.bgTint}`,
      }}
    >
      {/* Top row: ticker + side badge */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          className={`text-[12px] font-semibold truncate ${isKilled ? 'line-through opacity-50' : ''}`}
          style={{ color: isKilled ? '#FF6B8A' : '#fff' }}
          title={card.marketTitle || card.ticker}
        >
          {card.marketTitle
            ? (card.marketTitle.length > 30 ? card.marketTitle.slice(0, 28) + '...' : card.marketTitle)
            : shortTickerName(card.ticker)}
        </span>
        {card.side && (
          <span
            className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              background: card.side === 'YES' ? 'rgba(193,255,0,0.12)' : 'rgba(255,107,138,0.12)',
              color: card.side === 'YES' ? '#00C807' : '#FF6B8A',
            }}
          >
            {card.side}
          </span>
        )}
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-[11px]">
        {card.confidence != null && (
          <span className="text-[#999]">
            <span className="text-[#666]">conf</span>{' '}
            <span className="text-white/70">{card.confidence}%</span>
          </span>
        )}
        {card.edge != null && (
          <span className="text-[#999]">
            <span className="text-[#666]">edge</span>{' '}
            <span className="text-white/70">{card.edge.toFixed(1)}%</span>
          </span>
        )}
        <span className="ml-auto text-[#555]">{timeAgo(card.lastUpdate)}</span>
      </div>

      {/* Kill reason */}
      {isKilled && card.killReason && (
        <div className="mt-1.5 text-[10px] text-[#FF6B8A]/70 truncate">
          {card.killReason}
        </div>
      )}

      {/* Passed indicator */}
      {isPassed && (
        <div className="mt-1.5 text-[10px] text-[#00C807]/70">
          Executed
        </div>
      )}

      {/* Executed details */}
      {isPassed && card.amount && (
        <div className="mt-0.5 text-[10px] text-[#00C807]/50">
          ${card.amount.toFixed(2)} {card.environment === 'actual' ? '· LIVE' : card.environment === 'training' ? '· TRAINING' : ''}
        </div>
      )}

      {/* Snippet */}
      {card.snippet && !isKilled && !isPassed && (
        <div className="mt-1.5 text-[10px] text-[#666] truncate">
          {card.snippet}
        </div>
      )}

      {/* Stage timeline dots on hover */}
      <div className="absolute -bottom-1 left-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {(['filter', 'debate', 'rules', 'queue', 'exec'] as const).map((s) => (
          <div
            key={s}
            className="h-[3px] flex-1 rounded-full"
            style={{
              background: card.timestamps[s]
                ? STAGE_META[s].color
                : '#222',
            }}
          />
        ))}
      </div>
    </div>
  );
}
