'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useTrades } from '@/hooks/use-trades';
import { useDebounce } from '@/hooks/use-debounce';
import type { Trade } from '@/lib/api';

function relativeTime(ts: string): string {
  const then = new Date(ts).getTime();
  if (isNaN(then)) return '';
  const now = Date.now();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

interface SearchRowProps {
  trade: Trade;
  idx: number;
  isHighlighted: boolean;
  onHover: (idx: number) => void;
  onSelect: (id: string) => void;
}

function SearchRow({ trade, idx, isHighlighted, onHover, onSelect }: SearchRowProps) {
  const side = (trade.side || '').toLowerCase();
  // Polymarket tickers are raw hex contract addresses (e.g. 0x8cec42fa4…) —
  // ugly and meaningless to users. Kalshi tickers are human-readable
  // (NVDA, FED-RATE, KX-TRUMP-2024) and worth surfacing. Hide hex, show readable.
  const ticker = trade.market_ticker || '';
  const showTicker = !!ticker && !ticker.startsWith('0x');
  const title = trade.market_title || 'Untitled trade';
  return (
    <li
      role="option"
      id={`trade-row-${idx}`}
      aria-selected={isHighlighted}
      onMouseEnter={() => onHover(idx)}
      onMouseDown={(e) => {
        // Use onMouseDown + preventDefault so input doesn't blur and trigger
        // click-outside-close before router.push fires.
        e.preventDefault();
        onSelect(trade.id);
      }}
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
        isHighlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]',
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-text-primary truncate leading-tight">
          {title}
        </span>
        {showTicker && (
          <span className="text-[11px] text-text-tertiary font-mono truncate leading-tight">
            {ticker}
          </span>
        )}
      </div>
      <span className="flex items-center gap-2 shrink-0">
        {side && (
          <span
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
              side === 'yes' ? 'bg-gain/20 text-gain' : 'bg-loss/20 text-loss',
            )}
          >
            {side}
          </span>
        )}
        <span className="text-[11px] text-text-tertiary tabular-nums">
          {relativeTime(trade.timestamp)}
        </span>
      </span>
    </li>
  );
}

export function SearchTrades() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 220);
  const searchTerm = debouncedQuery.trim();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastNonEmptyRef = useRef<Trade[]>([]);

  const { trades, loading } = useTrades({
    search: searchTerm || undefined,
    per_page: searchTerm ? 8 : 6,
  });

  // Keep the last non-empty search result so we don't flash an empty dropdown
  // between keystrokes while a new fetch is in flight. Only cached while a
  // query is active — when the user clears the query, discard the cache so
  // stale search hits don't leak into the recent-trades view.
  useEffect(() => {
    if (searchTerm && !loading && trades.length > 0) {
      lastNonEmptyRef.current = trades;
    }
    if (!searchTerm) {
      lastNonEmptyRef.current = [];
    }
  }, [trades, loading, searchTerm]);

  const displayTrades: Trade[] =
    loading && searchTerm && trades.length === 0 && lastNonEmptyRef.current.length > 0
      ? lastNonEmptyRef.current
      : trades;

  // Reset highlight when the effective query changes.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [debouncedQuery]);

  // Clamp highlight if the result set shrinks (e.g. 8 → 2 items).
  useEffect(() => {
    setHighlightedIndex((i) => (i >= displayTrades.length ? -1 : i));
  }, [displayTrades.length]);

  // Scroll highlighted row into view.
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  // Click-outside to close.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function navigateTo(tradeId: string) {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
    router.push(`/trades/${tradeId}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      e.preventDefault();
      return;
    }
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (displayTrades.length === 0) return;
        setHighlightedIndex((i) => (i + 1) % displayTrades.length);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (displayTrades.length === 0) return;
        setHighlightedIndex((i) => (i <= 0 ? displayTrades.length - 1 : i - 1));
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (displayTrades.length === 0) return;
        const target =
          displayTrades[highlightedIndex >= 0 ? highlightedIndex : 0];
        navigateTo(target.id);
        break;
      }
      case 'Escape': {
        // Input already has focus when Escape is pressed (keydown is on
        // the input). No focus restoration needed — adding one would
        // create a brittle trap if rows ever become focusable.
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      }
    }
  }

  const hasQuery = !!searchTerm;
  const showSpinner = isOpen && hasQuery && loading;
  const showEmpty =
    isOpen && hasQuery && !loading && trades.length === 0;
  const showNoRecents =
    isOpen && !hasQuery && !loading && displayTrades.length === 0;

  const headerLabel = hasQuery
    ? `Results${trades.length > 0 ? ` · ${trades.length}` : ''}`
    : 'Recent trades';

  const activeDescendant =
    highlightedIndex >= 0 ? `trade-row-${highlightedIndex}` : undefined;

  return (
    <div
      ref={rootRef}
      className="relative w-[420px] mr-8 shrink-0 hidden md:block"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="search-trades-listbox"
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        className="w-full h-9 bg-transparent border border-border rounded-lg text-[13px] text-text-primary pl-9 pr-3 placeholder:text-text-tertiary outline-none focus:outline-none focus:border-border focus:ring-0 focus-visible:outline-none focus-visible:ring-0 transition-colors"
      />

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+4px)] w-full bg-[#141414] border border-border rounded-lg shadow-lg py-1 z-50 max-h-[420px] overflow-y-auto">
          <div className="flex items-center justify-between px-3 pt-2 pb-1.5 text-[11px] uppercase tracking-wider text-text-tertiary font-medium">
            <span>{headerLabel}</span>
            <div className="flex items-center gap-2">
              {showSpinner && (
                <Loader2 className="w-3 h-3 animate-spin text-text-tertiary" />
              )}
              {!hasQuery && (
                <Link
                  href="/trades"
                  onMouseDown={(e) => {
                    // Preserve focus until navigation fires, consistent with row clicks.
                    e.preventDefault();
                    setIsOpen(false);
                    router.push('/trades');
                  }}
                  className="text-[11px] normal-case tracking-normal text-text-secondary hover:text-text-primary transition-colors underline underline-offset-2"
                >
                  Show all
                </Link>
              )}
            </div>
          </div>

          {showNoRecents && (
            <div className="px-3 py-6 text-center text-[13px] text-text-tertiary">
              No recent trades yet
            </div>
          )}

          {showEmpty && (
            <div className="px-3 py-6 text-center text-[13px] text-text-tertiary">
              No trades match &lsquo;{searchTerm}&rsquo;
            </div>
          )}

          {displayTrades.length > 0 && (
            <ul
              ref={listRef}
              id="search-trades-listbox"
              role="listbox"
              className="py-0.5"
            >
              {displayTrades.map((trade, idx) => (
                <SearchRow
                  key={trade.id}
                  trade={trade}
                  idx={idx}
                  isHighlighted={idx === highlightedIndex}
                  onHover={setHighlightedIndex}
                  onSelect={navigateTo}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
