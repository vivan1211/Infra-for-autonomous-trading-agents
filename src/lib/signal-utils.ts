/**
 * Signal Cards — Utilities for parsing WebSocket log messages
 * into pipeline stage classifications and extracting ticker symbols.
 */

export type SignalStage = 'scan' | 'filter' | 'debate' | 'rules' | 'queue' | 'exec';

export const STAGE_ORDER: SignalStage[] = ['scan', 'filter', 'debate', 'rules', 'queue', 'exec'];

export const STAGE_META: Record<SignalStage, { label: string; color: string; bgTint: string }> = {
  scan:   { label: 'SCAN',   color: '#60a5fa', bgTint: 'rgba(96,165,250,0.08)' },
  filter: { label: 'FILTER', color: '#22d3ee', bgTint: 'rgba(34,211,238,0.08)' },
  debate: { label: 'DEBATE', color: '#fb923c', bgTint: 'rgba(251,146,60,0.08)' },
  rules:  { label: 'RULES',  color: '#eab308', bgTint: 'rgba(234,179,8,0.08)' },
  queue:  { label: 'QUEUE',  color: '#a855f7', bgTint: 'rgba(168,85,247,0.08)' },
  exec:   { label: 'EXEC',   color: '#00C807', bgTint: 'rgba(193,255,0,0.08)' },
};

// Kalshi tickers: uppercase letters + digits, with hyphens separating segments
// Examples: KXBTC-25MAR21-T105999.99, KXELECTION-2024-TRUMP, INX-TSLA-25MAR21
// Broader pattern: 2+ uppercase letters followed by more alphanumeric + hyphens (min 6 chars total)
const TICKER_RE = /\b([A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9.]+)+)\b/;
// Polymarket condition IDs: 0x-prefixed hex strings (42 chars)
const POLY_TICKER_RE = /\b(0x[a-fA-F0-9]{40,64})\b/;

// Common false positives to exclude
const TICKER_BLACKLIST = new Set([
  'POSITION-LIMITS', 'CASH-RESERVES', 'EDGE-APPROVED', 'EDGE-REJECTED',
  'RULES-PASSED', 'ACCOUNT-CHECK', 'SELL-LIMIT', 'PAPER-TRADE',
  'BEAST-MODE', 'STOP-LOSS', 'TAKE-PROFIT',
]);

/**
 * Extract a market ticker from a log line (Kalshi or Polymarket).
 * Returns null if no ticker found.
 */
export function extractTicker(text: string): string | null {
  // Try Kalshi format first (most common)
  const match = text.match(TICKER_RE);
  if (match) {
    const ticker = match[1];
    if (!TICKER_BLACKLIST.has(ticker) && ticker.length >= 6) return ticker;
  }
  // Try Polymarket condition ID format
  const polyMatch = text.match(POLY_TICKER_RE);
  if (polyMatch) return polyMatch[1];
  return null;
}

/**
 * Classify a log line into a pipeline stage.
 * Returns null for lines that don't map to any stage.
 */
export function classifyStage(text: string): SignalStage | null {
  // Execution — most specific, check first
  if (/TRADE EXECUTED|Executed position|order placed|Order sent|SELL LIMIT ORDER placed|✅.*(?:order|trade|executed)/i.test(text)) return 'exec';
  if (/PAPER TRADE|live_mode=|Trading mode check/i.test(text)) return 'exec';

  // Rules engine — check BEFORE queue so skipped/blocked signals go to rules
  if (/rules_result|BLOCKED|REJECTED|SKIPPING|Checking rules|RULES PASSED|ACCOUNT CHECK|Tier \d+ rules|rules failed|allowed_categories/i.test(text)) return 'rules';
  if (/POSITION LIMITS|CASH RESERVES|Position count|portfolio usage/i.test(text)) return 'rules';

  // Queue / intercept
  if (/Queued|intercept|pending.*order|Sending order|queue_id/i.test(text)) return 'queue';

  // Debate / AI analysis
  if (/Debate|debate.*starting|Council|Bull:|Bear:|Forecaster|News Analyst|Risk Manager|Trader:|ensemble|Running.*model|predicted_prob|Agent received response|BULL CASE|BEAR CASE|RISK ASSESSMENT|FINAL DECISION/i.test(text)) return 'debate';

  // Edge / volume filter
  if (/EDGE APPROVED|EDGE REJECTED|edge.*%|edge_pct|edge calculation/i.test(text)) return 'filter';
  if (/Limited to top|Filtered.*already-decided|already-decided markets|Analyzing \d+ markets|markets across all strategies/i.test(text)) return 'filter';

  // Scanning
  if (/eligible markets|Fetched.*markets|upserted|markets to process|Scanning|Found.*markets|Ingestion complete/i.test(text)) return 'scan';

  return null;
}

