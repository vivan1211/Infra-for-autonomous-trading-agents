'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { wsManager, type WebSocketMessage } from '@/lib/websocket';
import {
  type SignalStage,
  STAGE_ORDER,
  extractTicker,
  classifyStage,
  isKillSignal,
  extractSide,
  extractConfidence,
  extractEdge,
} from '@/lib/signal-utils';

export interface SignalCard {
  id: string;
  ticker: string;
  marketTitle?: string;
  agentId?: string;
  stage: SignalStage;
  status: 'active' | 'passed' | 'killed';
  killReason?: string;
  side?: 'YES' | 'NO';
  confidence?: number;
  edge?: number;
  amount?: number;
  environment?: 'training' | 'actual';
  timestamps: Partial<Record<SignalStage, number>>;
  lastUpdate: number;
  snippet?: string;
}

export interface PipelineStats {
  scanned: number;
  filtered: number;
  debated: number;
  approved: number;
  executed: number;
  killed: number;
}

const CARD_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Singleton signal cards state — persists across tab switches.
 * Without this, switching from Signals tab to Terminal tab and back
 * would unmount the hook and lose all cards.
 */
const _globalState = {
  cards: new Map<string, SignalCard>(),
  scanCount: 0,
  listeners: new Set<() => void>(),
};

function _notify() {
  _globalState.listeners.forEach((fn) => fn());
}

function _processMessage(msg: WebSocketMessage) {
  if (msg.type !== 'log') return;

  const text = String(msg.message || '');
  if (!text) return;

  const stage = classifyStage(text);
  if (!stage) return;

  // Scan stage: accumulate counter
  if (stage === 'scan') {
    const countMatch = text.match(/(\d+)\s*(?:eligible\s+)?markets/i);
    if (countMatch) {
      const n = parseInt(countMatch[1], 10);
      // Use the larger of current or new count (accumulate across batches)
      _globalState.scanCount = Math.max(_globalState.scanCount, n);
    }
    _notify();
    return;
  }

  // For other stages, we need a ticker
  const ticker = extractTicker(text);
  if (!ticker) return;

  const now = Date.now();
  const kill = isKillSignal(text);
  // Key by (agent, ticker) so multiple agents on the same market get separate cards
  const cardKey = msg.agent_id ? `${msg.agent_id}:${ticker}` : ticker;
  const existing = _globalState.cards.get(cardKey);

  // Extract market_title from WS message or parse from log text
  let wsMarketTitle = msg.market_title ? String(msg.market_title) : undefined;
  if (!wsMarketTitle && ticker) {
    // Parse title from "Debating: TICKER Question text..." log messages
    const debateMatch = text.match(/Debating:\s*\S+\s+(.+?)\.{0,3}$/);
    if (debateMatch) wsMarketTitle = debateMatch[1].trim();
  }

  if (existing) {
    const updated = { ...existing, lastUpdate: now };
    if (msg.agent_id && !updated.agentId) updated.agentId = msg.agent_id as string;
    if (wsMarketTitle && !updated.marketTitle) updated.marketTitle = wsMarketTitle;

    // Advance stage if further in pipeline
    const existingIdx = STAGE_ORDER.indexOf(existing.stage);
    const newIdx = STAGE_ORDER.indexOf(stage);
    if (newIdx > existingIdx) {
      updated.stage = stage;
      updated.timestamps = { ...updated.timestamps, [stage]: now };
    }

    // Extract metadata
    const side = extractSide(text);
    if (side) updated.side = side;
    const conf = extractConfidence(text);
    if (conf !== null) updated.confidence = conf;
    const edge = extractEdge(text);
    if (edge !== null) updated.edge = edge;

    // Extract amount
    const amountMatch = text.match(/(?:size|amount|total_cost|count)[=:\s]+\$?([\d.]+)/i);
    if (amountMatch) updated.amount = parseFloat(amountMatch[1]);

    // Extract environment
    if (/live_mode=True|actual|LIVE/i.test(text)) updated.environment = 'actual';
    else if (/PAPER|training|live_mode=False/i.test(text)) updated.environment = 'training';

    // Kill detection
    if (kill.killed) {
      updated.status = 'killed';
      updated.killReason = kill.reason;
    } else if (stage === 'exec' && updated.status !== 'killed') {
      updated.status = 'passed';
    }

    // Capture snippet from debate stage
    if (stage === 'debate' && text.length > 10) {
      updated.snippet = text.slice(0, 80);
    }

    _globalState.cards.set(cardKey, updated);
  } else {
    // Create new card
    const amountMatchNew = text.match(/(?:size|amount|total_cost|count)[=:\s]+\$?([\d.]+)/i);
    const envActual = /live_mode=True|actual|LIVE/i.test(text);
    const envTraining = /PAPER|training|live_mode=False/i.test(text);
    const card: SignalCard = {
      id: `${ticker}-${now}`,
      ticker,
      marketTitle: wsMarketTitle,
      agentId: msg.agent_id as string | undefined,
      stage,
      status: kill.killed ? 'killed' : 'active',
      killReason: kill.killed ? kill.reason : undefined,
      side: extractSide(text) ?? undefined,
      confidence: extractConfidence(text) ?? undefined,
      edge: extractEdge(text) ?? undefined,
      amount: amountMatchNew ? parseFloat(amountMatchNew[1]) : undefined,
      environment: envActual ? 'actual' : envTraining ? 'training' : undefined,
      timestamps: { [stage]: now },
      lastUpdate: now,
      snippet: stage === 'debate' ? text.slice(0, 80) : undefined,
    };
    _globalState.cards.set(cardKey, card);
  }

  _notify();
}

