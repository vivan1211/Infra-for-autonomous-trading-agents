'use client';

import { useState } from 'react';
import { useSignalCards, type SignalCard as SignalCardType } from '@/hooks/use-signal-cards';
import { type SignalStage, STAGE_ORDER, STAGE_META } from '@/lib/signal-utils';
import { SignalCard } from './SignalCard';
import { SignalDetailModal } from './SignalDetailModal';

export function SignalCardsView({ agentId }: { agentId?: string }) {
  const { cards, scanCount, stats, clearCards } = useSignalCards(agentId);
  const [selectedCard, setSelectedCard] = useState<SignalCardType | null>(null);

  const byStage: Record<SignalStage, SignalCardType[]> = {
    scan: [], filter: [], debate: [], rules: [], queue: [], exec: [],
  };
  for (const card of cards) {
    byStage[card.stage].push(card);
  }

  const hasAnyData = scanCount > 0 || cards.length > 0;

  return (
    <div className="flex flex-col h-full p-3">
      {/* Stats bar */}
      {hasAnyData && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {STAGE_ORDER.map((stage) => {
              const meta = STAGE_META[stage];
              const count = stage === 'scan' ? scanCount : byStage[stage].length;
              if (count === 0) return null;
              return (
                <span key={stage} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[#666]">{meta.label}</span>
                  <span className="text-white/60 tabular-nums">{count}</span>
                </span>
              );
            })}
            {stats.killed > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B8A]" />
                <span className="text-[#666]">KILLED</span>
                <span className="text-[#FF6B8A]/60 tabular-nums">{stats.killed}</span>
              </span>
            )}
          </div>
          <button onClick={clearCards} className="text-[11px] text-[#555] hover:text-[#888] transition-colors shrink-0">Clear</button>
        </div>
      )}

      {/* Stages — vertical stack */}
      {hasAnyData ? (
        <div className="flex-1 overflow-y-auto space-y-2">
          {STAGE_ORDER.map((stage) => {
            const meta = STAGE_META[stage];
            const isScan = stage === 'scan';
            const stageCards = byStage[stage];
            const count = isScan ? scanCount : stageCards.length;
            if (count === 0 && !isScan) return null;

            return (
              <div key={stage} className="rounded-lg border" style={{ borderColor: `${meta.color}15` }}>
                {/* Stage header */}
                <div className="flex items-center justify-between px-3 py-1.5" style={{ background: meta.bgTint }}>
                  <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-[10px] font-mono tabular-nums" style={{ color: `${meta.color}90` }}>{count}</span>
                </div>
                {/* Cards grid */}
                {isScan ? (
                  count > 0 && (
                    <div className="px-3 py-2 text-[12px]" style={{ color: meta.color }}>
                      <span className="font-bold tabular-nums">{count}</span>
                      <span className="text-[#666] ml-1">markets scanned</span>
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2">
                    {stageCards.map((card) => <SignalCard key={card.id} card={card} onClick={setSelectedCard} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[13px] text-[#555]">Signal pipeline will activate when agents are running</div>
            <div className="text-[11px] text-[#333] mt-1">Signals flow through Scan → Filter → Debate → Rules → Queue → Execute</div>
          </div>
        </div>
      )}

      {selectedCard && <SignalDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  );
}