/**
 * Detect if a log line signals that a card should be killed (rejected/failed).
 */
export function isKillSignal(text: string): { killed: boolean; reason?: string } {
  if (/BLOCKED/i.test(text)) return { killed: true, reason: 'Blocked by rules' };
  if (/REJECTED/i.test(text)) return { killed: true, reason: 'Rejected' };
  if (/EDGE REJECTED/i.test(text)) return { killed: true, reason: 'No edge' };
  if (/SKIPPING/i.test(text)) return { killed: true, reason: 'Skipped' };
  if (/rules failed/i.test(text)) {
    const match = text.match(/rules failed[:\s]*(\w+)/i);
    return { killed: true, reason: match ? `Rules: ${match[1]}` : 'Rules failed' };
  }
  if (/Failed|❌|Error executing/i.test(text)) return { killed: true, reason: 'Execution failed' };
  if (/POSITION COUNT LIMIT|POSITION SIZE LIMIT/i.test(text)) return { killed: true, reason: 'Position limit' };
  if (/CASH RESERVES BLOCK|CASH RESERVES INSUFFICIENT/i.test(text)) return { killed: true, reason: 'Insufficient cash' };
  return { killed: false };
}

/**
 * Extract side (YES/NO) from log text.
 */
export function extractSide(text: string): 'YES' | 'NO' | null {
  const match = text.match(/\bside[=:\s]+(yes|no)\b/i) || text.match(/\b(YES|NO)\b.*(?:position|order|trade)/i);
  if (match) return match[1].toUpperCase() as 'YES' | 'NO';
  return null;
}

/**
 * Extract confidence value (0-1 or 0-100) from log text.
 */
export function extractConfidence(text: string): number | null {
  const match = text.match(/confidence[=:\s]+([\d.]+)/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return val > 1 ? val : Math.round(val * 100);
}

/**
 * Extract edge percentage from log text.
 */
export function extractEdge(text: string): number | null {
  const match = text.match(/edge[=:\s]+([\d.]+)%/i) || text.match(/edge_pct[=:\s]+([\d.]+)/i);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Turn a Kalshi ticker into a short readable name.
 */
export function shortTickerName(ticker: string): string {
  if (!ticker) return 'Unknown';
  // Polymarket condition IDs — show truncated hex
  if (ticker.startsWith('0x')) return `${ticker.slice(0, 6)}...${ticker.slice(-4)}`;
  // Strip common prefixes
  let cleaned = ticker.replace(/^(KX|INX|FED|CPI)/, '');
  // Remove date segments (e.g., -25MAR21, -2026, -26MAR17)
  cleaned = cleaned.replace(/-\d{2}[A-Z]{3}\d{2}/g, '').replace(/-\d{4}/g, '');
  // Remove trailing segments that are just numbers/codes (e.g., -T105999.99, -1, -R)
  cleaned = cleaned.replace(/-[A-Z]?\d+[\d.]*$/g, '').replace(/-[A-Z]$/g, '');
  // Split remaining by hyphen and take the meaningful part
  const parts = cleaned.split('-').filter(p => p.length > 0);
  const main = parts.join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)/g, (m) => m.charAt(0) + m.slice(1).toLowerCase())
    .trim();
  return main.length > 25 ? main.slice(0, 23) + '...' : main || ticker.slice(0, 20);
}