// Single global WebSocket subscription (not per-hook-instance)
let _subscribed = false;

function _ensureSubscribed() {
  if (_subscribed) return;
  wsManager.subscribe((msg) => _processMessage(msg));
  _subscribed = true;
}

export function useSignalCards(agentId?: string) {
  const [, forceUpdate] = useState(0);
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  useEffect(() => {
    // Subscribe to global state changes
    const listener = () => forceUpdate((n) => n + 1);
    _globalState.listeners.add(listener);

    // Ensure WebSocket subscription (always global — filter at read level)
    _ensureSubscribed();

    return () => {
      _globalState.listeners.delete(listener);
      // Don't unsubscribe from WS — keep listening even when tab switches
    };
  }, []);

  // Expire old cards periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      Array.from(_globalState.cards.entries()).forEach(([key, card]) => {
        if (now - card.lastUpdate > CARD_EXPIRY_MS) {
          _globalState.cards.delete(key);
          changed = true;
        }
      });
      if (changed) _notify();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Compute derived values — filter by agentId at read level
  const allCards = Array.from(_globalState.cards.values()).sort(
    (a, b) => b.lastUpdate - a.lastUpdate
  );
  const cardList = agentId
    ? allCards.filter((c) => c.agentId === agentId)
    : allCards;
  const scanCount = _globalState.scanCount;

  const stats: PipelineStats = {
    scanned: scanCount,
    filtered: cardList.filter((c) => STAGE_ORDER.indexOf(c.stage) >= 1).length,
    debated: cardList.filter((c) => STAGE_ORDER.indexOf(c.stage) >= 2).length,
    approved: cardList.filter(
      (c) => STAGE_ORDER.indexOf(c.stage) >= 3 && c.status !== 'killed'
    ).length,
    executed: cardList.filter((c) => c.status === 'passed').length,
    killed: cardList.filter((c) => c.status === 'killed').length,
  };

  const clearCards = useCallback(() => {
    _globalState.cards.clear();
    _globalState.scanCount = 0;
    _notify();
  }, []);

  return { cards: cardList, scanCount, stats, clearCards };
}
